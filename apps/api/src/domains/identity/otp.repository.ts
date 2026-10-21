import {
  DatabaseAdapter,
  and,
  eq,
  tables,
  type OtpChallengeRecord,
  type UserRecord,
} from '../../adapters/database/database.adapter.js';
const { otpChallenges, users, sessions } = tables;
export class OtpRepository {
  constructor(private readonly database: DatabaseAdapter) {}
  async reserve(input: {
    contact: string;
    challengeId: string;
    codeHash: string;
    now: number;
  }) {
    return this.database.use().transaction(async (tx) => {
      const iso = (ms: number) => new Date(ms).toISOString();
      await tx
        .insert(otpChallenges)
        .values({
          contact: input.contact,
          challengeId: input.challengeId,
          codeHash: '',
          expiresAt: iso(0),
          nextSendAt: iso(0),
          windowStartedAt: iso(input.now),
        })
        .onConflictDoNothing({ target: otpChallenges.contact });
      const [row] = await tx
        .select()
        .from(otpChallenges)
        .where(eq(otpChallenges.contact, input.contact))
        .for('update');
      const reset = input.now - Date.parse(row.windowStartedAt) >= 15 * 60000;
      if (
        Date.parse(row.nextSendAt) > input.now ||
        (!reset && (row.requests >= 5 || row.attempts >= 5))
      )
        return false;
      await tx
        .update(otpChallenges)
        .set({
          challengeId: input.challengeId,
          codeHash: input.codeHash,
          expiresAt: iso(input.now + 5 * 60000),
          nextSendAt: iso(input.now + 60000),
          windowStartedAt: reset ? iso(input.now) : row.windowStartedAt,
          requests: reset ? 1 : row.requests + 1,
          attempts: reset ? 0 : row.attempts,
          ready: false,
          consumed: false,
        })
        .where(eq(otpChallenges.contact, input.contact));
      return true;
    });
  }
  async markReady(challengeId: string) {
    await this.database
      .use()
      .update(otpChallenges)
      .set({ ready: true })
      .where(eq(otpChallenges.challengeId, challengeId));
  }
  async verify(input: {
    challengeId: string;
    now: number;
    displayName?: string;
    accountId: string;
    passwordHash: string;
    sessionHash: string;
    check: (row: OtpChallengeRecord) => Promise<boolean>;
  }) {
    return this.database.use().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(otpChallenges)
        .where(eq(otpChallenges.challengeId, input.challengeId))
        .for('update');
      if (
        !row ||
        !row.ready ||
        row.consumed ||
        Date.parse(row.expiresAt) <= input.now ||
        row.attempts >= 5
      )
        return null;
      await tx
        .update(otpChallenges)
        .set({ attempts: row.attempts + 1 })
        .where(eq(otpChallenges.contact, row.contact));
      if (!(await input.check(row))) return null;
      const phone = row.contact.startsWith('+');
      const match = phone
        ? eq(users.phone, row.contact)
        : eq(users.email, row.contact);
      let [user] = await tx.select().from(users).where(match);
      if (!user) {
        const [inserted] = await tx
          .insert(users)
          .values({
            id: input.accountId,
            email: phone ? `phone:${input.accountId}` : row.contact,
            phone: phone ? row.contact : null,
            displayName:
              input.displayName ??
              (phone ? 'Ordo member' : row.contact.split('@')[0].slice(0, 80)),
            passwordHash: input.passwordHash,
          })
          .onConflictDoNothing()
          .returning();
        user = inserted ?? (await tx.select().from(users).where(match))[0];
      }
      if (!user) throw new Error('Account creation could not complete');
      // The first proven email supersedes all unverified password credentials
      // and sessions, including any created by an earlier email squatter.
      const firstEmailProof = !phone && !user.emailVerifiedAt;
      const [verified] = await tx
        .update(users)
        .set(
          phone
            ? { phoneVerifiedAt: new Date(input.now).toISOString() }
            : {
                emailVerifiedAt: new Date(input.now).toISOString(),
                ...(firstEmailProof
                  ? { passwordHash: 'passwordless-only' }
                  : {}),
              },
        )
        .where(eq(users.id, user.id))
        .returning();
      if (firstEmailProof)
        await tx.delete(sessions).where(eq(sessions.userId, verified.id));
      await tx
        .update(otpChallenges)
        .set({ consumed: true, codeHash: '' })
        .where(
          and(
            eq(otpChallenges.contact, row.contact),
            eq(otpChallenges.challengeId, input.challengeId),
          ),
        );
      await tx.insert(sessions).values({
        tokenHash: input.sessionHash,
        userId: verified.id,
        expiresAt: new Date(input.now + 7 * 86400000).toISOString(),
      });
      return verified as UserRecord;
    });
  }
}
