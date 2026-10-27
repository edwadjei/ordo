import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import { openDatabase, users, audioSettings } from '@ordo/db';
import {
  DatabaseAdapter,
  eq,
} from '../src/adapters/database/database.adapter.js';
import { FileSecretCipher } from '../src/adapters/secrets/file-secret-cipher.js';
import { ConfiguredAudioProviders } from '../src/adapters/transcription/configured-audio-providers.js';
import {
  LocalWhisperTranscriber,
  FfmpegDecoder,
} from '../src/adapters/transcription/local-whisper-transcriber.js';
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
  const directory = await mkdtemp(join(tmpdir(), 'ordo-audio-settings-')),
    connection = await openDatabase(),
    providers = new TestProviders();
  await connection.db.insert(users).values([
    {
      id: owner,
      email: `${owner}@example.invalid`,
      displayName: 'Owner',
      passwordHash: 'test',
    },
    {
      id: other,
      email: `${other}@example.invalid`,
      displayName: 'Other',
      passwordHash: 'test',
    },
  ]);
  const settings = createAudioSettingsModule(
    new DatabaseAdapter(connection.db),
    {
      providers,
      keyFile: join(directory, 'secrets', 'audio-key'),
      environment: {},
    },
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
    directory,
    connection,
    providers,
    app,
    service: settings.service,
    close: async () => {
      await app.close();
      await connection.close();
      await rm(directory, { recursive: true, force: true });
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
  assert.deepEqual(await readdir(h.directory), []);
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
    (await stat(join(h.directory, 'secrets', 'audio-key'))).mode & 0o777,
    0o600,
  );
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
  assert.deepEqual(await readdir(h.directory), []);
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
test('encrypted keys are authenticated to the owner, use random nonces and survive server restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ordo-cipher-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'master'),
    cipher = new FileSecretCipher(path);
  const first = await cipher.encrypt(owner, fakeKey),
    second = await cipher.encrypt(owner, fakeKey);
  assert.notEqual(first, second);
  assert.equal((await readFile(path)).length, 32);
  assert.equal(await new FileSecretCipher(path).decrypt(owner, first), fakeKey);
  await assert.rejects(() => cipher.decrypt(other, first));
  await assert.rejects(() =>
    cipher.decrypt(owner, first.slice(0, -4) + 'AAAA'),
  );
  await assert.rejects(() =>
    new FileSecretCipher(path, 'not-a-master-key').encrypt(owner, fakeKey),
  );
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
test('local whisper health requires ready model; inference uses loopback multipart WAV and clears decoded bytes', async () => {
  const wav = Buffer.from(audio);
  class Decoder extends FfmpegDecoder {
    async available() {
      return true;
    }
    async decode() {
      return wav;
    }
  }
  let calls = 0;
  const local = new LocalWhisperTranscriber(
    'http://127.0.0.1:4316',
    new Decoder(),
    async (url, init) => {
      calls++;
      if (String(url).endsWith('/health'))
        return new Response(JSON.stringify({ status: 'ok' }));
      assert.equal(url, 'http://127.0.0.1:4316/inference');
      const form = init?.body as FormData;
      const file = form.get('file') as Blob;
      assert.equal(file.type, 'audio/wav');
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), audio);
      assert.equal(form.get('response_format'), 'json');
      return new Response(JSON.stringify({ text: '  Local speech  ' }));
    },
  );
  assert.equal(await local.available(), true);
  assert.equal(
    await local.transcribe(Buffer.from(audio), 'audio/wav'),
    'Local speech',
  );
  assert.ok(wav.every((byte) => byte === 0));
  assert.equal(calls, 2);
  const loading = new LocalWhisperTranscriber(
    'http://127.0.0.1:4316',
    new Decoder(),
    async () =>
      new Response(JSON.stringify({ status: 'loading model' }), {
        status: 503,
      }),
  );
  assert.equal(await loading.available(), false);
  assert.throws(
    () => new LocalWhisperTranscriber('http://external.invalid:4316'),
  );
  assert.throws(
    () => new LocalWhisperTranscriber('http://user@localhost:4316'),
  );
});
test('ffmpeg converts only through stdin/stdout with bounded output and cancels without temporary files', async () => {
  let killed = false;
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    kill: () => boolean;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.kill = () => {
    killed = true;
    return true;
  };
  const launch = ((command: string, args: string[], options: unknown) => {
    assert.equal(command, '/fake/ffmpeg');
    assert.ok(args.includes('pipe:0'));
    assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'pipe');
    assert.ok(args.includes('pipe:1'));
    assert.ok(!args.some((arg) => arg.includes('.wav')));
    assert.deepEqual(options, { stdio: ['pipe', 'pipe', 'ignore'] });
    process.nextTick(() => {
      child.stdout.write(Buffer.from(audio));
      child.emit('close', 0);
    });
    return child;
  }) as unknown as typeof spawn;
  const decoded = await new FfmpegDecoder('/fake/ffmpeg', launch).decode(
    Buffer.from(audio),
  );
  assert.deepEqual(Buffer.from(decoded), audio);
  assert.equal(killed, false);
  const pending = new EventEmitter() as typeof child;
  pending.stdin = new PassThrough();
  pending.stdout = new PassThrough();
  pending.kill = () => {
    killed = true;
    return true;
  };
  const controller = new AbortController();
  const cancelled = new FfmpegDecoder(
    '/fake/ffmpeg',
    (() => pending) as unknown as typeof spawn,
  ).decode(Buffer.from(audio), controller.signal);
  controller.abort();
  await assert.rejects(() => cancelled);
  assert.equal(killed, true);
});
test('cloud provider test checks models without audio, with fixed endpoint and sanitized failure', async () => {
  let calls = 0;
  const providers = new ConfiguredAudioProviders({}, async (url, init) => {
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
});

test('decoder rejects excessive PCM output and local HTTP cancellation clears decoded memory', async () => {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    kill: () => boolean;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  let killed = false;
  child.kill = () => {
    killed = true;
    return true;
  };
  const decoder = new FfmpegDecoder('/fake/ffmpeg', (() => {
    process.nextTick(() =>
      child.stdout.write(Buffer.alloc(16 * 1024 * 1024 + 1, 1)),
    );
    return child;
  }) as unknown as typeof spawn);
  await assert.rejects(() => decoder.decode(Buffer.from(audio)));
  assert.equal(killed, true);
  const decoded = Buffer.from(audio);
  class Decoder extends FfmpegDecoder {
    async decode() {
      return decoded;
    }
  }
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const local = new LocalWhisperTranscriber(
    'http://127.0.0.1:4316',
    new Decoder(),
    async (_url, init) => {
      entered();
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener(
          'abort',
          () => reject(new Error('cancelled')),
          { once: true },
        ),
      );
    },
  );
  const controller = new AbortController(),
    request = local.transcribe(
      Buffer.from(audio),
      'audio/wav',
      controller.signal,
    );
  await started;
  controller.abort();
  await assert.rejects(() => request);
  assert.ok(decoded.every((byte) => byte === 0));
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
  assert.ok(temporary.every((byte) => byte === 0));
});
