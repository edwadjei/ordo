import type { HttpRoutes } from '../../platform/http/http.js';
import { noteInput, notePatch, revisionInput } from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import { created } from '../../platform/http/response.js';
import type { NotesService } from './notes.service.js';

export function registerNotesController(
  routes: HttpRoutes,
  service: NotesService,
) {
  routes.get('/v1/notes', async (request) => service.list(actorId(request)));
  routes.get('/v1/notes/:id', async (request) =>
    service.get(actorId(request), entityId(request)),
  );
  routes.post('/v1/notes', async (request, reply) =>
    created(
      reply,
      await service.create(actorId(request), noteInput.parse(request.body)),
    ),
  );
  routes.patch('/v1/notes/:id', async (request) =>
    service.update(
      actorId(request),
      entityId(request),
      notePatch.parse(request.body),
    ),
  );
  routes.delete('/v1/notes/:id', async (request) =>
    service.archive(
      actorId(request),
      entityId(request),
      revisionInput.parse(request.body).expectedRevision,
    ),
  );
}
