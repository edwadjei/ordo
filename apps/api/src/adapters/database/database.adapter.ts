import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  users,
  sessions,
  workspaces,
  projects,
  tasks,
  notes,
  idempotencyKeys,
  otpChallenges,
  audioSettings,
  type Database,
} from '@ordo/db';

export { and, asc, desc, eq, gt, isNull, sql };
export const tables = {
  users,
  sessions,
  workspaces,
  projects,
  tasks,
  notes,
  idempotencyKeys,
  otpChallenges,
  audioSettings,
};
export type TransactionContext = Database;
export type UserRecord = typeof users.$inferSelect;
export type WorkspaceRecord = typeof workspaces.$inferSelect;
export type ProjectRecord = typeof projects.$inferSelect;
export type TaskRecord = typeof tasks.$inferSelect;
export type NoteRecord = typeof notes.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type NewProject = typeof projects.$inferInsert;
export type NewTask = typeof tasks.$inferInsert;
export type NewNote = typeof notes.$inferInsert;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;

export class DatabaseAdapter {
  constructor(private readonly database: Database) {}

  use(transaction?: TransactionContext) {
    return transaction ?? this.database;
  }

  async forOwner<T>(
    ownerUserId: string,
    run: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, ownerUserId))
        .for('update');
      return run(transaction as unknown as TransactionContext);
    });
  }
}

export type OtpChallengeRecord = typeof otpChallenges.$inferSelect;
