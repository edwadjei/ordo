import { AGENT_TOKEN_LIMIT } from '@ordo/core';
import {
  DatabaseAdapter,
  and,
  desc,
  eq,
  insertWhere,
  sql,
  tables,
  type AgentTokenRecord,
} from '../../adapters/database/database.adapter.js';

const { agentTokens, agentActivity, users } = tables;
/** Activity older than this is removed. */
const KEEP_DAYS = 90;

export class AgentAccessRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  /**
   * Inserts a token only while the owner has fewer than the limit of active
   * (unrevoked, unexpired) tokens, decided inside the statement so two
   * creates at once cannot pass it together. Undefined when refused.
   */
  async insert(
    row: Omit<AgentTokenRecord, 'lastUsedAt' | 'revokedAt'>,
    now: string,
  ): Promise<AgentTokenRecord | undefined> {
    const db = this.database.use();
    const [, saved] = await db.batch([
      db.run(
        insertWhere(
          agentTokens,
          [row],
          sql`(SELECT COUNT(*) FROM agent_tokens WHERE owner_user_id = ${row.ownerUserId}
                AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ${now})) < ${AGENT_TOKEN_LIMIT}`,
        ),
      ),
      db.select().from(agentTokens).where(eq(agentTokens.id, row.id)),
    ]);
    return saved[0];
  }

  list(owner: string) {
    return this.database
      .use()
      .select()
      .from(agentTokens)
      .where(eq(agentTokens.ownerUserId, owner))
      .orderBy(desc(agentTokens.createdAt), desc(agentTokens.id));
  }

  async find(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(agentTokens)
      .where(and(eq(agentTokens.id, id), eq(agentTokens.ownerUserId, owner)));
    return row;
  }

  /** Revokes once; the first revocation time is kept. */
  async revoke(owner: string, id: string, now: string) {
    const [row] = await this.database
      .use()
      .update(agentTokens)
      .set({ revokedAt: sql`coalesce(${agentTokens.revokedAt}, ${now})` })
      .where(and(eq(agentTokens.id, id), eq(agentTokens.ownerUserId, owner)))
      .returning();
    return row;
  }

  /** A token with its owner, for authentication: one read. */
  async findForAuth(id: string) {
    const [row] = await this.database
      .use()
      .select({ token: agentTokens, user: users })
      .from(agentTokens)
      .innerJoin(users, eq(users.id, agentTokens.ownerUserId))
      .where(eq(agentTokens.id, id));
    return row;
  }

  /**
   * One D1 batch: the activity entry (when there is one) and, when `touch`,
   * the token's `last_used_at` and the removal of its activity older than
   * 90 days. Use is recorded with the request's own entry rather than in a
   * round trip of its own.
   */
  async record(
    owner: string,
    tokenId: string,
    entry: typeof agentActivity.$inferInsert | null,
    touch: boolean,
    now: string,
  ) {
    const db = this.database.use();
    const cutoff = new Date(
      Date.parse(now) - KEEP_DAYS * 86_400_000,
    ).toISOString();
    const statements = [
      ...(entry ? [db.insert(agentActivity).values(entry)] : []),
      ...(touch
        ? [
            db
              .update(agentTokens)
              .set({ lastUsedAt: now })
              .where(eq(agentTokens.id, tokenId)),
            db.run(
              sql`DELETE FROM agent_activity WHERE owner_user_id = ${owner} AND token_id = ${tokenId} AND created_at < ${cutoff}`,
            ),
          ]
        : []),
    ];
    if (statements.length)
      await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  }

  /** Newest first, 100 a page; `before` continues from a `createdAt`. */
  activity(owner: string, tokenId?: string, before?: string) {
    return this.database
      .use()
      .select()
      .from(agentActivity)
      .where(
        and(
          eq(agentActivity.ownerUserId, owner),
          tokenId ? eq(agentActivity.tokenId, tokenId) : undefined,
          before ? sql`${agentActivity.createdAt} < ${before}` : undefined,
        ),
      )
      .orderBy(desc(agentActivity.createdAt), desc(agentActivity.id))
      .limit(100);
  }
}
