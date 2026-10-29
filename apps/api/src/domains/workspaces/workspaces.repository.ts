import { PROJECT_LIMIT, WORKSPACE_LIMIT } from '@ordo/core';
import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  insertWhere,
  isNull,
  tables,
  sql,
  type NewWorkspace,
  type NewProject,
} from '../../adapters/database/database.adapter.js';

const { workspaces, projects } = tables;

export class WorkspacesRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  listWorkspaces(owner: string) {
    return this.database
      .use()
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, owner))
      .orderBy(asc(workspaces.createdAt), asc(workspaces.id));
  }

  async findWorkspace(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, id), eq(workspaces.ownerUserId, owner)));
    return row;
  }

  /**
   * What a workspace create checks first, in one D1 batch: the owner's
   * active workspaces (for the duplicate guard and the limit) and the one a
   * retry key already made.
   */
  async workspaceCreateState(owner: string, key: string | null) {
    const db = this.database.use();
    const [active, byKey] = await db.batch([
      db
        .select()
        .from(workspaces)
        .where(
          and(eq(workspaces.ownerUserId, owner), isNull(workspaces.archivedAt)),
        ),
      db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.ownerUserId, owner),
            eq(workspaces.idempotencyKey, key ?? ''),
          ),
        ),
    ]);
    return { active, byKey: key ? byKey[0] : undefined };
  }

  /**
   * Inserts a workspace only while the owner has fewer than the limit of
   * active workspaces and no active one of the same name (ignoring case),
   * decided inside the statement so two creates at once cannot both pass.
   * Undefined when refused. A retry key already used makes it fail with a
   * unique violation.
   */
  async insertWorkspace(input: NewWorkspace & { ownerUserId: string }) {
    const db = this.database.use();
    const [, saved] = await db.batch([
      db.run(
        insertWhere(
          workspaces,
          [input],
          sql`(SELECT COUNT(*) FROM workspaces WHERE owner_user_id = ${input.ownerUserId} AND archived_at IS NULL) < ${WORKSPACE_LIMIT}
            AND NOT EXISTS (SELECT 1 FROM workspaces WHERE owner_user_id = ${input.ownerUserId} AND archived_at IS NULL
              AND lower(trim(name)) = lower(${input.name}))`,
        ),
      ),
      db.select().from(workspaces).where(eq(workspaces.id, input.id!)),
    ]);
    return saved[0];
  }

  /** Conditional on the revision the caller read; `undefined` if it changed. */
  async updateWorkspace(
    owner: string,
    id: string,
    expectedRevision: number,
    patch: Partial<NewWorkspace>,
  ) {
    const [row] = await this.database
      .use()
      .update(workspaces)
      .set({ ...patch, revision: sql`${workspaces.revision} + 1` })
      .where(
        and(
          eq(workspaces.id, id),
          eq(workspaces.ownerUserId, owner),
          eq(workspaces.revision, expectedRevision),
        ),
      )
      .returning();
    return row;
  }

  /** A workspace and a project in one D1 batch; each undefined if not the owner's. */
  async findScope(owner: string, workspaceId: string, projectId: string) {
    const db = this.database.use();
    const [[workspace], [project]] = await db.batch([
      db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.ownerUserId, owner),
          ),
        ),
      db
        .select()
        .from(projects)
        .where(
          and(eq(projects.id, projectId), eq(projects.ownerUserId, owner)),
        ),
    ]);
    return { workspace, project };
  }

  /**
   * A workspace and its projects in one D1 batch: one round trip instead of
   * two. The workspace is undefined when it is not the owner's.
   */
  async workspaceWithProjects(owner: string, id: string) {
    const db = this.database.use();
    const [[workspace], list] = await db.batch([
      db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.id, id), eq(workspaces.ownerUserId, owner))),
      db
        .select()
        .from(projects)
        .where(
          and(eq(projects.ownerUserId, owner), eq(projects.workspaceId, id)),
        )
        .orderBy(asc(projects.name), asc(projects.id)),
    ]);
    return { workspace, projects: list };
  }

  listProjects(owner: string, workspaceId?: string) {
    return this.database
      .use()
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.ownerUserId, owner),
          workspaceId ? eq(projects.workspaceId, workspaceId) : undefined,
        ),
      )
      .orderBy(asc(projects.name), asc(projects.id));
  }

  async findProject(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerUserId, owner)));
    return row;
  }

  /**
   * What a project create checks first, in one D1 batch: the workspace, its
   * active projects (for the duplicate guard), how many active projects the
   * owner has, and the one a retry key already made.
   */
  async projectCreateState(
    owner: string,
    workspaceId: string,
    key: string | null,
  ) {
    const db = this.database.use();
    const [[workspace], siblings, [count], byKey] = await db.batch([
      db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.ownerUserId, owner),
          ),
        ),
      db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.ownerUserId, owner),
            eq(projects.workspaceId, workspaceId),
            isNull(projects.archivedAt),
          ),
        ),
      db
        .select({ active: sql<number>`count(*)` })
        .from(projects)
        .where(
          and(eq(projects.ownerUserId, owner), isNull(projects.archivedAt)),
        ),
      db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.ownerUserId, owner),
            eq(projects.idempotencyKey, key ?? ''),
          ),
        ),
    ]);
    return {
      workspace,
      siblings,
      active: count?.active ?? 0,
      byKey: key ? byKey[0] : undefined,
    };
  }

  /**
   * Inserts a project only while the owner has fewer than the limit of
   * active projects and its workspace has no active project of the same
   * name (ignoring case), decided inside the statement. Undefined when
   * refused. A retry key already used makes it fail with a unique violation.
   */
  async insertProject(input: NewProject & { ownerUserId: string }) {
    const db = this.database.use();
    const [, saved] = await db.batch([
      db.run(
        insertWhere(
          projects,
          [input],
          sql`(SELECT COUNT(*) FROM projects WHERE owner_user_id = ${input.ownerUserId} AND archived_at IS NULL) < ${PROJECT_LIMIT}
            AND NOT EXISTS (SELECT 1 FROM projects WHERE owner_user_id = ${input.ownerUserId} AND workspace_id = ${input.workspaceId}
              AND archived_at IS NULL AND lower(trim(name)) = lower(${input.name}))`,
        ),
      ),
      db.select().from(projects).where(eq(projects.id, input.id!)),
    ]);
    return saved[0];
  }

  /** Conditional on the revision the caller read; `undefined` if it changed. */
  async updateProject(
    owner: string,
    id: string,
    expectedRevision: number,
    patch: Partial<NewProject>,
  ) {
    const [row] = await this.database
      .use()
      .update(projects)
      .set({ ...patch, revision: sql`${projects.revision} + 1` })
      .where(
        and(
          eq(projects.id, id),
          eq(projects.ownerUserId, owner),
          eq(projects.revision, expectedRevision),
        ),
      )
      .returning();
    return row;
  }
}
