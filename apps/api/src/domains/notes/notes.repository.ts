import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  isNull,
  sql,
  tables,
  type NewNote,
} from '../../adapters/database/database.adapter.js';

const { notes } = tables;

export class NotesRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  list(owner: string) {
    return this.database
      .use()
      .select()
      .from(notes)
      .where(and(eq(notes.ownerUserId, owner), isNull(notes.deletedAt)))
      .orderBy(asc(notes.createdAt), asc(notes.id));
  }

  async find(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select()
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
