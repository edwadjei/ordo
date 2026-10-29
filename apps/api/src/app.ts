import { DatabaseAdapter } from './adapters/database/database.adapter.js';
import { HttpPipeline } from './platform/http/http.js';
import { createRequestSecurity } from './platform/http/request-security.js';
import { createHonoHost } from './adapters/http/hono-host.js';
import { registerHealth } from './platform/http/health.js';
import { createIdentityModule } from './domains/identity/identity.module.js';
import { createWorkspacesModule } from './domains/workspaces/workspaces.module.js';
import { createTasksModule } from './domains/tasks/tasks.module.js';
import { createNotesModule } from './domains/notes/notes.module.js';
import { createHomeModule } from './domains/home/home.module.js';
import { createDemoModule } from './domains/demo/demo.module.js';
import {
  createAudioSettingsModule,
  type AudioSettingsOptions,
} from './domains/audio-settings/audio-settings.module.js';
import {
  createAiSettingsModule,
  type AiSettingsOptions,
} from './domains/ai-settings/ai-settings.module.js';
import { createDraftsModule } from './domains/drafts/drafts.module.js';
import { createCaptureModule } from './domains/capture/capture.module.js';
import type { OtpDelivery } from './capabilities/otp-delivery.contract.js';
import { createSearchModule } from './domains/search/search.module.js';
import {
  createTranscriptionsModule,
  type TranscriptionOptions,
} from './domains/transcriptions/transcriptions.module.js';

export interface AppOptions {
  /** Request-scoped D1 access; the Worker binds each request's session to it. */
  database: DatabaseAdapter;
  trustedOrigins: string[];
  secureCookies: boolean;
  /** Code transport: Gatekeeper, or the development-only console. */
  otpDelivery: OtpDelivery;
  /** The 32-byte `OTP_HMAC_KEY` secret. */
  otpHmacKey: Uint8Array;
  otpNow?: () => number;
  /** Per-client sign-in throttle on D1; on unless a test turns it off. */
  signInThrottle?: boolean;
  transcriptions?: TranscriptionOptions;
  audioSettings?: AudioSettingsOptions;
  /** Text AI for capture; tests pass fake providers. */
  aiSettings?: AiSettingsOptions;
}

/**
 * Composes the API. Building it does no I/O, so a Worker isolate builds it
 * once and reuses it for every request.
 */
export function buildApp(options: AppOptions) {
  const http = new HttpPipeline();
  const database = options.database;
  const identity = createIdentityModule(database, options.secureCookies, {
    otpDelivery: options.otpDelivery,
    otpHmacKey: options.otpHmacKey,
    otpNow: options.otpNow,
  });
  const workspaces = createWorkspacesModule(database);
  const tasks = createTasksModule(database, workspaces.service);
  const notes = createNotesModule(database, workspaces.service);
  const home = createHomeModule(
    workspaces.service,
    tasks.service,
    notes.service,
  );
  const demo = createDemoModule(database, home.service);
  const search = createSearchModule(database);
  const audioSettings = createAudioSettingsModule(
    database,
    options.audioSettings,
  );
  const aiSettings = createAiSettingsModule(
    database,
    audioSettings.service,
    options.aiSettings,
  );
  const drafts = createDraftsModule(
    database,
    workspaces.service,
    notes.service,
  );
  const capture = createCaptureModule(
    database,
    notes.service,
    workspaces.service,
    aiSettings.service,
  );
  const transcriptions = createTranscriptionsModule(
    options.transcriptions,
    audioSettings.service,
  );

  http.guard(
    createRequestSecurity({
      authenticator: identity.service,
      throttle:
        options.signInThrottle === false ? undefined : identity.throttle,
      trustedOrigins: options.trustedOrigins,
    }),
  );
  registerHealth(http);
  http.get('/v1/capabilities', async (request) => {
    const deliveryAvailable = options.otpDelivery.available();
    const audio = await audioSettings.service.capabilities();
    // Workers AI serves everyone; otherwise a signed-in account's own saved
    // OpenAI key (credential storage must be on to read it).
    const transcriptionReady =
      audio.transcriptionProviders.workersAi ||
      Boolean(
        request.actor &&
        audio.credentialStorage &&
        (await audioSettings.service.hasSavedKey(request.actor.id)),
      );
    return {
      otp: { email: deliveryAvailable, sms: deliveryAvailable },
      recording: transcriptionReady,
      transcription: transcriptionReady,
      // Signed in: whether the account's chosen provider can run now.
      // Signed out: whether the built-in provider exists on this server.
      aiCapture: request.actor
        ? await aiSettings.service.usable(request.actor.id)
        : aiSettings.service.workersAiAvailable(),
      transcriptImport: false,
      transcriptionProviders: audio.transcriptionProviders,
      credentialStorage: audio.credentialStorage,
    };
  });
  for (const module of [
    identity,
    workspaces,
    tasks,
    notes,
    home,
    demo,
    search,
    transcriptions,
    audioSettings,
    aiSettings,
    drafts,
    capture,
  ])
    module.register(http);
  return createHonoHost(http);
}
