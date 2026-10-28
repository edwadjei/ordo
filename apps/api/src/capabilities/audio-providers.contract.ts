import type { Transcriber } from './transcriber.contract.js';
/**
 * Transcription providers available to this runtime. Workers AI runs through
 * the Worker's `AI` binding; OpenAI uses an account's own decrypted key.
 */
export abstract class AudioProviders {
  /** Whether the Worker has an `AI` binding. */
  abstract workersAiAvailable(): boolean;
  abstract workersAi(): Transcriber;
  abstract openAi(apiKey: string): Transcriber;
  /** Checks a key without sending audio or paying for inference. */
  abstract testOpenAi(apiKey: string): Promise<boolean>;
}
