import type { Transcriber } from './transcriber.contract.js';
export abstract class AudioProviders {
  abstract localAvailable(): Promise<boolean>;
  abstract local(): Transcriber;
  abstract cloud(apiKey: string): Transcriber;
  abstract testCloud(apiKey: string): Promise<boolean>;
}
