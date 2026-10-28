import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { createDatabase, type Database } from '@ordo/db';
import { migrationsDirectory } from '@ordo/db/migrations';
import { buildApp, type AppOptions } from '../src/app.js';
import { DatabaseAdapter } from '../src/adapters/database/database.adapter.js';
import { OtpDelivery } from '../src/capabilities/otp-delivery.contract.js';
import { fromHex } from '../src/adapters/cryptography/encoding.js';
import { testClient, type TestApp } from './http-harness.js';

export const origin = 'http://localhost:3318';
// Fictional 32-byte test key; real deployments read the OTP_HMAC_KEY secret.
export const testOtpKey = '0f'.repeat(32);
const wranglerConfig = fileURLToPath(
  new URL('../wrangler.jsonc', import.meta.url),
);

export interface TestDatabase {
  /** The local D1 binding (Miniflare, through Wrangler's platform proxy). */
  d1: D1Database;
  db: Database;
  close(): Promise<void>;
}

/** Numbered migration files, split into statements exactly as Wrangler does. */
export async function migrationStatements() {
  const files = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_[\w-]+\.sql$/.test(name))
    .sort();
  return Promise.all(
    files.map(async (name) => ({
      name,
      statements: unstable_splitSqlQuery(
        await readFile(new URL(name, migrationsDirectory), 'utf8'),
      ),
    })),
  );
}

/**
 * A fresh, isolated local D1 database with every migration applied. It is
 * in-memory (nothing persisted, no Cloudflare account, no remote bindings)
 * and disposed by `close()`.
 */
export async function openTestDatabase(): Promise<TestDatabase> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: wranglerConfig,
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  const d1 = proxy.env.DB;
  try {
    for (const migration of await migrationStatements())
      await d1.batch(migration.statements.map((sql) => d1.prepare(sql)));
  } catch (error) {
    await proxy.dispose();
    throw error;
  }
  return { d1, db: createDatabase(d1), close: () => proxy.dispose() };
}

/** Captures codes instead of sending them. */
export class TestDelivery extends OtpDelivery {
  messages: { contact: string; code: string }[] = [];
  failing = false;
  enabled = true;
  available() {
    return this.enabled;
  }
  async send(contact: string, code: string) {
    if (this.failing)
      throw new Error('Sensitive provider response must stay private');
    this.messages.push({ contact, code });
  }
}

export interface Harness {
  app: TestApp;
  db: Database;
  d1: D1Database;
  database: DatabaseAdapter;
  delivery: TestDelivery;
}

/** The full API on a fresh local D1 database with a capturing code transport. */
export async function apiHarness(
  options: Partial<AppOptions> = {},
): Promise<Harness> {
  const test = await openTestDatabase();
  const delivery = new TestDelivery();
  const database = new DatabaseAdapter(test.db);
  const hosted = buildApp({
    database,
    trustedOrigins: [origin],
    secureCookies: false,
    otpDelivery: delivery,
    otpHmacKey: fromHex(testOtpKey),
    ...options,
  });
  return {
    app: testClient(hosted, test.close),
    db: test.db,
    d1: test.d1,
    database,
    delivery: (options.otpDelivery as TestDelivery | undefined) ?? delivery,
  };
}

/**
 * Signs in through the real code flow: request a code, read it from the
 * capturing transport, verify it. Returns the session cookie and user.
 */
export async function signIn(
  harness: Pick<Harness, 'app' | 'delivery'>,
  contact = `${crypto.randomUUID()}@example.invalid`,
  displayName = 'Fictional Tester',
) {
  const requested = await harness.app.inject({
    method: 'POST',
    url: '/v1/auth/otp/request',
    headers: { origin },
    payload: { contact },
  });
  if (requested.statusCode !== 202)
    throw new Error(`Code request failed: ${requested.body}`);
  const { code } = harness.delivery.messages.at(-1)!;
  const verified = await harness.app.inject({
    method: 'POST',
    url: '/v1/auth/otp/verify',
    headers: { origin },
    payload: { challengeId: requested.json().challengeId, code, displayName },
  });
  if (verified.statusCode !== 200)
    throw new Error(`Code verify failed: ${verified.body}`);
  return {
    cookie: verified.headers['set-cookie']!.toString().split(';')[0],
    contact,
    user: verified.json().user as { id: string; email: string },
  };
}
