import type { HttpRoutes } from '../../platform/http/http.js';
import { currentUser } from '../../platform/http/request-context.js';
import type { McpService } from './mcp.service.js';

/**
 * `POST /api/mcp` (here `/v1/mcp`), the Streamable HTTP endpoint. The guard
 * has already required an access token. GET and DELETE (server streams and
 * sessions of earlier revisions) are not offered: 405.
 */
export function registerMcpController(routes: HttpRoutes, service: McpService) {
  routes.post('/v1/mcp', async (request, reply) => {
    const answer = await service.handle(
      request.body,
      {
        protocolVersion: request.header('mcp-protocol-version'),
        method: request.header('mcp-method'),
        name: request.header('mcp-name'),
      },
      currentUser(request),
      request.agent!,
    );
    reply.status(answer.status);
    return answer.body;
  });
  for (const method of ['get', 'delete'] as const)
    routes[method]('/v1/mcp', async (_request, reply) => {
      reply.status(405).header('Allow', 'POST');
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Use POST for MCP requests.' },
      };
    });
}
