import { ZodError } from 'zod';
import type { User } from '@ordo/core';
import { ApiFailure } from '../../platform/http/api-failure.js';
import type { AgentContext } from '../../platform/http/http.js';
import type { AgentAccessService } from '../agent-access/agent-access.service.js';
import { tools, type ToolServices } from './mcp.tools.js';

/** Newest first. 2026-07-28 is per-request; the others use `initialize`. */
export const supportedVersions = [
  '2026-07-28',
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
];
const latestHandshakeVersion = '2025-11-25';
const serverInfo = { name: 'ordo', title: 'Ordo', version: '1.0.0' };
const capabilities = { tools: { listChanged: false } };
const instructions =
  "Ordo is the owner's task and note manager. Use list_workspaces and list_projects to find where work belongs, then create_task or create_note. Dates are YYYY-MM-DD and times HH:MM in the owner's timezone. Tasks you create are marked as made by this assistant.";

export interface McpHeaders {
  protocolVersion?: string;
  method?: string;
  name?: string;
}

/** An HTTP answer: `body` undefined means no body (202). */
export interface McpReply {
  status: number;
  body?: unknown;
}

type Id = string | number | null;
const error = (
  status: number,
  id: Id,
  code: number,
  message: string,
  data?: unknown,
): McpReply => ({
  status,
  body: {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  },
});
const ok = (id: Id, result: Record<string, unknown>): McpReply => ({
  status: 200,
  body: {
    jsonrpc: '2.0',
    id,
    result: { resultType: 'complete', ...result },
  },
});

/**
 * Ordo's MCP server: a small, stateless JSON-RPC 2.0 handler for the
 * Streamable HTTP POST path (no server-sent streams, no sessions). It
 * answers both the 2026-07-28 revision (per-request version, `server/
 * discover`) and earlier clients (`initialize`). Each tool checks the
 * token's scope, validates with the shared Zod schemas, returns compact
 * JSON, and is logged to the agent activity log.
 */
export class McpService {
  constructor(
    private readonly services: ToolServices,
    private readonly agents: AgentAccessService,
  ) {}

  async handle(
    message: unknown,
    headers: McpHeaders,
    user: User,
    agent: AgentContext,
  ): Promise<McpReply> {
    const reply = await this.respond(message, headers, user, agent);
    // Only a successful tool call writes an activity entry (and records use
    // with it); anything else records use on its own when that is due.
    const result = (reply.body as { result?: { isError?: boolean } })?.result;
    if (result?.isError !== false && agent.touch)
      await this.agents.log(user.id, agent.tokenId, null, null, null, true);
    return reply;
  }

  private async respond(
    message: unknown,
    headers: McpHeaders,
    user: User,
    agent: AgentContext,
  ): Promise<McpReply> {
    if (Array.isArray(message))
      return error(400, null, -32600, 'Batches are not supported.');
    const request = message as {
      jsonrpc?: unknown;
      id?: unknown;
      method?: unknown;
      params?: Record<string, unknown>;
    } | null;
    if (
      !request ||
      typeof request !== 'object' ||
      request.jsonrpc !== '2.0' ||
      typeof request.method !== 'string'
    )
      return error(400, null, -32600, 'Invalid JSON-RPC request.');
    const id = (
      typeof request.id === 'string' || typeof request.id === 'number'
        ? request.id
        : null
    ) as Id;
    const method = request.method;
    const params = (
      request.params && typeof request.params === 'object' ? request.params : {}
    ) as Record<string, unknown>;
    const meta = (params._meta ?? {}) as Record<string, unknown>;
    const bodyVersion = meta['io.modelcontextprotocol/protocolVersion'];
    if (
      headers.protocolVersion &&
      typeof bodyVersion === 'string' &&
      headers.protocolVersion !== bodyVersion
    )
      return error(
        400,
        id,
        -32020,
        'Header mismatch: MCP-Protocol-Version does not match the request body.',
      );
    if (headers.method && headers.method !== method)
      return error(400, id, -32020, 'Header mismatch: Mcp-Method.');
    if (headers.name && method === 'tools/call' && headers.name !== params.name)
      return error(400, id, -32020, 'Header mismatch: Mcp-Name.');
    const requested =
      typeof bodyVersion === 'string' ? bodyVersion : headers.protocolVersion;
    if (
      method !== 'initialize' &&
      requested &&
      !supportedVersions.includes(requested)
    )
      return error(400, id, -32022, 'Unsupported protocol version', {
        supported: supportedVersions,
        requested,
      });
    // A notification (no id) is accepted with 202 and no body.
    if (!('id' in request)) return { status: 202 };

    switch (method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        return ok(id, {
          protocolVersion:
            typeof asked === 'string' &&
            supportedVersions.slice(1).includes(asked)
              ? asked
              : latestHandshakeVersion,
          capabilities,
          serverInfo,
          instructions,
        });
      }
      case 'server/discover':
        return ok(id, {
          supportedVersions,
          capabilities,
          _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
          instructions,
        });
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, {
          tools: tools
            .filter((tool) => agent.scopes.includes(tool.scope))
            .map(({ name, title, description, inputSchema }) => ({
              name,
              title,
              description,
              inputSchema,
            })),
        });
      case 'tools/call':
        return this.call(id, params, user, agent);
      default:
        return error(404, id, -32601, `Method not found: ${method}`);
    }
  }

  private async call(
    id: Id,
    params: Record<string, unknown>,
    user: User,
    agent: AgentContext,
  ): Promise<McpReply> {
    const tool = tools.find((candidate) => candidate.name === params.name);
    if (!tool)
      return error(200, id, -32602, `Unknown tool: ${String(params.name)}`);
    const args = params.arguments ?? {};
    if (typeof args !== 'object' || Array.isArray(args))
      return error(200, id, -32602, 'Tool arguments must be an object.');
    if (!agent.scopes.includes(tool.scope))
      return toolError(
        id,
        'INSUFFICIENT_SCOPE',
        'This access key can only read. Create a read-and-write key to make changes.',
      );
    try {
      const outcome = await tool.run(
        args as Record<string, unknown>,
        { user, tokenId: agent.tokenId },
        this.services,
      );
      await this.agents.log(
        user.id,
        agent.tokenId,
        outcome.action ?? `mcp.${tool.name}`,
        outcome.entityType,
        outcome.entityId,
        agent.touch,
      );
      const structured = outcome.result as Record<string, unknown>;
      return ok(id, {
        content: [{ type: 'text', text: JSON.stringify(structured) }],
        structuredContent: structured,
        isError: false,
      });
    } catch (failure) {
      if (failure instanceof ApiFailure)
        return toolError(id, failure.code, failure.message);
      if (failure instanceof ZodError)
        return toolError(
          id,
          'INVALID_INPUT',
          failure.issues
            .slice(0, 5)
            .map(
              (issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`,
            )
            .join('; '),
        );
      throw failure;
    }
  }
}

/** A tool error the model can read and correct: Ordo's code and message. */
function toolError(id: Id, code: string, message: string): McpReply {
  return ok(id, {
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: { error: { code, message } },
    isError: true,
  });
}
