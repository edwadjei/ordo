import type { HttpRoutes } from '../../platform/http/http.js';
import { draftInput, draftPatch, revisionInput } from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import { created } from '../../platform/http/response.js';
import type { DraftsService } from './drafts.service.js';

export function registerDraftsController(
  routes: HttpRoutes,
  service: DraftsService,
) {
  routes.get('/v1/drafts', async (request) => service.list(actorId(request)));
  routes.get('/v1/drafts/:id', async (request) =>
    service.get(actorId(request), entityId(request)),
  );
  routes.post('/v1/drafts', async (request, reply) =>
    created(
      reply,
      await service.create(actorId(request), draftInput.parse(request.body)),
    ),
  );
  routes.patch('/v1/drafts/:id', async (request) =>
    service.update(
      actorId(request),
      entityId(request),
      draftPatch.parse(request.body),
    ),
  );
  routes.delete('/v1/drafts/:id', async (request) =>
    service.archive(
      actorId(request),
      entityId(request),
      revisionInput.parse(request.body).expectedRevision,
    ),
  );
}
