import type { FastifyInstance } from 'fastify';
import type { Transcriber } from '../../capabilities/transcriber.contract.js';
import { configuredTranscriber } from '../../adapters/transcription/openai-transcriber.js';
import { TranscriptionsService } from './transcriptions.service.js';
import { registerTranscriptionsController } from './transcriptions.controller.js';
export interface TranscriptionOptions {
  transcriber?: Transcriber | null;
  timeoutMs?: number;
}
export function createTranscriptionsModule(options: TranscriptionOptions = {}) {
  const service = new TranscriptionsService(
    options.transcriber === null
      ? undefined
      : (options.transcriber ?? configuredTranscriber()),
    options.timeoutMs,
  );
  return {
    service,
    register: (app: FastifyInstance) =>
      registerTranscriptionsController(app, service),
  };
}
