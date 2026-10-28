import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { openDatabase, users, sessions, otpChallenges, tasks } from '@ordo/db';
import { DatabaseAdapter } from '../src/adapters/database/database.adapter.js';
import { IdentityRepository } from '../src/domains/identity/identity.repository.js';
import { buildApp } from '../src/app.js';
import { testClient } from './http-harness.js';
import { OtpDelivery } from '../src/capabilities/otp-delivery.contract.js';
import { GatekeeperOtpDelivery } from '../src/adapters/gatekeeper/gatekeeper-otp-delivery.js';
const origin = 'http://localhost:3318';
// Fictional 32-byte test key; real deployments read the OTP_HMAC_KEY secret.
const testOtpKey = '0f'.repeat(32);
class TestDelivery extends OtpDelivery {
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
async function harness(dataDir?: string) {
  const connection = await openDatabase({ dataDir });
  const delivery = new TestDelivery();
  let now = Date.now();
  const app = testClient(
    await buildApp({
      connection,
      otpDelivery: delivery,
      otpNow: () => now,
      otpHmacKey: testOtpKey,
    }),
  );
  await app.ready();
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers: { origin }, payload });
  const request = (contact: string) =>
    post('/v1/auth/otp/request', { contact });
  const verify = (challengeId: string, code: string) =>
    post('/v1/auth/otp/verify', { challengeId, code });
  return {
    app,
    db: connection.db,
    delivery,
    post,
    request,
    verify,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('OTP verifies an existing email without changing account identity; hashed code, replay protection and session', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const email = `${randomUUID()}@example.invalid`;
  const registered = await h.post('/v1/auth/register', {
    email,
    password: 'Fictional-Password-For-Test',
    displayName: 'Email tester',
  });
  assert.equal(registered.statusCode, 201);
  const [beforeAccount] = await h.db.select().from(users);
  const taskId = randomUUID();
  await h.db.insert(tasks).values({
    id: taskId,
    ownerUserId: registered.json().user.id,
    title: 'Existing preserved task',
  });
  const request = await h.request(`  ${email.toUpperCase()} `);
  assert.equal(request.statusCode, 202, request.body);
  assert.deepEqual(Object.keys(request.json()).sort(), [
    'challengeId',
    'expiresInSeconds',
    'retryAfterSeconds',
  ]);
  const { code, contact } = h.delivery.messages.at(-1)!;
  assert.equal(contact, email);
  assert.match(code, /^\d{6}$/);
  const [stored] = await h.db.select().from(otpChallenges);
  assert.match(stored.codeHash, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.ok(!stored.codeHash.includes(`:${code}`));
  assert.equal((await h.db.select().from(users))[0].emailVerifiedAt, null);
  const verified = await h.verify(request.json().challengeId, code);
  assert.equal(verified.statusCode, 200, verified.body);
  assert.equal(verified.json().user.id, registered.json().user.id);
  assert.ok(verified.headers['set-cookie']);
  assert.ok((await h.db.select().from(users))[0].emailVerifiedAt);
  assert.equal((await h.db.select().from(tasks))[0].id, taskId);
  const oldCookie = registered.headers['set-cookie']!.toString().split(';')[0];
  assert.equal(
    (await h.app.inject({ url: '/v1/home', headers: { cookie: oldCookie } }))
      .statusCode,
    401,
  );
  const oldPassword = await h.post('/v1/auth/login', {
    email,
    password: 'Fictional-Password-For-Test',
  });
  assert.equal(oldPassword.statusCode, 401);
  // A password check that completed before conversion cannot mint a new session afterwards.
  const identityRepository = new IdentityRepository(new DatabaseAdapter(h.db));
  assert.equal(
    await identityRepository.insertSession(
      'f'.repeat(64),
      beforeAccount.id,
      new Date(Date.now() + 60000).toISOString(),
      beforeAccount.passwordHash,
    ),
    false,
  );
  const replay = await h.verify(request.json().challengeId, code);
  assert.equal(replay.statusCode, 401);
  assert.equal(replay.headers['set-cookie'], undefined);
  assert.equal((await h.db.select().from(sessions)).length, 1);
});

test('OTP handles new email and Ghana phone with identical challenge shape; rejects unsupported countries', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  for (const contact of ['new@example.invalid', '024 123 4567']) {
    const request = await h.request(contact);
    assert.equal(request.statusCode, 202, request.body);
    assert.deepEqual(Object.keys(request.json()).sort(), [
      'challengeId',
      'expiresInSeconds',
      'retryAfterSeconds',
    ]);
    const message = h.delivery.messages.at(-1)!;
    const result = await h.verify(request.json().challengeId, message.code);
    assert.equal(result.statusCode, 200, result.body);
  }
  // The passwordless marker cannot become a password or accidentally authenticate
  // through the legacy dummy-hash path.
  const legacy = await h.post('/v1/auth/login', {
    email: 'new@example.invalid',
    password: 'not-an-account-password',
  });
  assert.equal(legacy.statusCode, 401);
  assert.equal(legacy.headers['set-cookie'], undefined);
  const accounts = await h.db.select().from(users);
  const phone = accounts.find((user) => user.phone);
  assert.equal(phone?.phone, '+233241234567');
  assert.ok(phone?.phoneVerifiedAt);
  assert.equal(phone?.emailVerifiedAt, null);
  assert.equal((await h.request('+12025550123')).statusCode, 400);
  assert.equal(h.delivery.messages.length, 2);
});

test('expiry, wrong-attempt limits, resend cooldown and cumulative attempts do not issue sessions', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const first = await h.request('expired@example.invalid');
  const firstCode = h.delivery.messages.at(-1)!.code;
  assert.equal((await h.request('expired@example.invalid')).statusCode, 429);
  h.advance(300001);
  assert.equal(
    (await h.verify(first.json().challengeId, firstCode)).statusCode,
    401,
  );
  let req = await h.request('guess@example.invalid');
  const wrong = () =>
    h.delivery.messages.at(-1)!.code === '000000' ? '000001' : '000000';
  for (let i = 0; i < 3; i++)
    assert.equal(
      (await h.verify(req.json().challengeId, wrong())).statusCode,
      401,
    );
  h.advance(60001);
  req = await h.request('guess@example.invalid');
  assert.equal(req.statusCode, 202);
  const code = h.delivery.messages.at(-1)!.code;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await h.verify(req.json().challengeId, wrong())).statusCode,
      401,
    );
  assert.equal((await h.verify(req.json().challengeId, code)).statusCode, 401);
  h.advance(60001);
  assert.equal((await h.request('guess@example.invalid')).statusCode, 429);
  assert.equal((await h.db.select().from(sessions)).length, 0);
  assert.equal((await h.db.select().from(users)).length, 0);
});

test('OTP consumed state persists across API/database restart and concurrent verify creates one session', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ordo-otp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await harness(directory);
  const req = await first.request('restart@example.invalid');
  const code = first.delivery.messages.at(-1)!.code;
  await first.app.close();
  const second = await harness(directory);
  t.after(() => second.app.close());
  const results = await Promise.all([
    second.verify(req.json().challengeId, code),
    second.verify(req.json().challengeId, code),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 401]);
  assert.equal((await second.db.select().from(sessions)).length, 1);
});

test('delivery failure and unavailable provider return safe messages; CSRF and IP limits cover OTP', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  h.delivery.failing = true;
  const failed = await h.request('failed@example.invalid');
  assert.equal(failed.statusCode, 502);
  assert.ok(!failed.body.includes('Sensitive'));
  const [row] = await h.db.select().from(otpChallenges);
  assert.equal(row.ready, false);
  h.delivery.enabled = false;
  assert.equal((await h.request('disabled@example.invalid')).statusCode, 503);
  const untrusted = await h.app.inject({
    method: 'POST',
    url: '/v1/auth/otp/request',
    headers: { origin: 'https://bad.invalid' },
    payload: { contact: 'csrf@example.invalid' },
  });
  assert.equal(untrusted.statusCode, 403);
  for (let i = 0; i < 12; i++)
    await h.post('/v1/auth/otp/verify', {
      challengeId: randomUUID(),
      code: '000000',
    });
  assert.equal(
    (
      await h.post('/v1/auth/otp/verify', {
        challengeId: randomUUID(),
        code: '000000',
      })
    ).statusCode,
    429,
  );
});

test('Gatekeeper transport uses separate email and Ghana SMS payloads and hides provider response details', async () => {
  const calls: { url: string; body: any; headers: any }[] = [];
  const transport: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init!.body)),
      headers: init!.headers,
    });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  const delivery = new GatekeeperOtpDelivery(
    { apiKey: 'fictional-test-key', apiUrl: 'https://provider.invalid/api' },
    transport,
  );
  await delivery.send('person@example.invalid', '123456');
  await delivery.send('+233241234567', '654321');
  assert.equal(calls[0].url, 'https://provider.invalid/api/send_email');
  assert.equal(calls[0].body.email, 'person@example.invalid');
  assert.equal(calls[0].body.isHtml, true);
  assert.match(calls[0].body.subject, /Ordo sign-in code/);
  assert.match(calls[0].body.message, /A calmer way in/);
  assert.match(calls[0].body.message, /123456/);
  assert.match(calls[0].body.message, /ff6a00/);
  assert.ok(!/https?:|<script|<img/i.test(calls[0].body.message));
  const plain = new GatekeeperOtpDelivery(
    {
      apiKey: 'fictional',
      apiUrl: 'https://provider.invalid',
      emailHtml: false,
    },
    transport,
  );
  await plain.send('person@example.invalid', '123456');
  assert.equal(calls[2].body.isHtml, false);
  assert.match(calls[2].body.message, /From thought to done/);
  assert.ok(!calls[2].body.message.includes('<table'));
  await assert.rejects(() => plain.send('person@example.invalid', '<bad>'));
  assert.equal(calls[1].url, 'https://provider.invalid/api/send_sms');
  assert.equal(calls[1].body.phoneNumber, '0241234567');
  assert.equal(calls[0].headers['x-api-key'], 'fictional-test-key');
  const refuses = new GatekeeperOtpDelivery(
    { apiKey: 'fictional', apiUrl: 'https://provider.invalid' },
    async () =>
      new Response(JSON.stringify({ success: false, message: 'secret echo' }), {
        status: 200,
      }),
  );
  await assert.rejects(
    () => refuses.send('person@example.invalid', '123456'),
    (error) => (error as Error).message === 'Delivery failed',
  );
});

test('authenticated reads reject stale expected account after a cookie account switch', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const registration = await h.post('/v1/auth/register', {
    email: 'read-scope@example.invalid',
    password: 'Fictional-Read-Scope-Password',
    displayName: 'Read scope',
  });
  const cookie = registration.headers['set-cookie']!.toString().split(';')[0];
  for (const url of ['/v1/search?q=scope', '/v1/notes']) {
    const mismatch = await h.app.inject({
      url,
      headers: { cookie, 'x-ordo-account': randomUUID() },
    });
    assert.equal(mismatch.statusCode, 409, mismatch.body);
    assert.equal(mismatch.json().error.code, 'SESSION_CHANGED');
    const correct = await h.app.inject({
      url,
      headers: { cookie, 'x-ordo-account': registration.json().user.id },
    });
    assert.equal(correct.statusCode, 200, correct.body);
  }
});
