import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { otpChallenges, sessions, authThrottle } from '@ordo/db';
import { apiHarness, origin } from './d1-harness.js';

// Sign-in on D1: the request upsert, the three-step verify and the
// per-route, per-client throttle table.

async function harness() {
  let now = Date.now();
  const h = await apiHarness({ otpNow: () => now });
  const post = (url: string, payload: object, ip?: string) =>
    h.app.inject({
      method: 'POST',
      url,
      headers: { origin, ...(ip ? { 'cf-connecting-ip': ip } : {}) },
      payload,
    });
  return {
    ...h,
    post,
    request: (contact: string, ip?: string) =>
      post('/v1/auth/otp/request', { contact }, ip),
    verify: (challengeId: string, code: string, ip?: string) =>
      post('/v1/auth/otp/verify', { challengeId, code }, ip),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('concurrent wrong guesses never exceed five attempts, and the right code is then refused', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const requested = await h.request('guesses@example.invalid');
  const challengeId = requested.json().challengeId;
  const code = h.delivery.messages.at(-1)!.code;
  const wrong = code === '000000' ? '000001' : '000000';
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      h.verify(challengeId, wrong, `198.51.100.${index}`),
    ),
  );
  assert.ok(results.every((r) => r.statusCode === 401));
  const [row] = await h.db.select().from(otpChallenges);
  assert.equal(row.attempts, 5);
  assert.equal((await h.verify(challengeId, code)).statusCode, 401);
  assert.equal((await h.db.select().from(sessions)).length, 0);
});

test('a code works exactly once even when replayed concurrently many times', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const requested = await h.request('replay@example.invalid');
  const challengeId = requested.json().challengeId;
  const code = h.delivery.messages.at(-1)!.code;
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      h.verify(challengeId, code, `203.0.113.${index}`),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.statusCode).sort(),
    [200, 401, 401, 401, 401],
  );
  assert.equal(
    results.filter((r) => r.headers['set-cookie']).length,
    1,
    'one session cookie',
  );
  assert.equal((await h.db.select().from(sessions)).length, 1);
});

test('resend spacing, five sends a window, and a fresh window after 15 minutes', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const contact = 'spacing@example.invalid';
  assert.equal((await h.request(contact)).statusCode, 202);
  const tooSoon = await h.request(contact);
  assert.equal(tooSoon.statusCode, 429);
  assert.equal(tooSoon.json().error.code, 'OTP_RATE_LIMITED');
  for (let send = 2; send <= 5; send++) {
    h.advance(60_001);
    assert.equal((await h.request(contact)).statusCode, 202, `send ${send}`);
  }
  h.advance(60_001);
  assert.equal((await h.request(contact)).statusCode, 429, 'sixth send');
  const [row] = await h.db.select().from(otpChallenges);
  assert.equal(row.requests, 5);
  h.advance(15 * 60_000);
  assert.equal((await h.request(contact)).statusCode, 202);
  const [reset] = await h.db.select().from(otpChallenges);
  assert.equal(reset.requests, 1);
  assert.equal(reset.attempts, 0);
  // The newest code is the one that works; older ones are replaced.
  const latest = h.delivery.messages.at(-1)!.code;
  assert.equal((await h.verify(reset.challengeId, latest)).statusCode, 200);
});

test('the sign-in throttle is per route and per CF-Connecting-IP, stored hashed, and resets after a minute', async (t) => {
  const h = await harness();
  t.after(() => h.app.close());
  const guess = (ip: string) => h.verify(randomUUID(), '000000', ip);
  for (let i = 0; i < 12; i++)
    assert.equal((await guess('192.0.2.10')).statusCode, 401);
  const limited = await guess('192.0.2.10');
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, 'RATE_LIMITED');
  assert.equal(limited.headers['retry-after'], '60');
  // Another client, and another sign-in route for the same client, are not limited.
  assert.equal((await guess('192.0.2.11')).statusCode, 401);
  assert.equal(
    (await h.request('other-route@example.invalid', '192.0.2.10')).statusCode,
    202,
  );
  const rows = await h.db.select().from(authThrottle);
  assert.ok(rows.length >= 3);
  for (const row of rows) {
    assert.match(row.client, /^[a-f0-9]{64}$/);
    assert.ok(!row.client.includes('192.0.2'));
  }
  h.advance(60_001);
  assert.equal((await guess('192.0.2.10')).statusCode, 401, 'new window');
});
