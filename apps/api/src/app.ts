import type { DatabaseConnection } from '@ordo/db';
import { DatabaseAdapter } from './adapters/database/database.adapter.js';
import { HttpPipeline } from './platform/http/http.js';
import { createRequestSecurity } from './platform/http/request-security.js';
import { createFastifyHost } from './adapters/http/fastify-host.js';
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
import type { OtpDelivery } from './capabilities/otp-delivery.contract.js';
import { createSearchModule } from './domains/search/search.module.js';
import {
  createTranscriptionsModule,
  type TranscriptionOptions,
} from './domains/transcriptions/transcriptions.module.js';

export interface AppOptions {
  connection: DatabaseConnection;
  trustedOrigins?: string[];
  secureCookies?: boolean;
  closeConnection?: boolean;
  otpDelivery?: OtpDelivery;
  otpNow?: () => number;
  otpHmacKey?: string;
  otpKeyFile?: string;
  transcriptions?: TranscriptionOptions;
  audioSettings?: AudioSettingsOptions;
}

export async function buildApp(options: AppOptions) {
  const http = new HttpPipeline();
  const database = new DatabaseAdapter(options.connection.db);
  const identity = await createIdentityModule(
    database,
    options.secureCookies ?? false,
    {
      otpDelivery: options.otpDelivery,
      otpNow: options.otpNow,
      otpHmacKey: options.otpHmacKey,
      otpKeyFile: options.otpKeyFile,
    },
  );
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
  const transcriptions = createTranscriptionsModule(
    options.transcriptions,
    audioSettings.service,
  );

  http.guard(
    createRequestSecurity({
      authenticator: identity.service,
      trustedOrigins: options.trustedOrigins ?? [
        'http://localhost:3318',
        'http://127.0.0.1:3318',
      ],
    }),
  );
  registerHealth(http);
  http.get('/v1/capabilities', async () => {
    const deliveryAvailable =
      options.otpDelivery?.available() ??
      Boolean(
        process.env.GATEKEEPER_API_KEY?.trim() &&
        process.env.GATEKEEPER_API_URL?.trim(),
      );
    const localReady = await audioSettings.service.localAvailable();
    return {
      otp: { email: deliveryAvailable, sms: deliveryAvailable },
      recording: localReady,
      transcription: localReady,
      aiCapture: false,
      transcriptImport: false,
    };
  });
  if (options.closeConnection !== false)
    http.onClose(async () => options.connection.close());
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
  ])
    module.register(http);
  return createFastifyHost(http);
}
