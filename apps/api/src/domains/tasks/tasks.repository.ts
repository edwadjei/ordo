import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  insertWhere,
  notInArchivedScope,
  isNull,
  sql,
  tables,
  type NewTask,
  type SQL,
  type TaskRecord,
} from '../../adapters/database/database.adapter.js';

const { tasks, idempotencyKeys, notes } = tables;

/** An ancestor as read for a hierarchy check; its revision guards the save. */
export interface Ancestor {
  id: string;
  revision: number;
  parentId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  deletedAt: string | null;
  depth: number;
}

/** Save preconditions written into the statement itself (check-on-save). */
export interface TaskSaveGuard {
  /** The task's revision the caller read. */
  revision: number;
  /** Refuse while the task still has an active child. */
  noActiveChildren?: boolean;
  /** Ancestors whose revisions must be unchanged and still active. */
  ancestors?: { id: string; revision: number }[];
}

export class TasksRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  /** Active tasks; those in an archived workspace or project only on request. */
  list(owner: string, includeArchived = false) {
    return this.database
      .use()
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.ownerUserId, owner),
          isNull(tasks.deletedAt),
          includeArchived ? undefined : notInArchivedScope('tasks'),
        ),
      )
      .orderBy(asc(tasks.createdAt), asc(tasks.id));
  }

  async find(owner: string, id: string, includeArchived = false) {
    const [row] = await this.database
      .use()
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.ownerUserId, owner),
          includeArchived ? undefined : isNull(tasks.deletedAt),
        ),
      );
    return row;
  }

  /**
   * The parent chain starting at `parentId`, read in one recursive query and
   * bounded to `limit` rows; archived and other owners' rows end the chain.
   */
  async ancestors(owner: string, parentId: string, limit: number) {
    return this.database.use().all<Ancestor>(sql`
      WITH RECURSIVE chain (id, revision, parentId, workspaceId, projectId, deletedAt, depth) AS (
        SELECT id, revision, parent_id, workspace_id, project_id, deleted_at, 0
          FROM ${tasks} WHERE id = ${parentId} AND owner_user_id = ${owner}
        UNION ALL
        SELECT t.id, t.revision, t.parent_id, t.workspace_id, t.project_id, t.deleted_at, chain.depth + 1
          FROM ${tasks} AS t JOIN chain ON t.id = chain.parentId
         WHERE t.owner_user_id = ${owner} AND chain.depth < ${limit}
      )
      SELECT id, revision, parentId, workspaceId, projectId, deletedAt, depth
        FROM chain ORDER BY depth LIMIT ${limit + 1}`);
  }

  /** Whether the owner has this note, archived or not (a task's source). */
  async noteExists(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.ownerUserId, owner)));
    return Boolean(row);
  }

  async hasActiveChildren(owner: string, parentId: string) {
    const [child] = await this.database
      .use()
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.parentId, parentId),
          eq(tasks.ownerUserId, owner),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    return Boolean(child);
  }

  async findIdempotencyKey(owner: string, key: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.ownerUserId, owner),
          eq(idempotencyKeys.key, key),
        ),
      );
    return row;
  }

  /**
   * Inserts the task and its idempotency key in one batch. A subtask is
   * inserted only while its parent is still active, unchanged and in the same
   * destination; the key row is inserted only if the task row was. Returns
   * the saved task, or `undefined` when the guard refused it. A key already
   * used by a concurrent create makes the batch fail with a unique violation
   * and roll back.
   */
  async insertWithKey(
    task: NewTask & { id: string; ownerUserId: string },
    key: { id: string; key: string; fingerprint: string },
    parent?: { id: string; revision: number },
  ): Promise<TaskRecord | undefined> {
    const db = this.database.use();
    const guard = parent
      ? sql`EXISTS (SELECT 1 FROM ${tasks} AS p WHERE p.id = ${parent.id} AND p.owner_user_id = ${task.ownerUserId} AND p.revision = ${parent.revision} AND p.deleted_at IS NULL AND p.workspace_id IS ${task.workspaceId ?? null} AND p.project_id IS ${task.projectId ?? null})`
      : sql`1`;
    const [, , saved] = await db.batch([
      db.run(insertWhere(tasks, [task], guard)),
      db.run(
        insertWhere(
          idempotencyKeys,
          [
            {
              id: key.id,
              ownerUserId: task.ownerUserId,
              key: key.key,
              fingerprint: key.fingerprint,
              taskId: task.id,
            },
          ],
          sql`EXISTS (SELECT 1 FROM ${tasks} WHERE id = ${task.id})`,
        ),
      ),
      db.select().from(tasks).where(eq(tasks.id, task.id)),
    ]);
    return saved[0];
  }

  /**
   * `UPDATE … WHERE id AND owner AND revision = ?` plus any guard; increments
   * the revision. Returns `undefined` when a precondition no longer holds.
   */
  async updateGuarded(
    owner: string,
    id: string,
    patch: Partial<NewTask>,
    guard: TaskSaveGuard,
  ): Promise<TaskRecord | undefined> {
    const [row] = await this.database
      .use()
      .update(tasks)
      .set({ ...patch, revision: sql`${tasks.revision} + 1` })
      .where(this.guarded(owner, id, guard))
      .returning();
    return row;
  }

  /**
   * A destination change that carries the task's subtasks with it, in one
   * batch: the guarded update of the task, then every descendant (archived
   * ones too, so a parent and child never disagree) takes the task's
   * workspace and project as they stand after the first statement. When the
   * guard refuses the task, its descendants already match it and nothing is
   * written. Each moved subtask's revision increases, so a stale edit of one
   * is refused. Returns the saved task, or `undefined` when refused.
   */
  async moveGuarded(
    owner: string,
    id: string,
    patch: Partial<NewTask> & { updatedAt: string },
    guard: TaskSaveGuard,
  ): Promise<TaskRecord | undefined> {
    const db = this.database.use();
    const rootWorkspace = sql`(SELECT r.workspace_id FROM ${tasks} AS r WHERE r.id = ${id})`;
    const rootProject = sql`(SELECT r.project_id FROM ${tasks} AS r WHERE r.id = ${id})`;
    const [saved] = await db.batch([
      db
        .update(tasks)
        .set({ ...patch, revision: sql`${tasks.revision} + 1` })
        .where(this.guarded(owner, id, guard))
        .returning(),
      db.run(sql`
        WITH RECURSIVE subtree (id) AS (
          SELECT id FROM ${tasks} WHERE parent_id = ${id} AND owner_user_id = ${owner}
          UNION
          SELECT t.id FROM ${tasks} AS t JOIN subtree ON t.parent_id = subtree.id
           WHERE t.owner_user_id = ${owner}
        )
        UPDATE ${tasks}
           SET workspace_id = ${rootWorkspace}, project_id = ${rootProject},
               revision = revision + 1, updated_at = ${patch.updatedAt}
         WHERE id IN (SELECT id FROM subtree)
           AND (workspace_id IS NOT ${rootWorkspace} OR project_id IS NOT ${rootProject})`),
    ]);
    return saved[0];
  }

  private guarded(owner: string, id: string, guard: TaskSaveGuard) {
    const conditions: (SQL | undefined)[] = [
      eq(tasks.id, id),
      eq(tasks.ownerUserId, owner),
      eq(tasks.revision, guard.revision),
      isNull(tasks.deletedAt),
    ];
    if (guard.noActiveChildren)
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM ${tasks} AS c WHERE c.parent_id = ${id} AND c.owner_user_id = ${owner} AND c.deleted_at IS NULL)`,
      );
    if (guard.ancestors?.length) {
      const expected = JSON.stringify(
        guard.ancestors.map(({ id, revision }) => ({ id, revision })),
      );
      conditions.push(
        sql`(SELECT count(*) FROM ${tasks} AS a JOIN json_each(${expected}) AS e ON a.id = json_extract(e.value, '$.id') AND a.revision = json_extract(e.value, '$.revision') WHERE a.owner_user_id = ${owner} AND a.deleted_at IS NULL) = ${guard.ancestors.length}`,
      );
    }
    return and(...conditions);
  }
}
