import { z } from 'zod';
import { cleanDisplayName } from '@ordo/core';
import {
  OtpDelivery,
  otpDeliveryFailure,
} from '../../capabilities/otp-delivery.contract.js';
import { OtpSecrets } from '../../capabilities/otp-secrets.contract.js';
import { SessionTokens } from '../../capabilities/session-tokens.contract.js';
import { newId } from '../../platform/identifiers/new-id.js';
import { fail } from '../../platform/http/api-failure.js';
import { OtpRepository } from './otp.repository.js';
import { publicUser } from './identity.service.js';

export function normalizeContact(input: string) {
  const contact = input.trim().toLowerCase();
  if (contact.includes('@')) {
    if (
      !z.email().max(254).safeParse(contact).success ||
      contact.endsWith('.ordo.invalid')
    )
      fail(
        400,
        'INVALID_CONTACT',
        'Enter a valid email address or Ghana phone number.',
      );
    return contact;
  }
  const phone = contact.replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(phone)) return `+233${phone.slice(1)}`;
  if (/^\+233\d{9}$/.test(phone)) return phone;
  fail(
    400,
    'INVALID_CONTACT',
    'Phone sign-in currently supports Ghana (+233) numbers. You can also use email.',
  );
}

/**
 * One diagnosable line without the contact, code, key, URL or provider body:
 * the channel, the failure reason, and the HTTP status or error name.
 */
export function deliveryFailureLine(contact: string, error: unknown) {
  const channel = contact.startsWith('+') ? 'sms' : 'email';
  const parts = [`channel=${channel}`];
  const failure = otpDeliveryFailure(error);
  if (failure) {
    parts.push(`reason=${failure.reason}`);
    if (failure.status !== undefined) parts.push(`status=${failure.status}`);
    if (failure.errorName) parts.push(`error=${failure.errorName}`);
  } else {
    parts.push('reason=unexpected');
    parts.push(`error=${error instanceof Error ? error.name : typeof error}`);
  }
  return `[ordo] Sign-in code delivery failed: ${parts.join(' ')}`;
}

function refused(): never {
  return fail(
    401,
    'OTP_INVALID',
    'The code is incorrect, expired, or already used. Request a new code if needed.',
  );
}

export class OtpService {
  constructor(
    private readonly repository: OtpRepository,
    private readonly tokens: SessionTokens,
    private readonly secrets: OtpSecrets,
    private readonly delivery: OtpDelivery,
    private readonly now: () => number = Date.now,
    private readonly log: (line: string) => void = (line) =>
      console.error(line),
  ) {}
  async request(contactInput: string) {
    const contact = normalizeContact(contactInput);
    if (!this.delivery.available())
      fail(503, 'OTP_UNAVAILABLE', 'Passwordless sign-in is coming soon.');
    const challengeId = newId();
    const code = this.secrets.code();
    const codeHash = await this.secrets.hash(challengeId, code);
    if (
      !(await this.repository.reserve({
        contact,
        challengeId,
        codeHash,
        now: this.now(),
      }))
    )
      fail(
        429,
        'OTP_RATE_LIMITED',
        'Please wait before requesting another code.',
      );
    try {
      await this.delivery.send(contact, code);
    } catch (error) {
      this.log(deliveryFailureLine(contact, error));
      // Best effort: if the release fails too, the spacing simply runs out.
      await this.repository.release(challengeId, this.now()).catch(() => {});
      fail(
        502,
        'OTP_DELIVERY_FAILED',
        "We couldn't send your code. Please try again.",
      );
    }
    await this.repository.markReady(challengeId);
    return { challengeId, retryAfterSeconds: 60, expiresInSeconds: 300 };
  }
  /**
   * Three steps: count the attempt atomically, compare the code's HMAC in
   * constant time, then consume the challenge and sign in within one batch
   * guarded by a compare-and-set, so a code works exactly once.
   */
  async verify(input: {
    challengeId: string;
    code: string;
    displayName?: string;
  }) {
    const now = this.now();
    const challenge = await this.repository.countAttempt(
      input.challengeId,
      now,
    );
    if (!challenge) refused();
    if (
      !(await this.secrets.verify(
        input.challengeId,
        input.code,
        challenge.codeHash,
      ))
    )
      refused();
    const token = this.tokens.create();
    const user = await this.repository.consume({
      challengeId: input.challengeId,
      contact: challenge.contact,
      claim: newId(),
      now,
      accountId: newId(),
      // No invented default: without a real name the account stores none.
      displayName: cleanDisplayName(input.displayName),
      sessionHash: await this.tokens.digest(token),
    });
    if (!user) refused();
    return { user: publicUser(user), token };
  }
}
