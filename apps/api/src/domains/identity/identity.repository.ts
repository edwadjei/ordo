import {
  DatabaseAdapter,
  and,
  eq,
  gt,
  tables,
  type NewUser,
} from '../../adapters/database/database.adapter.js';

const { users, sessions } = tables;

export class IdentityRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  async findByEmail(email: string) {
    const [user] = await this.database
      .use()
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  async insertAccount(input: NewUser) {
    const [user] = await this.database
      .use()
      .insert(users)
      .values(input)
      .onConflictDoNothing({ target: users.email })
      .returning();
    return user;
  }

  async insertSession(tokenHash: string, userId: string, expiresAt: string) {
    await this.database
      .use()
      .insert(sessions)
      .values({ tokenHash, userId, expiresAt });
  }

  async revokeSession(tokenHash: string) {
    await this.database
      .use()
      .delete(sessions)
      .where(eq(sessions.tokenHash, tokenHash));
  }

  async findActiveSessionUser(tokenHash: string, now: string) {
    const [session] = await this.database
      .use()
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
      );
    return session?.user;
  }
}
