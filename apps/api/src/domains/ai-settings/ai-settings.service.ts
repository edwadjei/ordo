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
import { fail } from '../../platform/http/api-failure.js';
import type {
  AiSettingsChanges,
  AiSettingsRepository,
} from './ai-settings.repository.js';

const providerNames: Record<Exclude<TextProvider, 'workers_ai'>, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

/**
 * The account's text-AI choice for AI capture. Workers AI is the default;
 * OpenAI and Anthropic use the account's own key, encrypted like audio keys.
 * Never falls back from the chosen provider to another one.
 */
export class AiSettingsService {
  constructor(
    private readonly repository: AiSettingsRepository,
    private readonly providers: TextModelProviders,
    private readonly cipher: SecretCipher,
  ) {}

  async status(owner: string) {
    const row = await this.repository.find(owner);
    const textProvider = row?.textProvider ?? defaultTextProvider;
    const keys = {
      openai: Boolean(row?.encryptedOpenaiKey),
      anthropic: Boolean(row?.encryptedAnthropicKey),
    };
    const workersAiAvailable = this.providers.workersAiAvailable();
    return {
      textProvider,
      workersAiAvailable,
      hasOpenaiKey: keys.openai,
      hasAnthropicKey: keys.anthropic,
      configured:
        textProvider === 'workers_ai'
          ? workersAiAvailable
          : keys[textProvider] && (await this.cipher.configured()),
    };
  }

  async update(owner: string, input: z.infer<typeof aiSettingsPatch>) {
    if (
      (input.openaiKey && input.removeOpenaiKey) ||
      (input.anthropicKey && input.removeAnthropicKey)
    )
      fail(
        400,
        'INVALID_INPUT',
        'Choose either replacing or removing the API key.',
      );
    const changes: AiSettingsChanges = {};
    if (input.textProvider) changes.textProvider = input.textProvider;
    if (input.openaiKey)
      changes.encryptedOpenaiKey = await this.encrypt(owner, input.openaiKey);
    if (input.anthropicKey)
      changes.encryptedAnthropicKey = await this.encrypt(
        owner,
        input.anthropicKey,
      );
    if (input.removeOpenaiKey) changes.encryptedOpenaiKey = null;
    if (input.removeAnthropicKey) changes.encryptedAnthropicKey = null;
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
   * The account's chosen text model. A missing binding or key is a 503 (the
   * capture is kept as `pending`), never a different provider.
   */
  async resolve(owner: string): Promise<TextModel> {
    const row = await this.repository.find(owner);
    const provider = row?.textProvider ?? defaultTextProvider;
    if (provider === 'workers_ai') {
      if (!this.providers.workersAiAvailable())
        fail(
          503,
          'AI_UNAVAILABLE',
          "Built-in AI isn't available on this server. Add your own key in Settings, or process this capture later.",
        );
      return this.providers.workersAi();
    }
    const encrypted =
      provider === 'openai'
        ? row?.encryptedOpenaiKey
        : row?.encryptedAnthropicKey;
    if (!encrypted)
      fail(
        503,
        'AI_KEY_MISSING',
        `Add your ${providerNames[provider]} key in Settings to process captures.`,
      );
    let key: string;
    try {
      key = await this.cipher.decrypt(owner, encrypted);
    } catch {
      return fail(
        503,
        'CREDENTIAL_STORAGE_UNAVAILABLE',
        'The saved API key is unavailable. Add it again in Settings.',
      );
    }
    return provider === 'openai'
      ? this.providers.openAi(key)
      : this.providers.anthropic(key);
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
