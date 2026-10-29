import type { HttpRoutes } from '../../platform/http/http.js';
import { z } from 'zod';
import { archivedQuery, taskLinkInput } from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import type { RelatedService } from './related.service.js';

const linkParameters = z.object({ id: z.uuid(), noteId: z.uuid() });

export function registerRelatedController(
  routes: HttpRoutes,
  service: RelatedService,
) {
  routes.get('/v1/tasks/:id/related', async (request) =>
    service.related(
      actorId(request),
      entityId(request),
      archivedQuery.parse(request.query).includeArchived,
    ),
  );
  routes.post('/v1/tasks/:id/links', async (request, reply) => {
    const { link, created } = await service.link(
      actorId(request),
      entityId(request),
      taskLinkInput.parse(request.body).noteId,
    );
    reply.status(created ? 201 : 200);
    return link;
  });
  routes.delete('/v1/tasks/:id/links/:noteId', async (request, reply) => {
    const { id, noteId } = linkParameters.parse(request.params);
    await service.unlink(actorId(request), id, noteId);
    reply.status(204);
  });
}
