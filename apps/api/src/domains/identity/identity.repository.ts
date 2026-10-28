import {
  DatabaseAdapter,
  and,
  eq,
  gt,
  sql,
  tables,
} from '../../adapters/database/database.adapter.js';

const { users, sessions, authThrottle } = tables;

export class IdentityRepository {
  constructor(private readonly database: DatabaseAdapter) {}

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

  /**
   * One upsert counting a request in the client's current window (a window
   * older than `windowStart` restarts at 1), batched with a bounded cleanup of
   * stale rows. Returns the count after this request.
   */
  async countThrottled(
    route: string,
    client: string,
    now: string,
    windowStart: string,
  ) {
    const db = this.database.use();
    const [counted] = await db.batch([
      db.all<{ count: number }>(sql`
        INSERT INTO ${authThrottle} (route, client, window_started_at, count)
        VALUES (${route}, ${client}, ${now}, 1)
        ON CONFLICT (route, client) DO UPDATE SET
          count = CASE WHEN window_started_at <= ${windowStart} THEN 1 ELSE count + 1 END,
          window_started_at = CASE WHEN window_started_at <= ${windowStart} THEN excluded.window_started_at ELSE window_started_at END
        RETURNING count`),
      db.run(sql`
        DELETE FROM ${authThrottle} WHERE (route, client) IN (
          SELECT route, client FROM ${authThrottle}
           WHERE window_started_at <= ${windowStart} LIMIT 20)`),
    ]);
    return counted[0]?.count ?? Number.POSITIVE_INFINITY;
  }
}
