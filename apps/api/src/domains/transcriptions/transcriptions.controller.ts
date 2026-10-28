import { z } from 'zod';
import type { HttpRoutes } from '../../platform/http/http.js';
import { actorId } from '../../platform/http/request-context.js';
import { fail } from '../../platform/http/api-failure.js';
import {
  maximumAudioBytes,
  type TranscriptionsService,
} from './transcriptions.service.js';
export function registerTranscriptionsController(
  routes: HttpRoutes,
  service: TranscriptionsService,
) {
  routes.post(
    '/v1/transcriptions',
    async (request) => {
      const audio = request.body;
      if (!(audio instanceof Uint8Array))
        fail(415, 'UNSUPPORTED_AUDIO', 'Upload temporary audio to transcribe.');
      try {
        // request.signal aborts when the caller disconnects.
        return await service.transcribe(
          actorId(request),
          request.header('content-type') ?? '',
          audio,
          request.signal,
          z
            .enum(['local_whisper', 'openai'])
            .optional()
            .parse(request.header('x-ordo-audio-provider')),
        );
      } finally {
        audio.fill(0);
      }
    },
    {
      rawBody: {
        contentType: /^audio\/(?:webm|mp4|ogg|wav)(?:;.*)?$/,
        limit: maximumAudioBytes,
      },
    },
  );
}
