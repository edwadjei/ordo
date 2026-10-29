import type { AgentScope, User } from '@ordo/core';

export interface AgentIdentity {
  user: User;
  tokenId: string;
  scopes: AgentScope[];
  /**
   * `lastUsedAt` is due an update (it is written at most once a minute);
   * done with this request's activity entry, in the same D1 batch.
   */
  touch: boolean;
}

/** Resolves an `Authorization: Bearer ordo_pat_…` token, or null. */
export abstract class AgentAuthenticator {
  abstract authenticate(token: string): Promise<AgentIdentity | null>;
}
