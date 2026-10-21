import Fastify from 'fastify';
import type { DatabaseConnection } from '@ordo/db';
import { DatabaseAdapter } from './adapters/database/database.adapter.js';
import { registerErrorHandler } from './platform/http/error-handler.js';
import { registerRequestSecurity } from './platform/http/request-security.js';
import { registerHealth } from './platform/http/health.js';
import { createIdentityModule } from './domains/identity/identity.module.js';
import { createWorkspacesModule } from './domains/workspaces/workspaces.module.js';
import { createTasksModule } from './domains/tasks/tasks.module.js';
import { createNotesModule } from './domains/notes/notes.module.js';
import { createHomeModule } from './domains/home/home.module.js';
import { createDemoModule } from './domains/demo/demo.module.js';
import type { OtpDelivery } from './capabilities/otp-delivery.contract.js';
import { createSearchModule } from './domains/search/search.module.js';
import {
  createCapturesModule,
  type CaptureOptions,
} from './domains/captures/captures.module.js';
import { fileURLToPath } from 'node:url';

export interface AppOptions {
  connection: DatabaseConnection;
  trustedOrigins?: string[];
  secureCookies?: boolean;
  closeConnection?: boolean;
  otpDelivery?: OtpDelivery;
  otpNow?: () => number;
  captures?: CaptureOptions;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: false, bodyLimit: 150000, trustProxy: false });
  const database = new DatabaseAdapter(options.connection.db);
  const identity = await createIdentityModule(
    database,
    options.secureCookies ?? false,
    { otpDelivery: options.otpDelivery, otpNow: options.otpNow },
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
  const captures = createCapturesModule(
    options.captures ?? {
      dataDir: fileURLToPath(
        new URL('../../../.data/captures/', import.meta.url),
      ),
    },
  );

  registerErrorHandler(app);
  registerRequestSecurity(app, {
    authenticator: identity.service,
    trustedOrigins: options.trustedOrigins ?? [
      'http://localhost:3318',
      'http://127.0.0.1:3318',
    ],
  });
  registerHealth(app);
  app.get('/v1/capabilities', async () => {
    const deliveryAvailable =
      options.otpDelivery?.available() ??
      Boolean(
        process.env.GATEKEEPER_API_KEY?.trim() &&
        process.env.GATEKEEPER_API_URL?.trim(),
      );
    return {
      otp: { email: deliveryAvailable, sms: deliveryAvailable },
      recording: true,
      transcription: captures.service.transcriptionAvailable,
      aiCapture: false,
      transcriptImport: false,
    };
  });
  if (options.closeConnection !== false)
    app.addHook('onClose', async () => options.connection.close());
  for (const module of [
    identity,
    workspaces,
    tasks,
    notes,
    home,
    demo,
    search,
    captures,
  ])
    module.register(app);
  return app;
}
