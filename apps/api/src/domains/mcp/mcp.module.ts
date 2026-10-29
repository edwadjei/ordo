import type { HttpRoutes } from '../../platform/http/http.js';
import type { AgentAccessService } from '../agent-access/agent-access.service.js';
import { McpService } from './mcp.service.js';
import { registerMcpController } from './mcp.controller.js';
import type { ToolServices } from './mcp.tools.js';

export function createMcpModule(
  services: ToolServices,
  agents: AgentAccessService,
) {
  const service = new McpService(services, agents);
  return {
    service,
    register: (routes: HttpRoutes) => registerMcpController(routes, service),
  };
}
