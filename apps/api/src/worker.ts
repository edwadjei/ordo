import { createDatabase } from '@ordo/db';
import { buildApp } from './app.js';
import { DatabaseAdapter } from './adapters/database/database.adapter.js';
import { GatekeeperOtpDelivery } from './adapters/gatekeeper/gatekeeper-otp-delivery.js';
import { ConsoleOtpDelivery } from './adapters/console/console-otp-delivery.js';
import { fromHex, randomBytes } from './adapters/cryptography/encoding.js';
import {
  BOOKMARK_HEADER,
  apiPath,
  openSession,
} from './adapters/http/worker-routing.js';
import {
  readWorkerConfig,
  type WorkerVariables,
} from './platform/config/worker-config.js';

// Only the default export may be a value: workerd treats every named
// export as an entrypoint. Helpers live in adapters/http/worker-routing.ts.
export interface Env extends WorkerVariables {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Composition {
  env: Env;
  app: ReturnType<typeof buildApp>;
  database: DatabaseAdapter;
}
let composed: Composition | undefined;

/** Builds the app once per isolate (no I/O) and reuses it for every request. */
function compose(env: Env): Composition {
  if (composed?.env === env) return composed;
  const config = readWorkerConfig(env);
  let otpHmacKey: Uint8Array;
  if (config.otpHmacKey) otpHmacKey = fromHex(config.otpHmacKey);
  else {
    // Development only (enforced by readWorkerConfig): codes stay valid
    // until this isolate restarts.
    otpHmacKey = randomBytes(32);
    console.warn(
      '[ordo dev] OTP_HMAC_KEY is not set; using a temporary key for this session.',
    );
  }
  const gatekeeper = new GatekeeperOtpDelivery(config.gatekeeper);
  const otpDelivery =
    gatekeeper.available() || !config.development
      ? gatekeeper
      : new ConsoleOtpDelivery(config.development);
  const database = new DatabaseAdapter();
  const app = buildApp({
    database,
    trustedOrigins: config.trustedOrigins,
    secureCookies: config.secureCookies,
    otpDelivery,
    otpHmacKey,
    audioSettings: {
      credentialKey: config.credentialKey
        ? fromHex(config.credentialKey)
        : undefined,
    },
  });
  composed = { env, app, database };
  return composed;
}

const unavailable = () =>
  Response.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed. Please retry.',
      },
    },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/'))
      return env.ASSETS.fetch(request);
    let composition: Composition;
    try {
      composition = compose(env);
    } catch (error) {
      // Configuration problems only; secret values are never included.
      console.error(`[ordo] Worker configuration: ${(error as Error).message}`);
      return unavailable();
    }
    const session = openSession(env.DB, request.headers.get(BOOKMARK_HEADER));
    const target = new URL(apiPath(url.pathname) + url.search, url);
    const response = await composition.database.run(
      createDatabase(session),
      async () => composition.app.hono.fetch(new Request(target, request)),
    );
    const bookmark = session.getBookmark();
    if (!bookmark) return response;
    const headers = new Headers(response.headers);
    headers.set(BOOKMARK_HEADER, bookmark);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
