import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import type { AudioProviders } from '../../capabilities/audio-providers.contract.js';
import type { SecretCipher } from '../../capabilities/secret-cipher.contract.js';
import { ConfiguredAudioProviders } from '../../adapters/transcription/configured-audio-providers.js';
import { WebSecretCipher } from '../../adapters/secrets/web-secret-cipher.js';
import { AudioSettingsRepository } from './audio-settings.repository.js';
import { AudioSettingsService } from './audio-settings.service.js';
import { registerAudioSettingsController } from './audio-settings.controller.js';
export interface AudioSettingsOptions {
  providers?: AudioProviders;
  cipher?: SecretCipher;
  /**
   * The 32-byte `ORDO_CREDENTIAL_KEY` secret. Without it credential storage
   * reports unavailable and no provider key can be saved or read.
   */
  credentialKey?: Uint8Array;
}
export function createAudioSettingsModule(
  database: DatabaseAdapter,
  options: AudioSettingsOptions = {},
) {
  const credentialKey = options.credentialKey;
  const service = new AudioSettingsService(
    new AudioSettingsRepository(database),
    options.providers ?? new ConfiguredAudioProviders(),
    options.cipher ??
      new WebSecretCipher(async () => {
        if (!credentialKey)
          throw new Error('Credential encryption is not configured');
        return credentialKey;
      }),
  );
  return {
    service,
    register: (routes: HttpRoutes) =>
      registerAudioSettingsController(routes, service),
  };
}
