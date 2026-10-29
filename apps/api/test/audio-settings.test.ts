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
import {
  WorkersAiTranscriber,
  workersAiModel,
  type WorkersAiBinding,
} from '../src/adapters/transcription/workers-ai-transcriber.js';
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
const allowanceMessage =
  "Today's built-in transcription limit is used up; it resets at midnight UTC, or add an OpenAI key in Settings.";
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
  openAiKeys: string[] = [];
  workersAiCalls = 0;
  workersAiAvailable() {
    return this.ready;
  }
  workersAi() {
    this.workersAiCalls++;
    return new FixedTranscriber('Workers AI fictional transcript');
  }
  openAi(key: string) {
    this.openAiKeys.push(key);
    return new FixedTranscriber('OpenAI fictional transcript');
  }
  async testOpenAi(key: string) {
    this.tested.push(key);
    return true;
  }
}
/** A stand-in for the Worker's `AI` binding; never reaches Cloudflare. */
class FakeAi implements WorkersAiBinding {
  calls: {
    model: string;
    contentType?: string;
    bytes: Uint8Array;
    task?: string;
    signal?: AbortSignal;
  }[] = [];
  constructor(
    private readonly behaviour: () => unknown = () => ({
      text: ' Fictional Workers AI words. ',
    }),
  ) {}
  async run(
    model: string,
    inputs: {
      audio: string | { body?: object; contentType?: string };
      task?: string;
    },
    options?: { signal?: AbortSignal },
  ) {
    assert.equal(typeof inputs.audio, 'object', 'audio is never base64');
    const audio = inputs.audio as { body: ReadableStream<Uint8Array> };
    const bytes = new Uint8Array(await new Response(audio.body).arrayBuffer());
    this.calls.push({
      model,
      contentType: (inputs.audio as { contentType?: string }).contentType,
      bytes,
      task: inputs.task,
      signal: options?.signal,
    });
    return this.behaviour();
  }
}
function headers(account = 'owner') {
  return {
    origin,
    cookie: `ordo_session=${(account === 'owner' ? 'a' : 'b').repeat(64)}`,
  };
}
async function harness(
  options: { ai?: WorkersAiBinding; realProviders?: boolean } = {},
) {
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
    options.realProviders
      ? { ai: options.ai, credentialKey }
      : { providers, credentialKey },
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
audio.write('fictional', 20);
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
test('per-account audio defaults to Workers AI, encrypts an OpenAI key and never returns or shares it', async (t) => {
  const h = await harness();
  t.after(h.close);
  const initial = await h.app.inject({
    url: '/v1/settings/audio',
    headers: headers(),
  });
  assert.equal(initial.statusCode, 200);
  assert.deepEqual(initial.json(), {
    provider: 'workers_ai',
    workersAiAvailable: true,
    hasApiKey: false,
    configured: true,
  });
  assert.equal(
    (await requestAudio(h.app)).json().transcript,
    'Workers AI fictional transcript',
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
    'OpenAI fictional transcript',
  );
  assert.deepEqual(h.providers.openAiKeys, [fakeKey]);
  assert.equal(
    (await requestAudio(h.app, 'other')).json().transcript,
    'Workers AI fictional transcript',
  );
  const foreign = await h.app.inject({
    url: '/v1/settings/audio',
    headers: headers('other'),
  });
  assert.equal(foreign.json().provider, 'workers_ai');
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
  // Switching back to Workers AI keeps the saved key but stops using it.
  await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'workers_ai' },
  });
  assert.equal(
    (await requestAudio(h.app)).json().transcript,
    'Workers AI fictional transcript',
  );
  assert.deepEqual(h.providers.openAiKeys, [fakeKey]);
  const ready = await h.app.inject({
    method: 'POST',
    url: '/v1/settings/audio/test',
    headers: headers(),
  });
  assert.deepEqual(ready.json(), {
    ok: true,
    message: 'Built-in transcription is ready on this server.',
  });
});
test('local_whisper is no longer an accepted provider', async (t) => {
  const h = await harness();
  t.after(h.close);
  const rejected = await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'local_whisper' },
  });
  assert.equal(rejected.statusCode, 400);
  const snapshot = await h.app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      ...headers(),
      'content-type': 'audio/wav',
      'x-ordo-audio-provider': 'local_whisper',
    },
    payload: Buffer.from(audio),
  });
  assert.equal(snapshot.statusCode, 400);
  // The database refuses it too (0002 rebuilt the CHECK constraint).
  await assert.rejects(() =>
    h.connection.d1
      .prepare(
        "INSERT INTO audio_settings (owner_user_id, provider) VALUES (?, 'local_whisper')",
      )
      .bind(owner)
      .run(),
  );
});
test('without the AI binding Workers AI is unavailable and never falls back to a saved OpenAI key', async (t) => {
  const h = await harness();
  t.after(h.close);
  h.providers.ready = false;
  const status = (
    await h.app.inject({ url: '/v1/settings/audio', headers: headers() })
  ).json();
  assert.equal(status.workersAiAvailable, false);
  assert.equal(status.configured, false);
  const missing = await requestAudio(h.app);
  assert.equal(missing.statusCode, 503);
  assert.equal(missing.json().error.code, 'WORKERS_AI_UNAVAILABLE');
  assert.equal(
    missing.json().error.message,
    "Built-in transcription isn't available on this server. Add an OpenAI key in Settings to transcribe here.",
  );
  const probe = await h.app.inject({
    method: 'POST',
    url: '/v1/settings/audio/test',
    headers: headers(),
  });
  assert.equal(probe.json().ok, false);
  // Save a key but keep Workers AI selected: still no silent fallback.
  await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'workers_ai', apiKey: fakeKey },
  });
  assert.equal((await requestAudio(h.app)).statusCode, 503);
  assert.equal(h.providers.openAiKeys.length, 0);
  assert.equal(h.providers.workersAiCalls, 0);
});
test('audio readiness, removal and ownership guards do not inherit shared environment credentials', async (t) => {
  const h = await harness();
  t.after(h.close);
  const select = await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'openai' },
  });
  assert.equal(select.json().configured, false);
  const noKey = await requestAudio(h.app);
  assert.equal(noKey.statusCode, 503);
  assert.equal(noKey.json().error.code, 'FEATURE_UNAVAILABLE');
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
  assert.equal(h.providers.workersAiCalls, 0, 'no fallback to Workers AI');
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
        payload: { provider: 'workers_ai' },
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
        payload: { provider: 'workers_ai', removeApiKey: true },
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
  assert.equal(h.providers.openAiKeys.length, 0);
});
test('OpenAI provider test checks models without audio, with fixed endpoint and sanitized failure', async () => {
  let calls = 0;
  const providers = new ConfiguredAudioProviders(
    undefined,
    async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/models');
      assert.equal(init?.body, undefined);
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        `Bearer ${fakeKey}`,
      );
      return new Response('{}', { status: 401 });
    },
  );
  assert.equal(await providers.testOpenAi(fakeKey), false);
  assert.equal(calls, 1);
  // No AI binding: Workers AI reports unavailable and cannot be built.
  assert.equal(providers.workersAiAvailable(), false);
  assert.throws(() => providers.workersAi());
  assert.equal(
    new ConfiguredAudioProviders(new FakeAi()).workersAiAvailable(),
    true,
  );
});
test('Workers AI transcriber streams the recording as body and content type, never base64', async () => {
  const ai = new FakeAi();
  const recording = new Uint8Array(audio);
  const text = await new WorkersAiTranscriber(ai).transcribe(
    recording,
    'audio/wav',
  );
  assert.equal(text, 'Fictional Workers AI words.');
  assert.equal(ai.calls.length, 1);
  const [call] = ai.calls;
  assert.equal(call.model, workersAiModel);
  assert.equal(call.model, '@cf/openai/whisper-large-v3-turbo');
  assert.equal(call.contentType, 'audio/wav');
  assert.equal(call.task, 'transcribe');
  assert.deepEqual(call.bytes, recording);
  assert.ok(call.signal, 'the call carries a deadline signal');
  // The model page's example nests the text in transcription_info.
  const nested = new FakeAi(() => ({
    transcription_info: { text: 'Nested fictional words' },
  }));
  assert.equal(
    await new WorkersAiTranscriber(nested).transcribe(recording, 'audio/wav'),
    'Nested fictional words',
  );
  await assert.rejects(() =>
    new WorkersAiTranscriber(new FakeAi(() => ({}))).transcribe(
      recording,
      'audio/wav',
    ),
  );
});
test('Workers AI through the API: success, request buffer cleared, allowance and other errors are specific and sanitized', async (t) => {
  const ai = new FakeAi();
  const h = await harness({ ai, realProviders: true });
  t.after(h.close);
  const ok = await requestAudio(h.app);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.deepEqual(ok.json(), { transcript: 'Fictional Workers AI words.' });
  assert.equal(ai.calls[0].contentType, 'audio/wav');
  assert.deepEqual(ai.calls[0].bytes, new Uint8Array(audio));
  const failing = (message: string) =>
    harness({
      ai: new FakeAi(() => {
        throw new Error(message);
      }),
      realProviders: true,
    });
  const cases: [string, number, string, string][] = [
    [
      '3036: You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare’s Workers Paid plan if you would like to continue usage.',
      429,
      'TRANSCRIPTION_ALLOWANCE_USED',
      allowanceMessage,
    ],
    [
      'AiError: 3040: Capacity temporarily exceeded, please try again.',
      429,
      'TRANSCRIPTION_BUSY',
      'Built-in transcription is busy. Please retry shortly.',
    ],
    [
      'Binding AI needs to be run remotely',
      503,
      'WORKERS_AI_UNAVAILABLE',
      "Built-in transcription isn't available on this server. Add an OpenAI key in Settings to transcribe here.",
    ],
    [
      '3006: Request is too large',
      413,
      'PAYLOAD_TOO_LARGE',
      'This recording is too large to transcribe. Record a shorter clip.',
    ],
    [
      '5004: Invalid data type for base64 input: secret-provider-detail',
      502,
      'TRANSCRIPTION_FAILED',
      'Transcription failed. Please record again and retry.',
    ],
  ];
  for (const [providerMessage, status, code, message] of cases) {
    const failed = await failing(providerMessage);
    try {
      const response = await requestAudio(failed.app);
      assert.equal(response.statusCode, status, providerMessage);
      assert.deepEqual(response.json().error, { code, message });
      assert.ok(!response.body.includes('neurons'));
      assert.ok(!response.body.includes('secret-provider-detail'));
    } finally {
      await failed.close();
    }
  }
});
test('provider snapshot prevents a Workers AI recording being sent to OpenAI after another tab changes settings', async (t) => {
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
      'x-ordo-audio-provider': 'workers_ai',
    },
    payload: Buffer.from(audio),
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.json().error.code, 'AUDIO_SETTINGS_CHANGED');
  assert.equal(h.providers.openAiKeys.length, 0);
  const missing = await h.app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: { ...headers(), 'content-type': 'audio/wav' },
    payload: Buffer.from(audio),
  });
  assert.equal(missing.statusCode, 409);
  assert.equal(missing.json().error.code, 'AUDIO_SETTINGS_CHANGED');
  assert.equal(h.providers.openAiKeys.length, 0);
  // The same guard applies before a Workers AI send when OpenAI was chosen.
  await h.app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: headers(),
    payload: { provider: 'workers_ai' },
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
  assert.equal(h.providers.workersAiCalls, 0);
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
