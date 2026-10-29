import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { WorkspacesRepository } from './workspaces.repository.js';
import { WorkspacesService } from './workspaces.service.js';
import { PermanentDeleteRepository } from './permanent-delete.repository.js';
import { registerWorkspacesController } from './workspaces.controller.js';

export function createWorkspacesModule(database: DatabaseAdapter) {
  const service = new WorkspacesService(
    new WorkspacesRepository(database),
    new PermanentDeleteRepository(database),
  );
  return {
    service,
    register: (routes: HttpRoutes) =>
      registerWorkspacesController(routes, service),
  };
}
