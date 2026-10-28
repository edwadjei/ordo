import type { HttpRoutes } from '../../platform/http/http.js';
import { z } from 'zod';
import { audioProviders } from '@ordo/core';
import { fail } from '../../platform/http/api-failure.js';
import { actorId } from '../../platform/http/request-context.js';
import type { AudioSettingsService } from './audio-settings.service.js';
const input = z
  .object({
    provider: z.enum(audioProviders),
    apiKey: z
      .string()
      .trim()
      .min(16)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    removeApiKey: z.boolean().optional(),
  })
  .strict();
export function registerAudioSettingsController(
  routes: HttpRoutes,
  service: AudioSettingsService,
) {
  routes.get('/v1/settings/audio', (request) =>
    service.status(actorId(request)),
  );
  routes.patch('/v1/settings/audio', (request) => {
    const changes = input.parse(request.body);
    if (changes.apiKey) {
      const origin = new URL(request.header('origin')!);
      if (
        origin.protocol !== 'https:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      )
        fail(
          400,
          'SECURE_CONNECTION_REQUIRED',
          'Use HTTPS or localhost to add an API key.',
        );
    }
    return service.update(actorId(request), changes);
  });
  routes.post('/v1/settings/audio/test', (request) =>
    service.test(actorId(request)),
  );
}
