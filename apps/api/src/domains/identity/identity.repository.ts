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

  async insertSession(
    tokenHash: string,
    userId: string,
    expiresAt: string,
    expectedPasswordHash: string,
  ) {
    return this.database.use().transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      // Re-check after acquiring the account lock: OTP conversion may have
      // invalidated the password while its expensive comparison was in flight.
      if (
        !user ||
        user.passwordHash !== expectedPasswordHash ||
        !user.passwordHash.startsWith('scrypt:')
      )
        return false;
      await tx.insert(sessions).values({ tokenHash, userId, expiresAt });
      return true;
    });
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
