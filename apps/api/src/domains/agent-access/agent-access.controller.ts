import type { HttpRoutes } from '../../platform/http/http.js';
import { agentActivityQuery, agentTokenInput } from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import { created } from '../../platform/http/response.js';
import type { AgentAccessService } from './agent-access.service.js';

/** Session-only routes: the agent policy never lets a token reach them. */
export function registerAgentAccessController(
  routes: HttpRoutes,
  service: AgentAccessService,
) {
  routes.get('/v1/settings/agent-tokens', async (request) =>
    service.list(actorId(request)),
  );
  routes.post('/v1/settings/agent-tokens', async (request, reply) =>
    created(
      reply,
      await service.create(
        actorId(request),
        agentTokenInput.parse(request.body),
      ),
    ),
  );
  routes.delete('/v1/settings/agent-tokens/:id', async (request) =>
    service.revoke(actorId(request), entityId(request)),
  );
  routes.get('/v1/settings/agent-activity', async (request) =>
    service.activity(actorId(request), agentActivityQuery.parse(request.query)),
  );
}
