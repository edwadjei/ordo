import type { FastifyInstance } from 'fastify';
import { actorId } from '../../platform/http/request-context.js';
import { fail } from '../../platform/http/api-failure.js';
import {
  maximumAudioBytes,
  type TranscriptionsService,
} from './transcriptions.service.js';
export function registerTranscriptionsController(
  app: FastifyInstance,
  service: TranscriptionsService,
) {
  app.addContentTypeParser(
    /^audio\/(?:webm|mp4|ogg|wav)(?:;.*)?$/,
    { parseAs: 'buffer', bodyLimit: maximumAudioBytes },
    (_request, body, done) => done(null, body),
  );
  app.post(
    '/v1/transcriptions',
    { bodyLimit: maximumAudioBytes },
    async (request, reply) => {
      if (!Buffer.isBuffer(request.body))
        fail(415, 'UNSUPPORTED_AUDIO', 'Upload temporary audio to transcribe.');
      const control = new AbortController();
      const abort = () => control.abort();
      const closed = () => {
        if (!reply.raw.writableEnded) control.abort();
      };
      request.raw.once('aborted', abort);
      reply.raw.once('close', closed);
      try {
        return await service.transcribe(
          actorId(request),
          request.headers['content-type'] ?? '',
          request.body,
          control.signal,
        );
      } finally {
        request.raw.off('aborted', abort);
        reply.raw.off('close', closed);
      }
    },
  );
}
