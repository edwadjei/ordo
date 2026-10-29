import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { WebAgentTokenSecrets } from '../../adapters/cryptography/web-agent-token-secrets.js';
import { AgentAccessRepository } from './agent-access.repository.js';
import { AgentAccessService } from './agent-access.service.js';
import { registerAgentAccessController } from './agent-access.controller.js';

/** `hmacKey` is the Worker's `OTP_HMAC_KEY`, used here with its own label. */
export function createAgentAccessModule(
  database: DatabaseAdapter,
  hmacKey: Uint8Array,
) {
  const service = new AgentAccessService(
    new AgentAccessRepository(database),
    new WebAgentTokenSecrets(hmacKey),
  );
  return {
    service,
    register: (routes: HttpRoutes) =>
      registerAgentAccessController(routes, service),
  };
}
