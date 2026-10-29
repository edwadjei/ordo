import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDisplayName, looksLikeContact } from '@ordo/core';
import { users } from '@ordo/db';
import { eq } from 'drizzle-orm';
import { apiHarness, origin, type Harness } from './d1-harness.js';

// Accounts store only a real name, or none: no invented default, and never a
// phone number or email address typed into the name field.

async function signInWith(h: Harness, contact: string, displayName?: string) {
  const requested = await h.app.inject({
    method: 'POST',
    url: '/v1/auth/otp/request',
    headers: { origin },
    payload: { contact },
  });
  assert.equal(requested.statusCode, 202, requested.body);
  const verified = await h.app.inject({
    method: 'POST',
    url: '/v1/auth/otp/verify',
    headers: { origin },
    payload: {
      challengeId: requested.json().challengeId,
      code: h.delivery.messages.at(-1)!.code,
      ...(displayName === undefined ? {} : { displayName }),
    },
  });
  assert.equal(verified.statusCode, 200, verified.body);
  return {
    cookie: verified.headers['set-cookie']!.toString().split(';')[0],
    user: verified.json().user as { id: string; displayName: string },
  };
}

test('contact-like names are recognised; real names are kept', () => {
  for (const contact of [
    '0558601966',
    '055 860 1966',
    '+233 55 860 1966',
    '(024) 123-4567',
    '024.123.4567',
    'ama@example.test',
    ' Ama.Fiction@example.test ',
  ]) {
    assert.equal(looksLikeContact(contact), true, contact);
    assert.equal(cleanDisplayName(contact), null, contact);
  }
  for (const name of [
    'Ama Fiction',
    'Kofi 2',
    'Agent 007',
    'R2-D2',
    'Ama @ home',
  ])
    assert.equal(looksLikeContact(name), false, name);
  assert.equal(cleanDisplayName('  Ama Fiction  '), 'Ama Fiction');
  assert.equal(cleanDisplayName('   '), null);
  assert.equal(cleanDisplayName(undefined), null);
  assert.equal(cleanDisplayName('x'.repeat(90))?.length, 80);
});

test('new accounts without a real name store none and read back an empty name', async (t) => {
  const h = await apiHarness();
  t.after(() => h.app.close());
  const cases: [string, string | undefined][] = [
    ['024 123 4567', undefined],
    ['nameless@example.test', undefined],
    ['024 765 4321', '0247654321'],
    ['typed-phone@example.test', '+233 55 860 1966'],
    ['typed-email@example.test', 'typed-email@example.test'],
  ];
  for (const [contact, displayName] of cases) {
    const { cookie, user } = await signInWith(h, contact, displayName);
    assert.equal(user.displayName, '', contact);
    const [row] = await h.db.select().from(users).where(eq(users.id, user.id));
    assert.equal(row.displayName, null, contact);
    for (const url of ['/v1/auth/me', '/v1/home']) {
      const read = await h.app.inject({ url, headers: { cookie } });
      assert.equal(read.statusCode, 200, read.body);
      assert.equal(read.json().user.displayName, '', `${contact} ${url}`);
    }
  }
});

test('a real name is stored trimmed, and a later sign-in does not change it', async (t) => {
  let now = Date.now();
  const h = await apiHarness({ otpNow: () => now });
  t.after(() => h.app.close());
  const first = await signInWith(h, 'ama@example.test', '  Ama Fiction ');
  assert.equal(first.user.displayName, 'Ama Fiction');
  now += 61_000;
  const again = await signInWith(h, 'ama@example.test', 'Someone Else');
  assert.equal(again.user.id, first.user.id);
  assert.equal(again.user.displayName, 'Ama Fiction');
  const me = await h.app.inject({
    url: '/v1/auth/me',
    headers: { cookie: again.cookie },
  });
  assert.equal(me.json().user.displayName, 'Ama Fiction');
});
