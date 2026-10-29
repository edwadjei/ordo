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
const latestCaptureStatus = sql<
  'ready' | 'failed' | 'pending' | 'saved' | null
>`(SELECT r.status FROM ${captureRuns} AS r WHERE r.owner_user_id = "notes"."owner_user_id" AND r.note_id = "notes"."id" ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1)`;
const withCaptureStatus = { ...getTableColumns(notes), latestCaptureStatus };

/**
 * A list entry: every column but the body, which can be 100,000 characters,
 * plus its first 280 characters and its length. SQLite's `substr` and
 * `length` count code points, so the preview never splits a character and
 * the full body never leaves D1 (no transfer, no parsing, no JSON).
 */
const { body: _body, ...summaryColumns } = getTableColumns(notes);
const summary = {
  ...summaryColumns,
  preview: sql<string>`substr("notes"."body", 1, 280)`,
  bodyLength: sql<number>`length("notes"."body")`,
  latestCaptureStatus,
};

export class NotesRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  /** Active notes as list entries (no body), oldest first. */
  list(owner: string) {
    return this.database
      .use()
      .select(summary)
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
