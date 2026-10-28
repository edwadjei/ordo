import { AudioProviders } from '../../capabilities/audio-providers.contract.js';
import { OpenAiTranscriber } from './openai-transcriber.js';
import {
  WorkersAiTranscriber,
  type WorkersAiBinding,
} from './workers-ai-transcriber.js';

/**
 * Providers on the Worker: Workers AI Whisper through the `AI` binding (when
 * the Worker has one) and the account's own OpenAI key.
 */
export class ConfiguredAudioProviders extends AudioProviders {
  constructor(
    private readonly ai?: WorkersAiBinding,
    private readonly transport: typeof fetch = fetch,
  ) {
    super();
  }
  workersAiAvailable() {
    return Boolean(this.ai);
  }
  workersAi() {
    if (!this.ai) throw new Error('The Workers AI binding is not configured.');
    return new WorkersAiTranscriber(this.ai);
  }
  openAi(apiKey: string) {
    return new OpenAiTranscriber(apiKey, this.transport);
  }
  async testOpenAi(apiKey: string) {
    try {
      const response = await this.transport(
        'https://api.openai.com/v1/models',
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
