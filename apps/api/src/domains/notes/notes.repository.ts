import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  getTableColumns,
  isNull,
  sql,
  tables,
  type NewNote,
} from '../../adapters/database/database.adapter.js';

const { notes, captureRuns } = tables;

/**
 * Each note with the status of its newest capture run (or null): one
 * correlated lookup per note on `capture_runs_note_idx`
 * (owner_user_id, note_id, created_at), inside the same query. The outer
 * columns are written out in full: Drizzle leaves column names unqualified
 * in a one-table select, which would bind them to `capture_runs` instead.
 */
const withCaptureStatus = {
  ...getTableColumns(notes),
  latestCaptureStatus: sql<
    'ready' | 'failed' | 'pending' | 'saved' | null
  >`(SELECT r.status FROM ${captureRuns} AS r WHERE r.owner_user_id = "notes"."owner_user_id" AND r.note_id = "notes"."id" ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1)`,
};

export class NotesRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  list(owner: string) {
    return this.database
      .use()
      .select(withCaptureStatus)
      .from(notes)
      .where(and(eq(notes.ownerUserId, owner), isNull(notes.deletedAt)))
      .orderBy(asc(notes.createdAt), asc(notes.id));
  }

  async find(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select(withCaptureStatus)
      .from(notes)
      .where(
        and(
          eq(notes.id, id),
          eq(notes.ownerUserId, owner),
          isNull(notes.deletedAt),
        ),
      );
    return row;
  }

  async insert(input: NewNote) {
    const [row] = await this.database
      .use()
      .insert(notes)
      .values(input)
      .returning();
    return row;
  }

  /** Conditional on the revision the caller read; `undefined` if it changed. */
  async updateGuarded(
    owner: string,
    id: string,
    expectedRevision: number,
    patch: Partial<NewNote>,
  ) {
    const [row] = await this.database
      .use()
      .update(notes)
      .set({ ...patch, revision: sql`${notes.revision} + 1` })
      .where(
        and(
          eq(notes.id, id),
          eq(notes.ownerUserId, owner),
          eq(notes.revision, expectedRevision),
          isNull(notes.deletedAt),
        ),
      )
      .returning();
    return row;
  }
}
