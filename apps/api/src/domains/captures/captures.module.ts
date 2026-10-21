import type { FastifyInstance } from 'fastify';
import type { CaptureStore } from '../../capabilities/capture-store.contract.js';
import type { Transcriber } from '../../capabilities/transcriber.contract.js';
import { LocalCaptureStore } from '../../adapters/captures/local-capture-store.js';
import { configuredTranscriber } from '../../adapters/transcription/openai-transcriber.js';
import { CapturesService } from './captures.service.js';
import { registerCapturesController } from './captures.controller.js';
export interface CaptureOptions {
  dataDir: string;
  store?: CaptureStore;
  transcriber?: Transcriber | null;
}
export function createCapturesModule(options: CaptureOptions) {
  const service = new CapturesService(
    options.store ?? new LocalCaptureStore(options.dataDir),
    options.transcriber === null
      ? undefined
      : (options.transcriber ?? configuredTranscriber()),
  );
  return {
    service,
    register: (app: FastifyInstance) =>
      registerCapturesController(app, service),
  };
}
