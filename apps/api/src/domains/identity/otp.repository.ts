import { isoNow } from '../../platform/time/iso-now.js';
import {
  DatabaseAdapter,
  eq,
  sql,
  tables,
  type UserRecord,
} from '../../adapters/database/database.adapter.js';
const { otpChallenges, users, sessions } = tables;

const CODE_TTL_MS = 5 * 60_000;
const RESEND_SPACING_MS = 60_000;
const WINDOW_MS = 15 * 60_000;
const SESSION_TTL_MS = 7 * 86_400_000;
/** Sends and attempts allowed per contact in each 15-minute window. */
const LIMIT = 5;

export class OtpRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  /**
   * One upsert on the contact's row. It replaces the challenge only when the
   * 60-second spacing has passed and the window allows another send (a window
   * older than 15 minutes starts again). Resending never resets attempts
   * inside a window. `false` (no row returned) means rate limited.
   */
  async reserve(input: {
    contact: string;
    challengeId: string;
    codeHash: string;
    now: number;
  }) {
    const now = isoNow(input.now);
    const windowStart = isoNow(input.now - WINDOW_MS);
    const rows = await this.database.use().all<{ challengeId: string }>(sql`
      INSERT INTO ${otpChallenges} (contact, challenge_id, code_hash, expires_at, next_send_at,
        window_started_at, requests, attempts, ready, consumed, consumed_by)
      VALUES (${input.contact}, ${input.challengeId}, ${input.codeHash},
        ${isoNow(input.now + CODE_TTL_MS)}, ${isoNow(input.now + RESEND_SPACING_MS)},
        ${now}, 1, 0, 0, 0, NULL)
      ON CONFLICT (contact) DO UPDATE SET
        challenge_id = excluded.challenge_id,
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        next_send_at = excluded.next_send_at,
        window_started_at = CASE WHEN window_started_at <= ${windowStart}
          THEN excluded.window_started_at ELSE window_started_at END,
        requests = CASE WHEN window_started_at <= ${windowStart} THEN 1 ELSE requests + 1 END,
        attempts = CASE WHEN window_started_at <= ${windowStart} THEN 0 ELSE attempts END,
        ready = 0, consumed = 0, consumed_by = NULL
      WHERE next_send_at <= ${now}
        AND (window_started_at <= ${windowStart} OR (requests < ${LIMIT} AND attempts < ${LIMIT}))
      RETURNING challenge_id AS challengeId`);
    return rows.length === 1;
  }

  /**
   * After a failed delivery: lifts the 60-second spacing so the contact can
   * ask again at once, and blanks the undelivered code so it can never be
   * verified. The send still counts toward the five-per-window limit, which
   * bounds messages to a contact even when a "failed" send (a timeout, say)
   * actually arrived. Matches only this unready challenge, so it never
   * touches a newer reservation.
   */
  async release(challengeId: string, now: number) {
    await this.database.use().run(sql`
      UPDATE ${otpChallenges} SET next_send_at = ${isoNow(now)}, code_hash = ''
       WHERE challenge_id = ${challengeId} AND ready = 0 AND consumed = 0`);
  }

  async markReady(challengeId: string) {
    await this.database
      .use()
      .update(otpChallenges)
      .set({ ready: true })
      .where(eq(otpChallenges.challengeId, challengeId));
  }

  /**
   * Step 1 of verification: one atomic attempt increment on a live, ready,
   * unconsumed challenge with attempts left. Returns its code hash and
   * contact, or `undefined` when the challenge cannot be used.
   */
  async countAttempt(challengeId: string, now: number) {
    const [row] = await this.database.use().all<{
      codeHash: string;
      contact: string;
    }>(sql`
      UPDATE ${otpChallenges} SET attempts = attempts + 1
       WHERE challenge_id = ${challengeId} AND consumed = 0 AND ready = 1
         AND expires_at > ${isoNow(now)} AND attempts < ${LIMIT}
      RETURNING code_hash AS codeHash, contact`);
    return row;
  }

  /**
   * Step 3: one batch. Its first statement is the compare-and-set that
   * consumes the challenge with this request's random `claim`; every later
   * statement runs only while that claim is recorded, so a second request
   * with the same code claims nothing and writes nothing. Creates or links
   * the account, deletes old sessions at the first email proof (converting a
   * legacy account), marks the contact verified and inserts the session.
   * Returns the signed-in user, or `undefined` when the claim was lost.
   */
  async consume(input: {
    challengeId: string;
    contact: string;
    claim: string;
    now: number;
    accountId: string;
    displayName?: string;
    sessionHash: string;
  }): Promise<UserRecord | undefined> {
    const db = this.database.use();
    const phone = input.contact.startsWith('+');
    const now = isoNow(input.now);
    const claimed = sql`EXISTS (SELECT 1 FROM ${otpChallenges} WHERE challenge_id = ${input.challengeId} AND consumed_by = ${input.claim})`;
    const account = phone
      ? sql`phone = ${input.contact}`
      : sql`email = ${input.contact}`;
    const displayName =
      input.displayName ??
      (phone ? 'Ordo member' : input.contact.split('@')[0].slice(0, 80));
    const results = await db.batch([
      db.run(sql`
        UPDATE ${otpChallenges} SET consumed = 1, consumed_by = ${input.claim}, code_hash = ''
         WHERE challenge_id = ${input.challengeId} AND consumed = 0`),
      db.run(sql`
        INSERT INTO ${users} (id, email, phone, display_name)
        SELECT ${input.accountId}, ${phone ? `phone:${input.accountId}` : input.contact},
               ${phone ? input.contact : null}, ${displayName}
         WHERE ${claimed}
        ON CONFLICT DO NOTHING`),
      // The first proven email supersedes every earlier session, including
      // any created by an email squatter or a legacy password sign-in.
      ...(phone
        ? []
        : [
            db.run(sql`
              DELETE FROM ${sessions} WHERE ${claimed} AND user_id IN (
                SELECT id FROM ${users} WHERE ${account} AND email_verified_at IS NULL)`),
          ]),
      db.run(sql`
        UPDATE ${users} SET ${sql.raw(phone ? 'phone_verified_at' : 'email_verified_at')} = ${now},
               updated_at = ${now}
         WHERE ${account} AND ${claimed}`),
      db.run(sql`
        INSERT INTO ${sessions} (token_hash, user_id, expires_at)
        SELECT ${input.sessionHash}, id, ${isoNow(input.now + SESSION_TTL_MS)}
          FROM ${users} WHERE ${account} AND ${claimed}`),
      db
        .select()
        .from(users)
        .where(sql`${account} AND ${claimed}`),
    ]);
    const signedIn = results.at(-1) as UserRecord[];
    return signedIn[0];
  }
}
