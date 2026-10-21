import type { z } from 'zod';
import type { registration, userCredentials, User } from '@ordo/core';
import { PasswordHasher } from '../../capabilities/password-hasher.contract.js';
import { SessionTokens } from '../../capabilities/session-tokens.contract.js';
import { SessionAuthenticator } from '../../capabilities/session-authenticator.contract.js';
import { newId } from '../../platform/identifiers/new-id.js';
import { fail } from '../../platform/http/api-failure.js';
import type { UserRecord } from '../../adapters/database/database.adapter.js';
import { IdentityRepository } from './identity.repository.js';

function publicUser(user: UserRecord): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
  };
}

export class IdentityService extends SessionAuthenticator {
  private dummyPasswordHash = '';

  constructor(
    private readonly repository: IdentityRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: SessionTokens,
  ) {
    super();
  }

  async prepare() {
    this.dummyPasswordHash = await this.passwords.hash(
      'not-an-account-password',
    );
  }

  async register(input: z.infer<typeof registration>) {
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.repository.insertAccount({
      id: newId(),
      email: input.email,
      displayName: input.displayName,
      passwordHash,
    });
    if (!user)
      fail(409, 'ACCOUNT_EXISTS', 'An account with this email already exists.');
    return { user: publicUser(user), token: await this.createSession(user.id) };
  }

  async login(input: z.infer<typeof userCredentials>) {
    const user = await this.repository.findByEmail(input.email);
    const valid = await this.passwords.verify(
      input.password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );
    if (!user || !valid)
      fail(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    return { user: publicUser(user), token: await this.createSession(user.id) };
  }

  async logout(token: string) {
    await this.repository.revokeSession(this.tokens.digest(token));
  }

  async resolveSession(token: string) {
    const user = await this.repository.findActiveSessionUser(
      this.tokens.digest(token),
      new Date().toISOString(),
    );
    return user ? publicUser(user) : null;
  }

  private async createSession(userId: string) {
    const token = this.tokens.create();
    await this.repository.insertSession(
      this.tokens.digest(token),
      userId,
      new Date(Date.now() + 7 * 86400000).toISOString(),
    );
    return token;
  }
}
