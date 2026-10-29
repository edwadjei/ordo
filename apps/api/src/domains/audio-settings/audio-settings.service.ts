import { defaultAudioProvider, type AudioProvider } from '@ordo/core';
import type { AudioProviders } from '../../capabilities/audio-providers.contract.js';
import type { SecretCipher } from '../../capabilities/secret-cipher.contract.js';
import { fail } from '../../platform/http/api-failure.js';
import type { AudioSettingsRepository } from './audio-settings.repository.js';
export interface AudioSettingsInput {
  provider: AudioProvider;
  apiKey?: string;
  removeApiKey?: boolean;
}
const workersAiUnavailableMessage =
  "Built-in transcription isn't available on this server. Add an OpenAI key in Settings to transcribe here.";
export class AudioSettingsService {
  private testing = new Set<string>();
  constructor(
    private readonly repository: AudioSettingsRepository,
    private readonly providers: AudioProviders,
    private readonly cipher: SecretCipher,
  ) {}
  /** Whether the Worker has its Workers AI (`AI`) binding. */
  workersAiAvailable() {
    return this.providers.workersAiAvailable();
  }
  /**
   * Provider availability for this runtime. Workers AI needs the `AI`
   * binding; an account's own OpenAI key needs credential storage (the
   * secret cipher) to be configured.
   */
  async capabilities() {
    const credentialStorage = await this.cipher.configured();
    return {
      transcriptionProviders: {
        workersAi: this.workersAiAvailable(),
        openai: credentialStorage,
      },
      credentialStorage,
    };
  }
  /** Whether this account has an OpenAI key saved (selected or not). */
  async hasSavedKey(owner: string) {
    return Boolean((await this.repository.find(owner))?.encryptedApiKey);
  }
  async status(owner: string) {
    const row = await this.repository.find(owner),
      workersAiAvailable = this.workersAiAvailable(),
      provider = row?.provider ?? defaultAudioProvider,
      hasApiKey = Boolean(row?.encryptedApiKey);
    return {
      provider,
      workersAiAvailable,
      hasApiKey,
      configured: provider === 'workers_ai' ? workersAiAvailable : hasApiKey,
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
    await this.repository.save(
      owner,
      input.provider,
      input.removeApiKey ? null : encrypted,
    );
    return this.status(owner);
  }
  /**
   * The account's chosen transcriber. Never falls back from one provider to
   * the other: a missing binding or key is reported, not substituted.
   */
  async resolve(owner: string, expectedProvider?: AudioProvider) {
    const row = await this.repository.find(owner);
    const selected = row?.provider ?? defaultAudioProvider;
    if (!expectedProvider || selected !== expectedProvider)
      fail(
        409,
        'AUDIO_SETTINGS_CHANGED',
        'Audio provider changed. Review Settings and record again.',
      );
    if (selected === 'workers_ai') {
      if (!this.workersAiAvailable())
        fail(503, 'WORKERS_AI_UNAVAILABLE', workersAiUnavailableMessage);
      return this.providers.workersAi();
    }
    if (!row?.encryptedApiKey)
      return fail(
        503,
        'FEATURE_UNAVAILABLE',
        'Add your OpenAI key in Settings to transcribe.',
      );
    try {
      return this.providers.openAi(
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
      if ((row?.provider ?? defaultAudioProvider) === 'workers_ai') {
        // Readiness only: a test inference would spend the daily allowance.
        const ok = this.workersAiAvailable();
        return {
          ok,
          message: ok
            ? 'Built-in transcription is ready on this server.'
            : workersAiUnavailableMessage,
        };
      }
      if (!row?.encryptedApiKey)
        return { ok: false, message: 'Add your API key first.' };
      try {
        const ok = await this.providers.testOpenAi(
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
