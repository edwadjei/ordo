import type { FastifyInstance } from 'fastify';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { WorkspacesRepository } from './workspaces.repository.js';
import { WorkspacesService } from './workspaces.service.js';
import { registerWorkspacesController } from './workspaces.controller.js';

export function createWorkspacesModule(database: DatabaseAdapter) {
  const service = new WorkspacesService(
    new WorkspacesRepository(database),
    database,
  );
  return {
    service,
    register: (app: FastifyInstance) =>
      registerWorkspacesController(app, service),
  };
}
