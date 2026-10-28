import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromHex } from '../src/adapters/cryptography/encoding.js';
import { AudioProviders } from '../src/capabilities/audio-providers.contract.js';
import { Transcriber } from '../src/capabilities/transcriber.contract.js';
import { OtpDelivery } from '../src/capabilities/otp-delivery.contract.js';
import { apiHarness, origin, signIn, TestDelivery } from './d1-harness.js';

class NoDelivery extends OtpDelivery {
  available() {
    return false;
  }
  async send() {}
}
class StubTranscriber extends Transcriber {
  async transcribe() {
    return 'fictional';
  }
}
class Providers extends AudioProviders {
  constructor(private readonly ready: boolean) {
    super();
  }
  workersAiAvailable() {
    return this.ready;
  }
  workersAi() {
    return new StubTranscriber();
  }
  openAi() {
    return new StubTranscriber();
  }
  async testOpenAi() {
    return true;
  }
}

async function harness(
  t: { after(fn: () => Promise<void>): void },
  options: {
    workersAi?: boolean;
    credentialKey?: boolean;
    delivery?: OtpDelivery;
  } = {},
) {
  const { app } = await apiHarness({
    otpDelivery: options.delivery ?? new NoDelivery(),
    audioSettings: {
      providers: new Providers(options.workersAi ?? false),
      credentialKey:
        (options.credentialKey ?? true) ? fromHex('2b'.repeat(32)) : undefined,
    },
  });
  t.after(() => app.close());
  return app;
}

test('capabilities report transcription providers and credential storage', async (t) => {
  const absent = await harness(t);
  const response = await absent.inject('/v1/capabilities');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    otp: { email: false, sms: false },
    recording: false,
    transcription: false,
    aiCapture: false,
    transcriptImport: false,
    transcriptionProviders: { workersAi: false, openai: true },
    credentialStorage: true,
  });
  const bound = await harness(t, { workersAi: true });
  const ready = (await bound.inject('/v1/capabilities')).json();
  assert.equal(ready.transcriptionProviders.workersAi, true);
  assert.equal(ready.recording, true);
  assert.equal(ready.transcription, true);
  const misconfigured = await harness(t, { credentialKey: false });
  const broken = (await misconfigured.inject('/v1/capabilities')).json();
  assert.equal(broken.credentialStorage, false);
  assert.equal(broken.transcriptionProviders.openai, false);
});

test('without Workers AI, capabilities report transcription for a signed-in account with a saved OpenAI key', async (t) => {
  const delivery = new TestDelivery();
  const app = await harness(t, { delivery });
  const { cookie } = await signIn({ app, delivery });
  const before = (
    await app.inject({ url: '/v1/capabilities', headers: { cookie } })
  ).json();
  assert.equal(before.transcription, false);
  const saved = await app.inject({
    method: 'PATCH',
    url: '/v1/settings/audio',
    headers: { cookie, origin },
    payload: { provider: 'openai', apiKey: 'sk-fictional-test-key-never-real' },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  const after = (
    await app.inject({ url: '/v1/capabilities', headers: { cookie } })
  ).json();
  assert.equal(after.recording, true);
  assert.equal(after.transcription, true);
  assert.equal(after.transcriptionProviders.workersAi, false);
  // Anonymous callers and unknown sessions still see the runtime only.
  assert.equal(
    (await app.inject('/v1/capabilities')).json().transcription,
    false,
  );
  const stranger = await app.inject({
    url: '/v1/capabilities',
    headers: { cookie: `ordo_session=${'c'.repeat(64)}` },
  });
  assert.equal(stranger.statusCode, 200);
  assert.equal(stranger.json().transcription, false);
});

test('Hono host keeps body limits, media types, the error envelope and security headers', async (t) => {
  const app = await harness(t);
  const post = (
    payload: string | Uint8Array,
    contentType: string | undefined,
    url = '/v1/auth/otp/request',
  ) =>
    app.inject({
      method: 'POST',
      url,
      headers: {
        origin,
        ...(contentType ? { 'content-type': contentType } : {}),
      },
      payload,
    });
  const large = JSON.stringify({ contact: 'x'.repeat(150_001) });
  const tooLarge = await post(large, 'application/json');
  assert.equal(tooLarge.statusCode, 413);
  assert.equal(tooLarge.json().error.code, 'PAYLOAD_TOO_LARGE');
  const malformed = await post('{"contact":', 'application/json');
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.json().error.code, 'INVALID_INPUT');
  const empty = await post('', 'application/json');
  assert.equal(empty.statusCode, 400);
  const poisoned = await post(
    '{"contact":"a@example.invalid","__proto__":{"x":1}}',
    'application/json',
  );
  assert.equal(poisoned.statusCode, 400);
  const unsupported = await post('<x/>', 'application/xml');
  assert.equal(unsupported.statusCode, 415);
  assert.equal(unsupported.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');
  // Unavailable delivery still answers with the envelope after parsing.
  const valid = await post(
    JSON.stringify({ contact: 'a@example.invalid' }),
    'application/json; charset=utf-8',
  );
  assert.equal(valid.statusCode, 503);
  assert.equal(valid.json().error.code, 'OTP_UNAVAILABLE');
  assert.equal(valid.headers['cache-control'], 'no-store');
  assert.equal(valid.headers['x-content-type-options'], 'nosniff');
  assert.match(String(valid.headers['content-type']), /^application\/json/);
  // Unknown routes still pass the session guard first, then 404.
  assert.equal((await app.inject('/v1/unknown')).statusCode, 401);
  const unknown = await app.inject({
    url: '/v1/unknown',
    headers: { cookie: `ordo_session=${'c'.repeat(64)}` },
  });
  assert.equal(unknown.statusCode, 401);
  assert.equal((await app.inject('/health')).json().status, 'ok');
  const missing = await app.inject('/not-a-route');
  assert.equal(missing.statusCode, 401);
});
