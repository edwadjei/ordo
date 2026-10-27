import { z } from 'zod';
import { OtpDelivery } from '../../capabilities/otp-delivery.contract.js';
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
export class OtpService {
  constructor(
    private readonly repository: OtpRepository,
    private readonly tokens: SessionTokens,
    private readonly secrets: OtpSecrets,
    private readonly delivery: OtpDelivery,
    private readonly now: () => number = Date.now,
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
    } catch {
      fail(
        502,
        'OTP_DELIVERY_FAILED',
        'The sign-in code could not be delivered. Please try again later.',
      );
    }
    await this.repository.markReady(challengeId);
    return { challengeId, retryAfterSeconds: 60, expiresInSeconds: 300 };
  }
  async verify(input: {
    challengeId: string;
    code: string;
    displayName?: string;
  }) {
    const token = this.tokens.create();
    const user = await this.repository.verify({
      challengeId: input.challengeId,
      now: this.now(),
      displayName: input.displayName,
      accountId: newId(),
      passwordHash: 'passwordless-only',
      sessionHash: await this.tokens.digest(token),
      check: (row) =>
        this.secrets.verify(input.challengeId, input.code, row.codeHash),
    });
    if (!user)
      fail(
        401,
        'OTP_INVALID',
        'The code is incorrect, expired, or already used. Request a new code if needed.',
      );
    return { user: publicUser(user), token };
  }
}
