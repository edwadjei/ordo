import assert from 'node:assert/strict';
import { test } from 'node:test';
// Node crypto is used here only as the reference for byte compatibility with
// the former Node adapters; production code uses Web Crypto.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { WebContentHasher } from '../src/adapters/cryptography/web-content-hasher.js';
import { WebSessionTokens } from '../src/adapters/cryptography/web-session-tokens.js';
import { WebOtpSecrets } from '../src/adapters/cryptography/web-otp-secrets.js';
import { WebSecretCipher } from '../src/adapters/secrets/web-secret-cipher.js';
import { fromHex } from '../src/adapters/cryptography/encoding.js';
import { newId } from '../src/platform/identifiers/new-id.js';
import {
  localOrigins,
  readWorkerConfig,
} from '../src/platform/config/worker-config.js';

// Fictional fixture key and owner. The ciphertext below was produced by the
// previous Node `createCipheriv('aes-256-gcm')` implementation before the
// Web Crypto port, so this proves saved provider keys still decrypt.
const fixtureKey =
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const fixtureOwner = '11111111-1111-4111-8111-111111111111';
const fixturePlaintext = 'sk-test-fictional-ključ-🔑';
const fixtureCiphertext =
  'v1.MwhadEo4LjamicnC.mnMl/zx9BHPM98u15nGbcg==.arrRaiYA0TgGi2+RSnEfsDU3emHIS4VLUA+/uQs=';

test('secret cipher decrypts ciphertext produced by the former Node implementation', async () => {
  const cipher = new WebSecretCipher(async () => fromHex(fixtureKey));
  assert.equal(
    await cipher.decrypt(fixtureOwner, fixtureCiphertext),
    fixturePlaintext,
  );
  await assert.rejects(() =>
    cipher.decrypt('22222222-2222-4222-8222-222222222222', fixtureCiphertext),
  );
});

test('secret cipher output decrypts with Node AES-256-GCM and vice versa', async () => {
  const cipher = new WebSecretCipher(async () => fromHex(fixtureKey));
  const sealed = await cipher.encrypt(fixtureOwner, fixturePlaintext);
  const [version, nonce, tag, data] = sealed.split('.');
  assert.equal(version, 'v1');
  assert.equal(Buffer.from(nonce, 'base64').length, 12);
  assert.equal(Buffer.from(tag, 'base64').length, 16);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(fixtureKey, 'hex'),
    Buffer.from(nonce, 'base64'),
  );
  decipher.setAAD(Buffer.from(`ordo.audio:${fixtureOwner}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  assert.equal(
    Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8'),
    fixturePlaintext,
  );
  const iv = randomBytes(12);
  const node = createCipheriv(
    'aes-256-gcm',
    Buffer.from(fixtureKey, 'hex'),
    iv,
  );
  node.setAAD(Buffer.from(`ordo.audio:${fixtureOwner}`));
  const body = Buffer.concat([
    node.update('another value', 'utf8'),
    node.final(),
  ]);
  const nodeSealed = [
    'v1',
    iv.toString('base64'),
    node.getAuthTag().toString('base64'),
    body.toString('base64'),
  ].join('.');
  assert.equal(await cipher.decrypt(fixtureOwner, nodeSealed), 'another value');
  await assert.rejects(() => cipher.decrypt(fixtureOwner, 'v1.!!.!!.!!'));
});

test('content and session digests match the former Node SHA-256 hex output', async () => {
  const payload = JSON.stringify({
    title: 'Buy milk – ünïcode ✓',
    priority: 'normal',
  });
  // Recorded from the previous NodeContentHasher / NodeSessionTokens.
  assert.equal(
    await new WebContentHasher().digest(payload),
    'a1bab9b273a16358de96c17f419f168954f30a1115848a104fb0f0f9819d688f',
  );
  assert.equal(
    await new WebSessionTokens().digest('ab'.repeat(32)),
    '271a413bd339c5709fdceaec41f14f11e9fbfb5042d72d331c65f32b284cd09a',
  );
  for (const value of ['', 'plain', '🔑 emoji', 'x'.repeat(10000)])
    assert.equal(
      await new WebContentHasher().digest(value),
      createHash('sha256').update(value).digest('hex'),
    );
  const tokens = new WebSessionTokens();
  const token = tokens.create();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, tokens.create());
  assert.match(newId(), /^[0-9a-f-]{36}$/);
});

test('OTP secrets: uniform six-digit codes and HMAC-SHA256 bound to the challenge', async () => {
  const key = '0f'.repeat(32);
  const secrets = new WebOtpSecrets(async () => Buffer.from(key, 'hex'));
  const codes = new Set<string>();
  for (let index = 0; index < 2000; index++) {
    const code = secrets.code();
    assert.match(code, /^\d{6}$/);
    codes.add(code);
  }
  assert.ok(codes.size > 1900, 'codes should not repeat often');
  const challenge = newId();
  const stored = await secrets.hash(challenge, '123456');
  const expected = createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`${challenge}:123456`)
    .digest('hex');
  assert.equal(stored, `hmac-sha256:${expected}`);
  assert.equal(await secrets.verify(challenge, '123456', stored), true);
  assert.equal(await secrets.verify(challenge, '123457', stored), false);
  assert.equal(await secrets.verify(newId(), '123456', stored), false);
  // A legacy scrypt hash from before the port simply fails verification.
  assert.equal(
    await secrets.verify(challenge, '123456', 'scrypt:aa:bb'),
    false,
  );
  const other = new WebOtpSecrets(async () =>
    Buffer.from('1e'.repeat(32), 'hex'),
  );
  assert.equal(await other.verify(challenge, '123456', stored), false);
});

test('the Worker refuses to run hosted without OTP_HMAC_KEY and TRUSTED_ORIGINS', () => {
  const hosted = { TRUSTED_ORIGINS: 'https://ordo.example.invalid' };
  assert.throws(() => readWorkerConfig(hosted), /OTP_HMAC_KEY/);
  assert.throws(
    () => readWorkerConfig({ ...hosted, OTP_HMAC_KEY: 'not-hex' }),
    /OTP_HMAC_KEY/,
  );
  assert.throws(
    () => readWorkerConfig({ OTP_HMAC_KEY: 'ab'.repeat(32) }),
    /TRUSTED_ORIGINS/,
  );
  assert.throws(
    () =>
      readWorkerConfig({
        ...hosted,
        OTP_HMAC_KEY: 'ab'.repeat(32),
        ORDO_CREDENTIAL_KEY: 'short',
      }),
    /ORDO_CREDENTIAL_KEY/,
  );
  const ready = readWorkerConfig({ ...hosted, OTP_HMAC_KEY: 'ab'.repeat(32) });
  assert.equal(ready.development, false);
  assert.equal(ready.secureCookies, true);
  assert.equal(ready.otpHmacKey, 'ab'.repeat(32));
  assert.deepEqual(ready.trustedOrigins, ['https://ordo.example.invalid']);
  // Anything but an explicit ORDO_ENV=development counts as hosted.
  assert.throws(
    () => readWorkerConfig({ ORDO_ENV: 'staging' }),
    /OTP_HMAC_KEY/,
  );
  const local = readWorkerConfig({ ORDO_ENV: 'development' });
  assert.equal(local.development, true);
  assert.equal(local.secureCookies, false);
  assert.equal(local.otpHmacKey, undefined);
  assert.deepEqual(local.trustedOrigins, localOrigins);
  // Workers AI: on when hosted, off in development unless asked for.
  assert.equal(ready.workersAi, true);
  assert.equal(local.workersAi, false);
  assert.equal(
    readWorkerConfig({ ORDO_ENV: 'development', ORDO_WORKERS_AI: 'on' })
      .workersAi,
    true,
  );
  assert.equal(
    readWorkerConfig({
      ...hosted,
      OTP_HMAC_KEY: 'ab'.repeat(32),
      ORDO_WORKERS_AI: 'off',
    }).workersAi,
    false,
  );
  assert.throws(
    () => readWorkerConfig({ ORDO_ENV: 'development', ORDO_WORKERS_AI: 'yes' }),
    /ORDO_WORKERS_AI/,
  );
});
