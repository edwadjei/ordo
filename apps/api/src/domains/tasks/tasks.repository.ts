import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  isNull,
  tables,
  type TransactionContext,
  type NewTask,
  type NewIdempotencyKey,
} from '../../adapters/database/database.adapter.js';

const { tasks, idempotencyKeys } = tables;

export class TasksRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  list(owner: string) {
    return this.database
      .use()
      .select()
      .from(tasks)
      .where(and(eq(tasks.ownerUserId, owner), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.createdAt));
  }

  async find(
    owner: string,
    id: string,
    transaction?: TransactionContext,
    includeArchived = false,
  ) {
    const [row] = await this.database
      .use(transaction)
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

  async insert(input: NewTask, transaction: TransactionContext) {
    const [row] = await this.database
      .use(transaction)
      .insert(tasks)
      .values(input)
      .returning();
    return row;
  }

  async update(
    owner: string,
    id: string,
    patch: Partial<NewTask>,
    transaction: TransactionContext,
  ) {
    const [row] = await this.database
      .use(transaction)
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, id), eq(tasks.ownerUserId, owner)))
      .returning();
    return row;
  }

  async hasActiveChildren(
    owner: string,
    parentId: string,
    transaction: TransactionContext,
  ) {
    const [child] = await this.database
      .use(transaction)
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

  async findIdempotencyKey(
    owner: string,
    key: string,
    transaction: TransactionContext,
  ) {
    const [row] = await this.database
      .use(transaction)
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

  async insertIdempotencyKey(
    input: NewIdempotencyKey,
    transaction: TransactionContext,
  ) {
    await this.database.use(transaction).insert(idempotencyKeys).values(input);
  }
}
