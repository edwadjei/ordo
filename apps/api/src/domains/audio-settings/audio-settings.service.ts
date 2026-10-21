import type { AudioProviders } from '../../capabilities/audio-providers.contract.js';
import type { SecretCipher } from '../../capabilities/secret-cipher.contract.js';
import { fail } from '../../platform/http/api-failure.js';
import type { AudioSettingsRepository } from './audio-settings.repository.js';
export interface AudioSettingsInput {
  provider: 'local_whisper' | 'openai';
  apiKey?: string;
  removeApiKey?: boolean;
}
export class AudioSettingsService {
  private testing = new Set<string>();
  constructor(
    private readonly repository: AudioSettingsRepository,
    private readonly providers: AudioProviders,
    private readonly cipher: SecretCipher,
  ) {}
  localAvailable() {
    return this.providers.localAvailable();
  }
  async status(owner: string) {
    const row = await this.repository.find(owner),
      localAvailable = await this.localAvailable(),
      provider = row?.provider ?? 'local_whisper',
      hasApiKey = Boolean(row?.encryptedApiKey);
    return {
      provider,
      localAvailable,
      hasApiKey,
      configured: provider === 'local_whisper' ? localAvailable : hasApiKey,
    };
  }
  async update(owner: string, input: AudioSettingsInput) {
    if (input.apiKey && input.removeApiKey)
      fail(
        400,
        'INVALID_INPUT',
        'Choose either replacing or removing the API key.',
      );
    let encrypted: string | undefined;
    if (input.apiKey) {
      try {
        encrypted = await this.cipher.encrypt(owner, input.apiKey);
      } catch {
        fail(
          503,
          'CREDENTIAL_STORAGE_UNAVAILABLE',
          'API key storage is unavailable. Please retry.',
        );
      }
    }
    await this.repository.forOwner(owner, async (transaction) => {
      const previous = await this.repository.find(owner, transaction);
      await this.repository.save(
        owner,
        input.provider,
        input.removeApiKey
          ? null
          : (encrypted ?? previous?.encryptedApiKey ?? null),
        transaction,
      );
    });
    return this.status(owner);
  }
  async resolve(owner: string, expectedProvider?: 'local_whisper' | 'openai') {
    const row = await this.repository.find(owner);
    const selected = row?.provider ?? 'local_whisper';
    if (!expectedProvider || selected !== expectedProvider)
      fail(
        409,
        'AUDIO_SETTINGS_CHANGED',
        'Audio provider changed. Review Settings and record again.',
      );
    if ((row?.provider ?? 'local_whisper') === 'local_whisper')
      return (await this.localAvailable()) ? this.providers.local() : undefined;
    if (!row?.encryptedApiKey) return undefined;
    try {
      return this.providers.cloud(
        await this.cipher.decrypt(owner, row.encryptedApiKey),
      );
    } catch {
      return fail(
        503,
        'CREDENTIAL_STORAGE_UNAVAILABLE',
        'The saved API key is unavailable. Add it again in Settings.',
      );
    }
  }
  async test(owner: string) {
    if (this.testing.has(owner))
      fail(
        429,
        'PROVIDER_TEST_BUSY',
        'Wait for your current provider test to finish.',
      );
    this.testing.add(owner);
    try {
      const row = await this.repository.find(owner);
      if ((row?.provider ?? 'local_whisper') === 'local_whisper') {
        const ok = await this.localAvailable();
        return {
          ok,
          message: ok
            ? 'Local Whisper is ready on this server.'
            : 'Local Whisper is not running or the decoder is unavailable.',
        };
      }
      if (!row?.encryptedApiKey)
        return { ok: false, message: 'Add your API key first.' };
      try {
        const ok = await this.providers.testCloud(
          await this.cipher.decrypt(owner, row.encryptedApiKey),
        );
        return {
          ok,
          message: ok
            ? 'The API key was accepted.'
            : 'The API key could not be verified. Check it and retry.',
        };
      } catch {
        return {
          ok: false,
          message: 'The saved API key could not be read. Add it again.',
        };
      }
    } finally {
      this.testing.delete(owner);
    }
  }
}
