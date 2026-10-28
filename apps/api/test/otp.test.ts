import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { users, sessions, otpChallenges, tasks } from '@ordo/db';
import { buildApp } from '../src/app.js';
import { DatabaseAdapter } from '../src/adapters/database/database.adapter.js';
import { fromHex } from '../src/adapters/cryptography/encoding.js';
import { testClient } from './http-harness.js';
import { GatekeeperOtpDelivery } from '../src/adapters/gatekeeper/gatekeeper-otp-delivery.js';
import {
  ConsoleOtpDelivery,
  maskContact,
} from '../src/adapters/console/console-otp-delivery.js';
import {
  apiHarness,
  origin,
  signIn,
  testOtpKey,
  type Harness,
} from './d1-harness.js';
async function harness() {
  let now = Date.now();
  const h = await apiHarness({ otpNow: () => now });
  return withHelpers(h, {
    advance: (ms: number) => {
      now += ms;
    },
  });
}
function withHelpers<T extends object>(h: Harness, extra: T) {
  const post = (url: string, payload: object) =>
    h.app.inject({ method: 'POST', url, headers: { origin }, payload });
  const request = (contact: string) =>
    post('/v1/auth/otp/request', { contact });
  const verify = (challengeId: string, code: string) =>
    post('/v1/auth/otp/verify', { challengeId, code });
  return { ...h, post, request, verify, ...extra };
}
test('OTP converts a legacy account: same ID and data, old sessions revoked, hashed code, replay refused', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const email = `${randomUUID()}@example.invalid`;
  // A legacy local account as the import loads it: no verified email, and a
  // session left from before (the import never copies sessions, but a
  // squatter's or an old session must not survive the first email proof).
  const legacyId = randomUUID();
  await h.db
    .insert(users)
    .values({ id: legacyId, email, displayName: 'Email tester' });
  await h.db.insert(sessions).values({
    tokenHash: 'e'.repeat(64),
    userId: legacyId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const taskId = randomUUID();
  await h.db.insert(tasks).values({
    id: taskId,
    ownerUserId: legacyId,
    title: 'Existing preserved task',
  });
  assert.equal(
    (
      await h.app.inject({
        url: '/v1/home',
        headers: { cookie: `ordo_session=${'e'.repeat(64)}` },
      })
    ).statusCode,
    401,
    'a stored digest is not itself a token',
  );
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
  assert.equal(verified.json().user.id, legacyId);
  assert.ok(verified.headers['set-cookie']);
  assert.ok((await h.db.select().from(users))[0].emailVerifiedAt);
  assert.equal((await h.db.select().from(tasks))[0].id, taskId);
  const remaining = await h.db.select().from(sessions);
  assert.equal(remaining.length, 1);
  assert.notEqual(remaining[0].tokenHash, 'e'.repeat(64));
  const [consumed] = await h.db.select().from(otpChallenges);
  assert.equal(consumed.consumed, true);
  assert.equal(consumed.codeHash, '');
  assert.match(consumed.consumedBy!, /^[0-9a-f-]{36}$/);
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

test('OTP consumed state is in D1, so a fresh app (new isolate) refuses replays; concurrent verify creates one session', async (t) => {
  const first = await harness();
  t.after(() => first.app.close());
  const req = await first.request('restart@example.invalid');
  const code = first.delivery.messages.at(-1)!.code;
  const second = withHelpers(
    {
      ...first,
      app: testClient(
        buildApp({
          database: new DatabaseAdapter(first.db),
          trustedOrigins: [origin],
          secureCookies: false,
          otpDelivery: first.delivery,
          otpHmacKey: fromHex(testOtpKey),
        }),
      ),
    },
    {},
  );
  const results = await Promise.all([
    second.verify(req.json().challengeId, code),
    second.verify(req.json().challengeId, code),
    first.verify(req.json().challengeId, code),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 401, 401]);
  assert.equal((await second.db.select().from(sessions)).length, 1);
  assert.equal((await second.db.select().from(users)).length, 1);
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

test('the console code transport works only in development and masks the contact', async () => {
  assert.throws(() => new ConsoleOtpDelivery(false), /ORDO_ENV=development/);
  const lines: string[] = [];
  const delivery = new ConsoleOtpDelivery(true, (line) => lines.push(line));
  assert.equal(delivery.available(), true);
  await delivery.send('person@example.invalid', '123456');
  await delivery.send('+233241234567', '654321');
  assert.match(lines[0], /p•••@example\.invalid: 123456/);
  assert.ok(!lines[0].includes('person@'));
  assert.match(lines[1], /\+233•••••67: 654321/);
  assert.equal(maskContact('+233241234567'), '+233•••••67');
});

test('authenticated reads reject stale expected account after a cookie account switch', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const { cookie, user } = await signIn(h, 'read-scope@example.invalid');
  for (const url of ['/v1/search?q=scope', '/v1/notes']) {
    const mismatch = await h.app.inject({
      url,
      headers: { cookie, 'x-ordo-account': randomUUID() },
    });
    assert.equal(mismatch.statusCode, 409, mismatch.body);
    assert.equal(mismatch.json().error.code, 'SESSION_CHANGED');
    const correct = await h.app.inject({
      url,
      headers: { cookie, 'x-ordo-account': user.id },
    });
    assert.equal(correct.statusCode, 200, correct.body);
  }
});
