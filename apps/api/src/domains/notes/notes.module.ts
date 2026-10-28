import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import { NotesRepository } from './notes.repository.js';
import { NotesService } from './notes.service.js';
import { registerNotesController } from './notes.controller.js';

export function createNotesModule(
  database: DatabaseAdapter,
  workspaces: WorkspacesService,
) {
  const service = new NotesService(new NotesRepository(database), workspaces);
  return {
    service,
    register: (routes: HttpRoutes) => registerNotesController(routes, service),
  };
}
