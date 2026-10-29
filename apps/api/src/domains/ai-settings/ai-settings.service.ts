import {
  defaultTextProvider,
  type TextProvider,
  type aiSettingsPatch,
} from '@ordo/core';
import type { z } from 'zod';
import type {
  TextModel,
  TextModelProviders,
} from '../../capabilities/text-model.contract.js';
import type { SecretCipher } from '../../capabilities/secret-cipher.contract.js';
import { ApiFailure, fail } from '../../platform/http/api-failure.js';
import type { AudioSettingsService } from '../audio-settings/audio-settings.service.js';
import type {
  AiSettingsChanges,
  AiSettingsRepository,
} from './ai-settings.repository.js';

/**
 * The account's text-AI choice for AI capture. Workers AI is the default;
 * OpenAI uses the account's one OpenAI key (kept by audio settings and shared
 * with transcription); Anthropic uses a key stored here. Never falls back
 * from the chosen provider to another one.
 */
export class AiSettingsService {
  constructor(
    private readonly repository: AiSettingsRepository,
    private readonly providers: TextModelProviders,
    private readonly cipher: SecretCipher,
    private readonly audio: AudioSettingsService,
  ) {}

  async status(owner: string) {
    const [row, hasOpenAiKey] = await Promise.all([
      this.repository.find(owner),
      this.audio.hasSavedKey(owner),
    ]);
    const textProvider = row?.textProvider ?? defaultTextProvider;
    const hasAnthropicKey = Boolean(row?.encryptedAnthropicKey);
    const workersAiAvailable = this.providers.workersAiAvailable();
    const hasKey = { openai: hasOpenAiKey, anthropic: hasAnthropicKey };
    return {
      textProvider,
      workersAiAvailable,
      hasOpenAiKey,
      hasAnthropicKey,
      configured:
        textProvider === 'workers_ai'
          ? workersAiAvailable
          : hasKey[textProvider] && (await this.cipher.configured()),
    };
  }

  async update(owner: string, input: z.infer<typeof aiSettingsPatch>) {
    if (input.apiKey && input.removeApiKey)
      fail(
        400,
        'INVALID_INPUT',
        'Choose either replacing or removing the API key.',
      );
    const changes: AiSettingsChanges = {};
    if (input.textProvider) changes.textProvider = input.textProvider;
    if (input.apiKey || input.removeApiKey) {
      const chosen =
        input.textProvider ?? (await this.repository.find(owner))?.textProvider;
      const keyProvider =
        input.keyProvider ?? (chosen === 'workers_ai' ? undefined : chosen);
      if (!keyProvider)
        fail(
          400,
          'INVALID_INPUT',
          'Say which provider the key is for (keyProvider).',
        );
      const key = input.apiKey ?? null;
      if (keyProvider === 'openai') await this.audio.setOpenAiKey(owner, key);
      else
        changes.encryptedAnthropicKey = key
          ? await this.encrypt(owner, key)
          : null;
    }
    if (Object.keys(changes).length) await this.repository.save(owner, changes);
    return this.status(owner);
  }

  /** Whether the Worker has its Workers AI (`AI`) binding. */
  workersAiAvailable() {
    return this.providers.workersAiAvailable();
  }

  /** Whether this account can process a capture right now. */
  async usable(owner: string) {
    return (await this.status(owner)).configured;
  }

  /**
   * The account's chosen provider and its text model, from one read of the
   * settings. A missing binding or key is a 503 `unavailable` (the capture
   * is kept as `pending`), never a different provider.
   */
  async choose(
    owner: string,
  ): Promise<
    | { provider: TextProvider; model: TextModel; unavailable?: undefined }
    | { provider: TextProvider; model?: undefined; unavailable: ApiFailure }
  > {
    const row = await this.repository.find(owner);
    const provider: TextProvider = row?.textProvider ?? defaultTextProvider;
    try {
      return { provider, model: await this.model(owner, provider, row) };
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 503)
        return { provider, unavailable: error };
      throw error;
    }
  }

  private async model(
    owner: string,
    provider: TextProvider,
    row: Awaited<ReturnType<AiSettingsRepository['find']>>,
  ): Promise<TextModel> {
    if (provider === 'workers_ai') {
      if (!this.providers.workersAiAvailable())
        fail(
          503,
          'AI_UNAVAILABLE',
          "Built-in AI isn't available on this server. Add your own key in Settings, or process this capture later.",
        );
      return this.providers.workersAi();
    }
    if (provider === 'openai') {
      const key = await this.audio.openAiKey(owner);
      if (!key)
        fail(
          503,
          'AI_KEY_MISSING',
          'Add your OpenAI key in Settings to process captures.',
        );
      return this.providers.openAi(key);
    }
    if (!row?.encryptedAnthropicKey)
      fail(
        503,
        'AI_KEY_MISSING',
        'Add your Anthropic key in Settings to process captures.',
      );
    let key: string;
    try {
      key = await this.cipher.decrypt(owner, row.encryptedAnthropicKey);
    } catch {
      return fail(
        503,
        'CREDENTIAL_STORAGE_UNAVAILABLE',
        'The saved API key is unavailable. Add it again in Settings.',
      );
    }
    return this.providers.anthropic(key);
  }

  private async encrypt(owner: string, key: string) {
    try {
      return await this.cipher.encrypt(owner, key);
    } catch {
      return fail(
        503,
        'CREDENTIAL_STORAGE_UNAVAILABLE',
        'API key storage is unavailable. Please retry.',
      );
    }
  }
}
