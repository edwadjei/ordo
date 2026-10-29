import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import type { SecretCipher } from '../../capabilities/secret-cipher.contract.js';
import type { TextModelProviders } from '../../capabilities/text-model.contract.js';
import { ConfiguredTextModelProviders } from '../../adapters/text-ai/configured-text-model-providers.js';
import type { WorkersAiTextBinding } from '../../adapters/text-ai/workers-ai-text-model.js';
import { WebSecretCipher } from '../../adapters/secrets/web-secret-cipher.js';
import type { AudioSettingsService } from '../audio-settings/audio-settings.service.js';
import { AiSettingsRepository } from './ai-settings.repository.js';
import { AiSettingsService } from './ai-settings.service.js';
import { registerAiSettingsController } from './ai-settings.controller.js';
export interface AiSettingsOptions {
  /** Test seam: replaces the configured providers (a fake model). */
  providers?: TextModelProviders;
  /** The Worker's `AI` binding; without it Workers AI reports unavailable. */
  ai?: WorkersAiTextBinding;
  cipher?: SecretCipher;
  /** The 32-byte `ORDO_CREDENTIAL_KEY` secret, shared with audio settings. */
  credentialKey?: Uint8Array;
}
export function createAiSettingsModule(
  database: DatabaseAdapter,
  audio: AudioSettingsService,
  options: AiSettingsOptions = {},
) {
  const credentialKey = options.credentialKey;
  const service = new AiSettingsService(
    new AiSettingsRepository(database),
    options.providers ?? new ConfiguredTextModelProviders(options.ai),
    options.cipher ??
      new WebSecretCipher(async () => {
        if (!credentialKey)
          throw new Error('Credential encryption is not configured');
        return credentialKey;
      }),
    audio,
  );
  return {
    service,
    register: (routes: HttpRoutes) =>
      registerAiSettingsController(routes, service),
  };
}
