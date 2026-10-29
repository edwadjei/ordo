import {
  AGENT_TOKEN_PREFIX,
  type AgentActivity,
  type AgentScope,
  type AgentTokenRecord,
  type CreatedAgentToken,
  type agentTokenInput,
} from '@ordo/core';
import type { z } from 'zod';
import type { AgentTokenRecord as TokenRow } from '../../adapters/database/database.adapter.js';
import {
  AgentAuthenticator,
  type AgentIdentity,
} from '../../capabilities/agent-authenticator.contract.js';
import type { AgentTokenSecrets } from '../../capabilities/agent-token-secrets.contract.js';
import { fail } from '../../platform/http/api-failure.js';
import type { HttpRequest } from '../../platform/http/http.js';
import { newId } from '../../platform/identifiers/new-id.js';
import { isoNow } from '../../platform/time/iso-now.js';
import { publicUser } from '../identity/identity.service.js';
import type { AgentAccessRepository } from './agent-access.repository.js';

/** `last_used_at` is written at most this often per token. */
const TOUCH_EVERY_MS = 60_000;
const tokenShape = /^ordo_pat_([0-9a-f-]{36})_([A-Za-z0-9_-]{43})$/;

export function publicToken(row: TokenRow): AgentTokenRecord {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes.split(' ') as AgentScope[],
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

/**
 * Personal access tokens for AI assistants, and what they did. Tokens are
 * created, listed and revoked with a signed-in session only; a token can
 * never manage tokens (see `platform/http/agent-policy.ts`).
 */
export class AgentAccessService extends AgentAuthenticator {
  constructor(
    private readonly repository: AgentAccessRepository,
    private readonly secrets: AgentTokenSecrets,
  ) {
    super();
  }

  async create(
    owner: string,
    input: z.infer<typeof agentTokenInput>,
  ): Promise<CreatedAgentToken> {
    const now = isoNow();
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt).toISOString()
      : null;
    if (expiresAt && expiresAt <= now)
      fail(400, 'INVALID_INPUT', 'Choose an expiry in the future.');
    const id = newId();
    const secret = this.secrets.newSecret();
    const row = await this.repository.insert(
      {
        id,
        ownerUserId: owner,
        name: input.name,
        scopes: input.scopes.includes('write') ? 'read write' : 'read',
        secretHash: await this.secrets.hash(id, secret),
        createdAt: now,
        expiresAt,
      },
      now,
    );
    if (!row)
      fail(
        409,
        'TOKEN_LIMIT',
        'You already have 20 active access keys. Revoke one first.',
      );
    return {
      token: `${AGENT_TOKEN_PREFIX}${id}_${secret}`,
      record: publicToken(row),
    };
  }

  async list(owner: string) {
    return (await this.repository.list(owner)).map(publicToken);
  }

  async revoke(owner: string, id: string) {
    const row =
      (await this.repository.revoke(owner, id, isoNow())) ??
      fail(404, 'NOT_FOUND', 'Access key not found.');
    return publicToken(row);
  }

  /** The token's owner and scopes, or null: unknown, revoked, expired or wrong. */
  async authenticate(token: string): Promise<AgentIdentity | null> {
    const parts = tokenShape.exec(token);
    if (!parts) return null;
    const [, id, secret] = parts;
    const found = await this.repository.findForAuth(id);
    if (!found) return null;
    const { token: row, user } = found;
    const now = isoNow();
    if (row.revokedAt || (row.expiresAt && row.expiresAt <= now)) return null;
    if (!(await this.secrets.verify(id, secret, row.secretHash))) return null;
    if (
      !row.lastUsedAt ||
      Date.parse(now) - Date.parse(row.lastUsedAt) >= TOUCH_EVERY_MS
    )
      await this.repository.touch(row.ownerUserId, id, now);
    return {
      user: publicUser(user),
      tokenId: id,
      scopes: row.scopes.split(' ') as AgentScope[],
    };
  }

  /** One activity entry: what kind of thing happened to which id. */
  async log(
    owner: string,
    tokenId: string,
    action: string,
    entityType: string | null,
    entityId: string | null,
  ) {
    await this.repository.log({
      id: newId(),
      ownerUserId: owner,
      tokenId,
      action,
      entityType,
      entityId,
      createdAt: isoNow(),
    });
  }

  async activity(
    owner: string,
    query: { tokenId?: string; before?: string },
  ): Promise<AgentActivity[]> {
    const rows = await this.repository.activity(
      owner,
      query.tokenId,
      query.before ? new Date(query.before).toISOString() : undefined,
    );
    return rows.map(({ ownerUserId: _owner, ...row }) => row);
  }

  /**
   * After a REST request made with a token: logs the route's action and the
   * item it touched (the URL's id, or the id of what was created). MCP
   * requests log per tool instead.
   */
  readonly afterHook = async (request: HttpRequest, result: unknown) => {
    const agent = request.agent;
    if (!agent || agent.action === 'mcp') return;
    const created = (result as { id?: unknown } | null)?.id;
    const entityId =
      request.params.id ?? (typeof created === 'string' ? created : null);
    await this.log(
      request.actor!.id,
      agent.tokenId,
      agent.action,
      agent.entityType,
      entityId,
    );
  };
}
