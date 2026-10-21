import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { taskInput, taskPatch, revisionInput } from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import type { TasksService } from './tasks.service.js';

const idempotencyKey = z.string().min(1).max(128);

export function registerTasksController(
  app: FastifyInstance,
  service: TasksService,
) {
  app.get('/v1/tasks', async (request) => service.list(actorId(request)));
  app.get('/v1/tasks/:id', async (request) =>
    service.get(actorId(request), entityId(request)),
  );
  app.post('/v1/tasks', async (request, reply) => {
    const result = await service.create(
      actorId(request),
      taskInput.parse(request.body),
      idempotencyKey.parse(request.headers['idempotency-key']),
    );
    return reply.code(result.created ? 201 : 200).send(result.task);
  });
  app.patch('/v1/tasks/:id', async (request) =>
    service.update(
      actorId(request),
      entityId(request),
      taskPatch.parse(request.body),
    ),
  );
  app.delete('/v1/tasks/:id', async (request) =>
    service.archive(
      actorId(request),
      entityId(request),
      revisionInput.parse(request.body).expectedRevision,
    ),
  );
}
