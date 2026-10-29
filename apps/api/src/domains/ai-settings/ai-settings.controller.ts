import type { HttpRoutes } from '../../platform/http/http.js';
import { aiSettingsPatch } from '@ordo/core';
import { fail } from '../../platform/http/api-failure.js';
import { actorId } from '../../platform/http/request-context.js';
import type { AiSettingsService } from './ai-settings.service.js';
export function registerAiSettingsController(
  routes: HttpRoutes,
  service: AiSettingsService,
) {
  routes.get('/v1/settings/ai', (request) => service.status(actorId(request)));
  routes.patch('/v1/settings/ai', (request) => {
    const changes = aiSettingsPatch.parse(request.body);
    if (changes.openaiKey || changes.anthropicKey) {
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
}
