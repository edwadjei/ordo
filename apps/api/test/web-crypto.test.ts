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
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebContentHasher } from '../src/adapters/cryptography/web-content-hasher.js';
import { WebSessionTokens } from '../src/adapters/cryptography/web-session-tokens.js';
import { WebOtpSecrets } from '../src/adapters/cryptography/web-otp-secrets.js';
import { FileSecretCipher } from '../src/adapters/secrets/file-secret-cipher.js';
import { localKeySource } from '../src/adapters/secrets/local-key-file.js';
import { newId } from '../src/platform/identifiers/new-id.js';
import { readApiConfig } from '../src/platform/config/api-config.js';

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
  const cipher = new FileSecretCipher('/nonexistent/never-read', fixtureKey);
  assert.equal(
    await cipher.decrypt(fixtureOwner, fixtureCiphertext),
    fixturePlaintext,
  );
  await assert.rejects(() =>
    cipher.decrypt('22222222-2222-4222-8222-222222222222', fixtureCiphertext),
  );
});

test('secret cipher output decrypts with Node AES-256-GCM and vice versa', async () => {
  const cipher = new FileSecretCipher('/nonexistent/never-read', fixtureKey);
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

test('local key file is generated lazily, owner-only, and reused', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ordo-otp-key-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = join(directory, 'secrets', 'otp-key');
  const source = localKeySource(filename, undefined, 'invalid');
  const first = await source();
  assert.equal(first.length, 32);
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.deepEqual(new Uint8Array(await readFile(filename)), first);
  assert.deepEqual(
    await localKeySource(filename, undefined, 'invalid')(),
    first,
  );
  await assert.rejects(() => localKeySource(filename, 'short', 'invalid')(), {
    message: 'invalid',
  });
});

test('production refuses to start without a valid OTP_HMAC_KEY', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://fictional.invalid/ordo',
    TRUSTED_ORIGINS: 'https://ordo.example.invalid',
  };
  assert.throws(() => readApiConfig(base, '/tmp'), /OTP_HMAC_KEY/);
  assert.throws(
    () => readApiConfig({ ...base, OTP_HMAC_KEY: 'not-hex' }, '/tmp'),
    /OTP_HMAC_KEY/,
  );
  assert.equal(
    readApiConfig({ ...base, OTP_HMAC_KEY: 'ab'.repeat(32) }, '/tmp')
      .otpHmacKey,
    'ab'.repeat(32),
  );
  assert.equal(readApiConfig({}, '/tmp').otpHmacKey, undefined);
});
