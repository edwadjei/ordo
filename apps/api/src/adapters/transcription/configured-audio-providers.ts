import { AudioProviders } from '../../capabilities/audio-providers.contract.js';
import { OpenAiTranscriber } from './openai-transcriber.js';
import {
  LocalWhisperTranscriber,
  FfmpegDecoder,
} from './local-whisper-transcriber.js';
export class ConfiguredAudioProviders extends AudioProviders {
  private readonly whisper: LocalWhisperTranscriber;
  constructor(
    environment: NodeJS.ProcessEnv = process.env,
    private readonly transport: typeof fetch = fetch,
  ) {
    super();
    this.whisper = new LocalWhisperTranscriber(
      environment.ORDO_WHISPER_URL ?? 'http://127.0.0.1:4316',
      new FfmpegDecoder(
        environment.ORDO_FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg',
      ),
      transport,
    );
  }
  localAvailable() {
    return this.whisper.available();
  }
  local() {
    return this.whisper;
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
