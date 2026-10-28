import { AudioProviders } from '../../capabilities/audio-providers.contract.js';
import { Transcriber } from '../../capabilities/transcriber.contract.js';
import { OpenAiTranscriber } from './openai-transcriber.js';

class UnavailableTranscriber extends Transcriber {
  async transcribe(_audio: Uint8Array, _mimeType: string): Promise<string> {
    throw new Error('Local Whisper is not available on the Worker.');
  }
}

/**
 * Providers on the Worker: the account's own OpenAI key. Local Whisper needs
 * a local decoder process, which a Worker cannot start, so it always reports
 * unavailable here.
 */
export class ConfiguredAudioProviders extends AudioProviders {
  constructor(private readonly transport: typeof fetch = fetch) {
    super();
  }
  async localAvailable() {
    return false;
  }
  local() {
    return new UnavailableTranscriber();
  }
  cloud(apiKey: string) {
    return new OpenAiTranscriber(apiKey, this.transport);
  }
  async testCloud(apiKey: string) {
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
