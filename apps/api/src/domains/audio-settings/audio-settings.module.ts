import type { FastifyInstance } from 'fastify';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import type { AudioProviders } from '../../capabilities/audio-providers.contract.js';
import type { SecretCipher } from '../../capabilities/secret-cipher.contract.js';
import { ConfiguredAudioProviders } from '../../adapters/transcription/configured-audio-providers.js';
import { FileSecretCipher } from '../../adapters/secrets/file-secret-cipher.js';
import { fileURLToPath } from 'node:url';
import { AudioSettingsRepository } from './audio-settings.repository.js';
import { AudioSettingsService } from './audio-settings.service.js';
import { registerAudioSettingsController } from './audio-settings.controller.js';
export interface AudioSettingsOptions {
  providers?: AudioProviders;
  cipher?: SecretCipher;
  environment?: NodeJS.ProcessEnv;
  keyFile?: string;
}
export function createAudioSettingsModule(
  database: DatabaseAdapter,
  options: AudioSettingsOptions = {},
) {
  const environment = options.environment ?? process.env;
  const service = new AudioSettingsService(
    new AudioSettingsRepository(database),
    options.providers ?? new ConfiguredAudioProviders(environment),
    options.cipher ??
      new FileSecretCipher(
        options.keyFile ??
          fileURLToPath(
            new URL('../../../../../.data/secrets/audio-key', import.meta.url),
          ),
        environment.ORDO_CREDENTIAL_KEY,
      ),
  );
  return {
    service,
    register: (app: FastifyInstance) =>
      registerAudioSettingsController(app, service),
  };
}
