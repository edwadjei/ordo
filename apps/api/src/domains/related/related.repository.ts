import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  isNull,
  ne,
  noteColumns,
  notInArchivedScope,
  sql,
  tables,
  type DraftRecord,
  type TaskRecord,
} from '../../adapters/database/database.adapter.js';

const { tasks, notes, drafts, taskNoteLinks } = tables;
/** Items saved from the same capture, at most. */
const SAME_CAPTURE_LIMIT = 20;

export interface RelatedRows {
  task: { id: string } | undefined;
  sourceNote: Record<string, unknown> | undefined;
  linkedNotes: Record<string, unknown>[];
  captureTasks: TaskRecord[];
  drafts: DraftRecord[];
}

export class RelatedRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  /**
   * A task's related items in one D1 batch: the task itself, its source
   * note, the notes linked to it, and the other tasks and drafts saved from
   * the same source note. Unless `includeArchived`, archived items and items
   * in an archived workspace or project are left out.
   */
  async related(
    owner: string,
    taskId: string,
    includeArchived: boolean,
  ): Promise<RelatedRows> {
    const db = this.database.use();
    const source = sql`(SELECT source_note_id FROM tasks WHERE id = ${taskId} AND owner_user_id = ${owner})`;
    const live = (table: 'tasks' | 'notes' | 'drafts') =>
      includeArchived
        ? undefined
        : sql`"${sql.raw(table)}"."deleted_at" IS NULL AND ${notInArchivedScope(table)}`;
    const [task, sourceNote, linkedNotes, captureTasks, sameDrafts] =
      await db.batch([
        db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.id, taskId),
              eq(tasks.ownerUserId, owner),
              isNull(tasks.deletedAt),
            ),
          ),
        db
          .select(noteColumns.summary)
          .from(notes)
          .where(
            and(
              eq(notes.ownerUserId, owner),
              sql`${notes.id} = ${source}`,
              live('notes'),
            ),
          ),
        db
          .select(noteColumns.summary)
          .from(notes)
          .where(
            and(
              eq(notes.ownerUserId, owner),
              sql`${notes.id} IN (SELECT note_id FROM task_note_links WHERE task_id = ${taskId} AND owner_user_id = ${owner})`,
              live('notes'),
            ),
          )
          .orderBy(asc(notes.createdAt), asc(notes.id)),
        db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.ownerUserId, owner),
              sql`${tasks.sourceNoteId} = ${source}`,
              ne(tasks.id, taskId),
              live('tasks'),
            ),
          )
          .orderBy(asc(tasks.createdAt), asc(tasks.id))
          .limit(SAME_CAPTURE_LIMIT),
        db
          .select()
          .from(drafts)
          .where(
            and(
              eq(drafts.ownerUserId, owner),
              sql`${drafts.sourceNoteId} = ${source}`,
              live('drafts'),
            ),
          )
          .orderBy(asc(drafts.createdAt), asc(drafts.id))
          .limit(SAME_CAPTURE_LIMIT),
      ]);
    return {
      task: task[0],
      sourceNote: sourceNote[0],
      linkedNotes,
      captureTasks,
      drafts: sameDrafts,
    };
  }

  /**
   * Links a note to a task in one batch, only while both are the owner's
   * and active. Returns the link and whether this call created it, or
   * `undefined` when the task or note is missing.
   */
  async link(owner: string, taskId: string, noteId: string, now: string) {
    const db = this.database.use();
    const [inserted, existing] = await db.batch([
      db.all<{ taskId: string; noteId: string; createdAt: string }>(sql`
        INSERT INTO task_note_links (task_id, note_id, owner_user_id, created_at)
        SELECT ${taskId}, ${noteId}, ${owner}, ${now}
         WHERE EXISTS (SELECT 1 FROM tasks WHERE id = ${taskId} AND owner_user_id = ${owner} AND deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM notes WHERE id = ${noteId} AND owner_user_id = ${owner} AND deleted_at IS NULL)
        ON CONFLICT (task_id, note_id) DO NOTHING
        RETURNING task_id AS taskId, note_id AS noteId, created_at AS createdAt`),
      db
        .select({
          taskId: taskNoteLinks.taskId,
          noteId: taskNoteLinks.noteId,
          createdAt: taskNoteLinks.createdAt,
        })
        .from(taskNoteLinks)
        .where(
          and(
            eq(taskNoteLinks.taskId, taskId),
            eq(taskNoteLinks.noteId, noteId),
            eq(taskNoteLinks.ownerUserId, owner),
          ),
        ),
    ]);
    if (inserted[0]) return { link: inserted[0], created: true };
    if (existing[0]) return { link: existing[0], created: false };
    return undefined;
  }

  /** Removes a link; false when there was none. */
  async unlink(owner: string, taskId: string, noteId: string) {
    const rows = await this.database
      .use()
      .delete(taskNoteLinks)
      .where(
        and(
          eq(taskNoteLinks.taskId, taskId),
          eq(taskNoteLinks.noteId, noteId),
          eq(taskNoteLinks.ownerUserId, owner),
        ),
      )
      .returning({ taskId: taskNoteLinks.taskId });
    return rows.length > 0;
  }
}
