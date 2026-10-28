import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { type Env } from '../src/worker.js';
import {
  apiPath,
  BOOKMARK_HEADER,
} from '../src/adapters/http/worker-routing.js';
import { openTestDatabase } from './d1-harness.js';

const origin = 'http://127.0.0.1:8788';

async function workerEnv(
  t: { after(fn: () => Promise<void>): void },
  vars: Partial<Env> = { ORDO_ENV: 'development' },
) {
  const database = await openTestDatabase();
  t.after(() => database.close());
  const assets: string[] = [];
  const env = {
    DB: database.d1,
    ASSETS: {
      fetch: async (request: Request) => {
        assets.push(new URL(request.url).pathname);
        return new Response('static asset');
      },
    } as unknown as Fetcher,
    ...vars,
  } as Env;
  const send = (path: string, init: RequestInit = {}) =>
    worker.fetch(new Request(`${origin}${path}`, init), env);
  return { env, assets, send, database };
}

test('/api/* maps to the API, /api/health to health, everything else is a static asset', async (t) => {
  assert.equal(apiPath('/api/tasks/1'), '/v1/tasks/1');
  assert.equal(apiPath('/api/health'), '/health');
  assert.equal(apiPath('/api/auth/otp/request'), '/v1/auth/otp/request');
  const { send, assets } = await workerEnv(t);
  assert.equal(await (await send('/')).text(), 'static asset');
  assert.equal(await (await send('/app/settings')).text(), 'static asset');
  assert.deepEqual(assets, ['/', '/app/settings']);
  const health = await send('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const capabilities: any = await (await send('/api/capabilities')).json();
  assert.equal(
    capabilities.otp.email,
    true,
    'console transport in development',
  );
  // Development leaves Workers AI off (ORDO_WORKERS_AI), so no binding is used.
  assert.equal(capabilities.transcriptionProviders.workersAi, false);
  assert.equal(capabilities.transcription, false);
  assert.equal(capabilities.credentialStorage, false);
  assert.equal((await send('/api/home')).status, 401);
  assert.equal((await send('/v1/home')).status, 200, 'not an API path');
});

test('code sign-in on the Worker with the console transport, and D1 bookmarks carried between requests', async (t) => {
  const { send } = await workerEnv(t);
  const lines: string[] = [];
  const log = console.log;
  console.log = (line: string) => lines.push(String(line));
  let requested: Response;
  try {
    requested = await send('/api/auth/otp/request', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ contact: 'worker@example.invalid' }),
    });
  } finally {
    console.log = log;
  }
  assert.equal(requested.status, 202);
  const code = lines.join('\n').match(/: (\d{6}) \(development only/)?.[1];
  assert.ok(code, 'the code is printed to the wrangler terminal');
  assert.ok(!lines.join('\n').includes('worker@'), 'contact is masked');
  const verified = await send('/api/auth/otp/verify', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      challengeId: ((await requested.json()) as any).challengeId,
      code,
    }),
  });
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get('set-cookie')!.split(';')[0];
  assert.ok(!/;\s*Secure/i.test(verified.headers.get('set-cookie')!));
  const bookmark = verified.headers.get(BOOKMARK_HEADER);
  assert.ok(bookmark, 'every API response returns the latest bookmark');
  const created = await send('/api/tasks', {
    method: 'POST',
    headers: {
      origin,
      cookie,
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
      [BOOKMARK_HEADER]: bookmark,
    },
    body: JSON.stringify({ title: 'Saved on the Worker' }),
  });
  assert.equal(created.status, 201);
  const afterWrite = created.headers.get(BOOKMARK_HEADER)!;
  assert.ok(afterWrite);
  assert.ok(afterWrite >= bookmark, 'bookmarks only move forward');
  const home = await send('/api/home', {
    headers: { cookie, [BOOKMARK_HEADER]: afterWrite },
  });
  assert.equal(home.status, 200);
  assert.equal(
    ((await home.json()) as any).tasks[0].title,
    'Saved on the Worker',
  );
  // A malformed bookmark is ignored rather than failing the request.
  const odd = await send('/api/home', {
    headers: { cookie, [BOOKMARK_HEADER]: 'not a bookmark!' },
  });
  assert.equal(odd.status, 200);
  // The Worker's own origin is trusted; others are not.
  const foreign = await send('/api/workspaces', {
    method: 'POST',
    headers: {
      origin: 'https://elsewhere.invalid',
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'Nope' }),
  });
  assert.equal(foreign.status, 403);
});

test('a hosted Worker without its secrets refuses API requests with a generic error', async (t) => {
  const { send } = await workerEnv(t, {});
  const errors: string[] = [];
  const error = console.error;
  console.error = (line: string) => errors.push(String(line));
  try {
    const response = await send('/api/health');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed. Please retry.',
      },
    });
  } finally {
    console.error = error;
  }
  assert.match(errors.join('\n'), /OTP_HMAC_KEY/);
  // Static assets do not depend on API configuration.
  assert.equal(await (await send('/')).text(), 'static asset');
});

test('the Worker passes its AI binding to Workers AI unless development leaves it off', async (t) => {
  const ai = { run: async () => ({ text: 'never called' }) } as unknown as Ai;
  const capabilities = async (vars: Partial<Env>) => {
    const { send } = await workerEnv(t, vars);
    return (await (await send('/api/capabilities')).json()) as {
      transcription: boolean;
      transcriptionProviders: { workersAi: boolean };
    };
  };
  const local = await capabilities({ ORDO_ENV: 'development', AI: ai });
  assert.equal(local.transcriptionProviders.workersAi, false);
  const enabled = await capabilities({
    ORDO_ENV: 'development',
    ORDO_WORKERS_AI: 'on',
    AI: ai,
  });
  assert.equal(enabled.transcriptionProviders.workersAi, true);
  assert.equal(enabled.transcription, true);
  const unbound = await capabilities({
    ORDO_ENV: 'development',
    ORDO_WORKERS_AI: 'on',
  });
  assert.equal(unbound.transcriptionProviders.workersAi, false);
});
