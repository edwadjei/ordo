import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { NotesService } from '../notes/notes.service.js';
import { DraftsRepository } from './drafts.repository.js';
import { DraftsService } from './drafts.service.js';
import { registerDraftsController } from './drafts.controller.js';

export function createDraftsModule(
  database: DatabaseAdapter,
  workspaces: WorkspacesService,
  notes: NotesService,
) {
  const service = new DraftsService(
    new DraftsRepository(database),
    workspaces,
    notes,
  );
  return {
    service,
    register: (routes: HttpRoutes) => registerDraftsController(routes, service),
  };
}
