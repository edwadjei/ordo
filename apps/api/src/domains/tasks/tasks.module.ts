import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { WebContentHasher } from '../../adapters/cryptography/web-content-hasher.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';
import { registerTasksController } from './tasks.controller.js';

export function createTasksModule(
  database: DatabaseAdapter,
  workspaces: WorkspacesService,
) {
  const service = new TasksService(
    new TasksRepository(database),
    database,
    workspaces,
    new WebContentHasher(),
  );
  return {
    service,
    register: (routes: HttpRoutes) => registerTasksController(routes, service),
  };
}
