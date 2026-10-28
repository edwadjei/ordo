import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { users, audioSettings } from '@ordo/db';
import {
  DatabaseAdapter,
  eq,
} from '../src/adapters/database/database.adapter.js';
import { WebSecretCipher } from '../src/adapters/secrets/web-secret-cipher.js';
import { fromHex } from '../src/adapters/cryptography/encoding.js';
import { ConfiguredAudioProviders } from '../src/adapters/transcription/configured-audio-providers.js';
import { openTestDatabase } from './d1-harness.js';
import { AudioProviders } from '../src/capabilities/audio-providers.contract.js';
import { Transcriber } from '../src/capabilities/transcriber.contract.js';
import { SessionAuthenticator } from '../src/capabilities/session-authenticator.contract.js';
import { createAudioSettingsModule } from '../src/domains/audio-settings/audio-settings.module.js';
import { createTranscriptionsModule } from '../src/domains/transcriptions/transcriptions.module.js';
import { guardedApp } from './http-harness.js';
const owner = randomUUID(),
  other = randomUUID(),
  origin = 'http://localhost:3318',
  lan = 'http://192.168.100.213:3318';
const fakeKey = 'sk-fictional-test-key-never-real';
// Fictional 32-byte master key standing in for the ORDO_CREDENTIAL_KEY secret.
const credentialKey = fromHex('1e'.repeat(32));
class TestSessions extends SessionAuthenticator {
  async resolveSession(token: string) {
    return ['a'.repeat(64), 'b'.repeat(64)].includes(token)
      ? {
          id: token === 'a'.repeat(64) ? owner : other,
          email: 'test@example.invalid',
          displayName: 'Test',
          timezone: 'Africa/Accra',
        }
      : null;
  }
}
class FixedTranscriber extends Transcriber {
  constructor(private readonly output: string) {
    super();
  }
  async transcribe() {
    return this.output;
  }
}
class TestProviders extends AudioProviders {
  ready = true;
  tested: string[] = [];
  cloudKeys: string[] = [];
  async localAvailable() {
    return this.ready;
  }
  local() {
    return new FixedTranscriber('Local fictional transcript');
  }
  cloud(key: string) {
    this.cloudKeys.push(key);
    return new FixedTranscriber('Cloud fictional transcript');
  }
  async testCloud(key: string) {
    this.tested.push(key);
    return true;
  }
}
function headers(account = 'owner') {
  return {
    origin,
    cookie: `ordo_session=${(account === 'owner' ? 'a' : 'b').repeat(64)}`,
  };
}
async function harness() {
  const connection = await openTestDatabase(),
    providers = new TestProviders();
  await connection.db.insert(users).values([
    {
      id: owner,
      email: `${owner}@example.invalid`,
      displayName: 'Owner',
    },
    {
      id: other,
      email: `${other}@example.invalid`,
      displayName: 'Other',
    },
  ]);
  const settings = createAudioSettingsModule(
    new DatabaseAdapter(connection.db),
    { providers, credentialKey },
  );
  const app = await guardedApp(
    {
      authenticator: new TestSessions(),
      trustedOrigins: [origin, lan, 'https://ordo.test'],
    },
    settings,
    createTranscriptionsModule({}, settings.service),
  );
  return {
    connection,
    providers,
    app,
    service: settings.service,
    close: async () => {
      await app.close();
      await connection.close();
    },
  };
}
const audio = Buffer.alloc(44);
audio.write('RIFF', 0);
audio.write('WAVE', 8);
async function requestAudio(
  app: Awaited<ReturnType<typeof harness>>['app'],
  account = 'owner',
) {
  const settings = await app.inject({
    url: '/v1/settings/audio',
    headers: headers(account),
  });
  return app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      ...headers(account),
      'content-type': 'audio/wav',
      'x-ordo-audio-provider': settings.json().provider,
    },
    payload: Buffer.from(audio),
  });
}
test('per-account audio defaults local, encrypts cloud key and never returns or shares it', async (t) => {
  const h = await harness();
  t.after(h.close);
  const initial = await h.app.inject({
    url: '/v1/settings/audio',
    headers: headers(),
  });
  assert.equal(initial.statusCode, 200);
  assert.deepEqual(initial.json(), {
    provider: 'local_whisper',
    localAvailable: true,
    hasApiKey: false,
    configured: true,
  });
  assert.equal(
    (await requestAudio(h.app)).json().transcript,
    'Local fictional transcript',
  );
  const update = await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'openai', apiKey: fakeKey },
  });
  assert.equal(update.statusCode, 200, update.body);
  assert.equal(update.json().hasApiKey, true);
  assert.ok(!update.body.includes(fakeKey));
  const [row] = await h.connection.db
    .select()
    .from(audioSettings)
    .where(eq(audioSettings.ownerUserId, owner));
  assert.ok(row.encryptedApiKey);
  assert.ok(!row.encryptedApiKey.includes(fakeKey));
  assert.ok(!JSON.stringify(row).includes(fakeKey));
  assert.equal(
    (await requestAudio(h.app)).json().transcript,
    'Cloud fictional transcript',
  );
  assert.deepEqual(h.providers.cloudKeys, [fakeKey]);
  assert.equal(
    (await requestAudio(h.app, 'other')).json().transcript,
    'Local fictional transcript',
  );
  const foreign = await h.app.inject({
    url: '/v1/settings/audio',
    headers: headers('other'),
  });
  assert.equal(foreign.json().provider, 'local_whisper');
  assert.equal(foreign.json().hasApiKey, false);
  const test = await h.app.inject({
    method: 'POST',
    url: '/v1/settings/audio/test',
    headers: headers(),
  });
  assert.deepEqual(test.json(), {
    ok: true,
    message: 'The API key was accepted.',
  });
  assert.deepEqual(h.providers.tested, [fakeKey]);
  assert.ok(!test.body.includes(fakeKey));
});
test('audio readiness, removal and ownership guards do not inherit shared environment credentials', async (t) => {
  const h = await harness();
  t.after(h.close);
  h.providers.ready = false;
  assert.equal(
    (
      await h.app.inject({ url: '/v1/settings/audio', headers: headers() })
    ).json().configured,
    false,
  );
  assert.equal((await requestAudio(h.app)).statusCode, 503);
  const select = await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'openai' },
  });
  assert.equal(select.json().configured, false);
  assert.equal((await requestAudio(h.app)).statusCode, 503);
  assert.equal(
    (
      await h.app.inject({
        method: 'POST',
        url: '/v1/settings/audio/test',
        headers: headers(),
      })
    ).json().ok,
    false,
  );
  await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'openai', apiKey: fakeKey },
  });
  const removed = await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'openai', removeApiKey: true },
  });
  assert.equal(removed.json().hasApiKey, false);
  assert.equal((await requestAudio(h.app)).statusCode, 503);
  assert.equal((await h.app.inject('/v1/settings/audio')).statusCode, 401);
  assert.equal(
    (
      await h.app.inject({
        method: 'PATCH',
        url: '/v1/settings/audio',
        headers: { ...headers(), 'x-ordo-account': other },
        payload: { provider: 'openai', apiKey: fakeKey },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await h.app.inject({
        method: 'PATCH',
        url: '/v1/settings/audio',
        headers: { ...headers(), origin: 'http://attacker.invalid' },
        payload: { provider: 'local_whisper' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await h.app.inject({
        method: 'PATCH',
        url: '/v1/settings/audio',
        headers: headers(),
        payload: { provider: 'openai', apiKey: fakeKey, removeApiKey: true },
      })
    ).statusCode,
    400,
  );
});
test('new provider keys require HTTPS or exact loopback; changing provider/removing key is still permitted on LAN', async (t) => {
  const h = await harness();
  t.after(h.close);
  const denied = await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: { ...headers(), origin: lan },
    payload: { provider: 'openai', apiKey: fakeKey },
  });
  assert.equal(denied.statusCode, 400);
  assert.equal(denied.json().error.code, 'SECURE_CONNECTION_REQUIRED');
  assert.equal(
    (
      await h.app.inject({
        method: 'PATCH',
        url: '/v1/settings/audio',
        headers: { ...headers(), origin: 'https://ordo.test' },
        payload: { provider: 'openai', apiKey: fakeKey },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await h.app.inject({
        method: 'PATCH',
        url: '/v1/settings/audio',
        headers: { ...headers(), origin: lan },
        payload: { provider: 'local_whisper', removeApiKey: true },
      })
    ).statusCode,
    200,
  );
});
test('encrypted keys are authenticated to the owner, use random nonces and survive a new isolate with the same secret', async (t) => {
  const cipher = new WebSecretCipher(async () => credentialKey);
  const first = await cipher.encrypt(owner, fakeKey),
    second = await cipher.encrypt(owner, fakeKey);
  assert.notEqual(first, second);
  assert.equal(
    await new WebSecretCipher(async () => credentialKey).decrypt(owner, first),
    fakeKey,
  );
  await assert.rejects(() => cipher.decrypt(other, first));
  await assert.rejects(() =>
    cipher.decrypt(owner, first.slice(0, -4) + 'AAAA'),
  );
  const unconfigured = new WebSecretCipher(async () => {
    throw new Error('Credential encryption is not configured');
  });
  assert.equal(await unconfigured.configured(), false);
  await assert.rejects(() => unconfigured.encrypt(owner, fakeKey));
  const h = await harness();
  t.after(h.close);
  await h.connection.db
    .insert(audioSettings)
    .values({ ownerUserId: other, provider: 'openai', encryptedApiKey: first });
  const broken = await requestAudio(h.app, 'other');
  assert.equal(broken.statusCode, 503);
  assert.ok(!broken.body.includes(fakeKey));
  assert.equal(h.providers.cloudKeys.length, 0);
});
test('cloud provider test checks models without audio, with fixed endpoint and sanitized failure', async () => {
  let calls = 0;
  const providers = new ConfiguredAudioProviders(async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/models');
    assert.equal(init?.body, undefined);
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Bearer ${fakeKey}`,
    );
    return new Response('{}', { status: 401 });
  });
  assert.equal(await providers.testCloud(fakeKey), false);
  assert.equal(calls, 1);
  // A Worker cannot run the local decoder, so local Whisper is unavailable.
  assert.equal(await providers.localAvailable(), false);
  await assert.rejects(() =>
    providers.local().transcribe(new Uint8Array(1), 'audio/wav'),
  );
});

test('provider snapshot prevents a local recording being sent to cloud after another tab changes settings', async (t) => {
  const h = await harness();
  t.after(h.close);
  await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'openai', apiKey: fakeKey },
  });
  const result = await h.app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      ...headers(),
      'content-type': 'audio/wav',
      'x-ordo-audio-provider': 'local_whisper',
    },
    payload: Buffer.from(audio),
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.json().error.code, 'AUDIO_SETTINGS_CHANGED');
  assert.equal(h.providers.cloudKeys.length, 0);
  const missing = await h.app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: { ...headers(), 'content-type': 'audio/wav' },
    payload: Buffer.from(audio),
  });
  assert.equal(missing.statusCode, 409);
  assert.equal(missing.json().error.code, 'AUDIO_SETTINGS_CHANGED');
  assert.equal(h.providers.cloudKeys.length, 0);
  // The same guard applies before a local send when the user had selected cloud.
  await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'local_whisper' },
  });
  const back = await h.app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      ...headers(),
      'content-type': 'audio/wav',
      'x-ordo-audio-provider': 'openai',
    },
    payload: Buffer.from(audio),
  });
  assert.equal(back.statusCode, 409);
  const { TranscriptionsService } =
    await import('../src/domains/transcriptions/transcriptions.service.js');
  const temporary = Buffer.from(audio);
  const service = new TranscriptionsService(
    undefined,
    65000,
    (account, expected) => h.service.resolve(account, expected),
  );
  await assert.rejects(
    () =>
      service.transcribe(owner, 'audio/wav', temporary, undefined, 'openai'),
    (error: unknown) =>
      (error as { code?: string }).code === 'AUDIO_SETTINGS_CHANGED',
  );
  assert.ok(temporary.every((byte: number) => byte === 0));
});
