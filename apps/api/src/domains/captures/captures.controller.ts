import type { FastifyInstance } from 'fastify';
import { actorId, entityId } from '../../platform/http/request-context.js';
import { fail } from '../../platform/http/api-failure.js';
import {
  maximumCaptureBytes,
  type CapturesService,
} from './captures.service.js';
export function registerCapturesController(
  app: FastifyInstance,
  service: CapturesService,
) {
  app.addContentTypeParser(
    /^audio\/(?:webm|mp4|ogg|wav)(?:;.*)?$/,
    { parseAs: 'buffer', bodyLimit: maximumCaptureBytes },
    (_request, body, done) => done(null, body),
  );
  app.post(
    '/v1/captures',
    { bodyLimit: maximumCaptureBytes },
    async (request, reply) => {
      if (!Buffer.isBuffer(request.body))
        fail(415, 'UNSUPPORTED_AUDIO', 'Upload an audio recording.');
      return reply
        .code(201)
        .send(
          await service.create(
            actorId(request),
            request.headers['content-type'] ?? '',
            request.body,
          ),
        );
    },
  );
  app.get('/v1/captures', async (request) => ({
    captures: await service.list(actorId(request)),
  }));
  app.get('/v1/captures/:id', async (request) =>
    service.get(actorId(request), entityId(request)),
  );
  app.get('/v1/captures/:id/audio', async (request, reply) => {
    const { record, audio } = await service.audio(
      actorId(request),
      entityId(request),
    );
    return reply
      .header('Content-Type', record.mimeType)
      .header('Content-Disposition', 'inline; filename="recording"')
      .header('X-Content-Type-Options', 'nosniff')
      .send(audio);
  });
  app.post('/v1/captures/:id/transcribe', async (request) =>
    service.transcribe(actorId(request), entityId(request)),
  );
}
