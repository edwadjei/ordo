import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  isNull,
  tables,
  type TransactionContext,
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
      .orderBy(asc(notes.createdAt));
  }

  async find(owner: string, id: string, transaction?: TransactionContext) {
    const [row] = await this.database
      .use(transaction)
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

  async insert(input: NewNote, transaction: TransactionContext) {
    const [row] = await this.database
      .use(transaction)
      .insert(notes)
      .values(input)
      .returning();
    return row;
  }

  async update(
    owner: string,
    id: string,
    patch: Partial<NewNote>,
    transaction: TransactionContext,
  ) {
    const [row] = await this.database
      .use(transaction)
      .update(notes)
      .set(patch)
      .where(and(eq(notes.id, id), eq(notes.ownerUserId, owner)))
      .returning();
    return row;
  }
}
