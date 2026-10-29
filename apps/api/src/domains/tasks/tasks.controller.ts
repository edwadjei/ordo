import type { HttpRoutes } from '../../platform/http/http.js';
import { z } from 'zod';
import { archivedQuery, taskInput, taskPatch, revisionInput } from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import type { TasksService } from './tasks.service.js';

const idempotencyKey = z.string().min(1).max(128);

export function registerTasksController(
  routes: HttpRoutes,
  service: TasksService,
) {
  routes.get('/v1/tasks', async (request) =>
    service.list(
      actorId(request),
      archivedQuery.parse(request.query).includeArchived,
    ),
  );
  routes.get('/v1/tasks/:id', async (request) =>
    service.get(actorId(request), entityId(request)),
  );
  routes.post('/v1/tasks', async (request, reply) => {
    const result = await service.create(
      actorId(request),
      taskInput.parse(request.body),
      idempotencyKey.parse(request.header('idempotency-key')),
    );
    reply.status(result.created ? 201 : 200);
    return result.task;
  });
  routes.patch('/v1/tasks/:id', async (request) =>
    service.update(
      actorId(request),
      entityId(request),
      taskPatch.parse(request.body),
    ),
  );
  routes.delete('/v1/tasks/:id', async (request) =>
    service.archive(
      actorId(request),
      entityId(request),
      revisionInput.parse(request.body).expectedRevision,
    ),
  );
}
