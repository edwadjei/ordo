import type { AgentScope, User } from '@ordo/core';

export interface AgentIdentity {
  user: User;
  tokenId: string;
  scopes: AgentScope[];
}

/** Resolves an `Authorization: Bearer ordo_pat_…` token, or null. */
export abstract class AgentAuthenticator {
  abstract authenticate(token: string): Promise<AgentIdentity | null>;
}
