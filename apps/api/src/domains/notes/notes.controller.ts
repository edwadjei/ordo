import type { HttpRoutes } from '../../platform/http/http.js';
import { noteInput, notePatch, revisionInput } from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import { created } from '../../platform/http/response.js';
import type { NotesService } from './notes.service.js';

/**
 * A note body may be 100,000 characters, which is up to 300,000 bytes when
 * every character takes three bytes in UTF-8, beyond the default 150,000-byte
 * body. Note create and edit alone accept 450,000 bytes.
 */
const NOTE_BODY_LIMIT = 450_000;

export function registerNotesController(
  routes: HttpRoutes,
  service: NotesService,
) {
  routes.get('/v1/notes', async (request) => service.list(actorId(request)));
  routes.get('/v1/notes/:id', async (request) =>
    service.get(actorId(request), entityId(request)),
  );
  routes.post(
    '/v1/notes',
    async (request, reply) =>
      created(
        reply,
        await service.create(actorId(request), noteInput.parse(request.body)),
      ),
    { jsonLimit: NOTE_BODY_LIMIT },
  );
  routes.patch(
    '/v1/notes/:id',
    async (request) =>
      service.update(
        actorId(request),
        entityId(request),
        notePatch.parse(request.body),
      ),
    { jsonLimit: NOTE_BODY_LIMIT },
  );
  routes.delete('/v1/notes/:id', async (request) =>
    service.archive(
      actorId(request),
      entityId(request),
      revisionInput.parse(request.body).expectedRevision,
    ),
  );
}
