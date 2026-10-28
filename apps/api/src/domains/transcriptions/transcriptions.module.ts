import type { HttpRoutes } from '../../platform/http/http.js';
import type { Transcriber } from '../../capabilities/transcriber.contract.js';
import type { AudioSettingsService } from '../audio-settings/audio-settings.service.js';
import { TranscriptionsService } from './transcriptions.service.js';
import { registerTranscriptionsController } from './transcriptions.controller.js';
export interface TranscriptionOptions {
  transcriber?: Transcriber | null;
  timeoutMs?: number;
}
export function createTranscriptionsModule(
  options: TranscriptionOptions = {},
  settings?: AudioSettingsService,
) {
  const service = new TranscriptionsService(
    options.transcriber ?? undefined,
    options.timeoutMs,
    options.transcriber === undefined && settings
      ? (owner, expectedProvider) => settings.resolve(owner, expectedProvider)
      : undefined,
  );
  return {
    service,
    register: (routes: HttpRoutes) =>
      registerTranscriptionsController(routes, service),
  };
}
