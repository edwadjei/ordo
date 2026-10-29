import { isoNow } from '../../platform/time/iso-now.js';
import type { User } from '@ordo/core';
import { SessionTokens } from '../../capabilities/session-tokens.contract.js';
import { SessionAuthenticator } from '../../capabilities/session-authenticator.contract.js';
import { SignInThrottle } from '../../capabilities/sign-in-throttle.contract.js';
import type { UserRecord } from '../../adapters/database/database.adapter.js';
import { IdentityRepository } from './identity.repository.js';

export function publicUser(user: UserRecord): User {
  return {
    id: user.id,
    email: user.email.startsWith('phone:') ? '' : user.email,
    displayName: user.displayName ?? '',
    timezone: user.timezone,
  };
}

export class IdentityService extends SessionAuthenticator {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: SessionTokens,
  ) {
    super();
  }

  async logout(token: string) {
    await this.repository.revokeSession(await this.tokens.digest(token));
  }

  async resolveSession(token: string) {
    const user = await this.repository.findActiveSessionUser(
      await this.tokens.digest(token),
      isoNow(),
    );
    return user ? publicUser(user) : null;
  }
}

/** Sign-in requests allowed per client and route in each window. */
export const SIGN_IN_LIMIT = 12;
const WINDOW_MS = 60_000;

/**
 * D1-backed per-route, per-client sign-in limit (12 a minute). The client
 * address is stored only as a SHA-256 digest.
 */
export class IdentitySignInThrottle extends SignInThrottle {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: SessionTokens,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  async attempt(route: string, client: string) {
    const at = this.now();
    const count = await this.repository.countThrottled(
      route,
      await this.tokens.digest(client),
      isoNow(at),
      isoNow(at - WINDOW_MS),
    );
    return count <= SIGN_IN_LIMIT;
  }
}
