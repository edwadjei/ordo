import type { HttpRoutes } from '../../platform/http/http.js';
import { z } from 'zod';
import { captureProcessInput, captureSaveInput } from '@ordo/core';
import {
  actorId,
  currentUser,
  entityId,
} from '../../platform/http/request-context.js';
import { created } from '../../platform/http/response.js';
import type { CaptureService } from './capture.service.js';

const idempotencyKey = z.string().min(1).max(128);

export function registerCaptureController(
  routes: HttpRoutes,
  service: CaptureService,
) {
  routes.post('/v1/notes/:id/process', async (request, reply) =>
    created(
      reply,
      await service.process(
        currentUser(request),
        entityId(request),
        captureProcessInput.parse(request.body ?? {}),
        request.signal,
      ),
    ),
  );
  routes.get('/v1/notes/:id/capture-runs', async (request) =>
    service.listForNote(actorId(request), entityId(request)),
  );
  routes.get('/v1/capture-runs/:id', async (request) =>
    service.get(actorId(request), entityId(request)),
  );
  routes.post('/v1/capture-runs/:id/save', async (request, reply) => {
    const owner = actorId(request);
    const { created: isNew, ...result } = await service.save(
      owner,
      entityId(request),
      captureSaveInput.parse(request.body),
      idempotencyKey.parse(request.header('idempotency-key')),
    );
    reply.status(isNew ? 201 : 200);
    return result;
  });
}
