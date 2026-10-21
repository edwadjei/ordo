import type { FastifyInstance } from 'fastify';
import { noteInput, notePatch, revisionInput } from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import type { NotesService } from './notes.service.js';

export function registerNotesController(
  app: FastifyInstance,
  service: NotesService,
) {
  app.get('/v1/notes', async (request) => service.list(actorId(request)));
  app.get('/v1/notes/:id', async (request) =>
    service.get(actorId(request), entityId(request)),
  );
  app.post('/v1/notes', async (request, reply) =>
    reply
      .code(201)
      .send(
        await service.create(actorId(request), noteInput.parse(request.body)),
      ),
  );
  app.patch('/v1/notes/:id', async (request) =>
    service.update(
      actorId(request),
      entityId(request),
      notePatch.parse(request.body),
    ),
  );
  app.delete('/v1/notes/:id', async (request) =>
    service.archive(
      actorId(request),
      entityId(request),
      revisionInput.parse(request.body).expectedRevision,
    ),
  );
}
