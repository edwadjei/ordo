import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  notInArchivedScope,
  isNull,
  sql,
  tables,
  type NewNote,
  noteColumns,
} from '../../adapters/database/database.adapter.js';

const { notes } = tables;

// Each note with its newest capture run's status, and the bodiless list
// entry: see `noteColumns` in the database adapter.
const withCaptureStatus = noteColumns.withCaptureStatus;
const summary = noteColumns.summary;

export class NotesRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  /**
   * Active notes as list entries (no body), oldest first; those in an
   * archived workspace or project only on request.
   */
  list(owner: string, includeArchived = false) {
    return this.database
      .use()
      .select(summary)
      .from(notes)
      .where(
        and(
          eq(notes.ownerUserId, owner),
          isNull(notes.deletedAt),
          includeArchived ? undefined : notInArchivedScope('notes'),
        ),
      )
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
