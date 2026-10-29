import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { WebContentHasher } from '../../adapters/cryptography/web-content-hasher.js';
import type { AiSettingsService } from '../ai-settings/ai-settings.service.js';
import type { NotesService } from '../notes/notes.service.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import { CaptureRepository } from './capture.repository.js';
import { CaptureService } from './capture.service.js';
import { registerCaptureController } from './capture.controller.js';

export function createCaptureModule(
  database: DatabaseAdapter,
  notes: NotesService,
  workspaces: WorkspacesService,
  ai: AiSettingsService,
) {
  const service = new CaptureService(
    new CaptureRepository(database),
    notes,
    workspaces,
    ai,
    new WebContentHasher(),
  );
  return {
    service,
    register: (routes: HttpRoutes) =>
      registerCaptureController(routes, service),
  };
}
