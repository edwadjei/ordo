import type { User } from '@ordo/core';

export abstract class SessionAuthenticator {
  abstract resolveSession(token: string): Promise<User | null>;
}
