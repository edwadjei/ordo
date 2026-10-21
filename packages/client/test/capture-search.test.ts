import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, RequestError } from '../src/index.ts';

test('audio uses raw bytes, actual MIME type, account precondition, and cancellation', async () => {
  const audio = new Blob(['audio bytes'], { type: 'audio/mp4' });
  const control = new AbortController();
  const client = createClient('/api', async (url, init) => {
    assert.equal(url, '/api/transcriptions');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body, audio);
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'audio/mp4');
    assert.equal(new Headers(init?.headers).get('X-Ordo-Account'), 'owner');
    assert.equal(init?.signal, control.signal);
    assert.equal(
      new Headers(init?.headers).get('X-Ordo-Audio-Provider'),
      'local_whisper',
    );
    assert.equal(init?.credentials, 'include');
    return Response.json({ transcript: 'A transient voice thought.' });
  });
  client.setAccount('owner');
  assert.equal(
    (await client.transcribeAudio(audio, control.signal, 'local_whisper'))
      .transcript,
    'A transient voice thought.',
  );
});

test('server search encodes the whole query and forwards cancellation', async () => {
  const control = new AbortController();
  const client = createClient('/api', async (url, init) => {
    assert.equal(url, '/api/search?q=notes%20%26%20project%3F');
    assert.equal(init?.signal, control.signal);
    return Response.json({ results: [] });
  });
  assert.deepEqual(await client.search('notes & project?', control.signal), {
    results: [],
  });
});

test('OTP requests never carry an old account precondition and failures preserve provider error codes', async () => {
  const client = createClient('/api', async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('X-Ordo-Account'), null);
    return Response.json(
      { error: { code: 'DELIVERY_UNAVAILABLE', message: 'Try again later.' } },
      { status: 503 },
    );
  });
  client.setAccount('old-account');
  await assert.rejects(
    client.requestOtp('fictional@example.test'),
    (error: unknown) =>
      error instanceof RequestError && error.code === 'DELIVERY_UNAVAILABLE',
  );
  await assert.rejects(
    client.verifyOtp({ challengeId: 'fixture', code: '123456' }),
    (error: unknown) => error instanceof RequestError && error.status === 503,
  );
});

test('LAN HTTP request IDs use secure random bytes without requiring randomUUID', async () => {
  const { requestId } = await import('../src/request-id.ts');
  let calls = 0;
  const source = {
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      calls++;
      (array as Uint8Array).fill(255);
      return array;
    },
  };
  assert.equal(requestId(source), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(calls, 1);
  assert.match(
    requestId(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test('account-scoped reads carry the displayed owner while discovery remains untagged', async () => {
  const tagged: string[] = [];
  const client = createClient('/api', async (url, init) => {
    const route = String(url);
    const expected = /\/(search|transcriptions)(\?|\/|$)/.test(route)
      ? 'alice'
      : null;
    assert.equal(
      new Headers(init?.headers).get('X-Ordo-Account'),
      expected,
      route,
    );
    tagged.push(route);
    return Response.json(
      route.includes('/search') ? { results: [] } : { transcript: 'Transient' },
    );
  });
  client.setAccount('alice');
  await client.search('private');
  await client.transcribeAudio(
    new Blob(['audio'], { type: 'audio/webm' }),
    undefined,
    'local_whisper',
  );
  await client.home();
  await client.me();
  await client.capabilities();
  assert.equal(tagged.length, 5);
});

test('account mismatch invalidates current UI but a stale response cannot invalidate a newly selected account', async () => {
  let invalidations = 0;
  let release: (() => void) | undefined;
  const client = createClient(
    '/api',
    async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return Response.json(
        { error: { code: 'SESSION_CHANGED', message: 'Session changed.' } },
        { status: 409 },
      );
    },
    () => invalidations++,
  );
  client.setAccount('alice');
  const first = client.search('private');
  release!();
  await assert.rejects(
    first,
    (cause: unknown) =>
      cause instanceof RequestError && cause.code === 'SESSION_CHANGED',
  );
  assert.equal(invalidations, 1);
  const stale = client.transcribeAudio(
    new Blob(['audio'], { type: 'audio/mp4' }),
    undefined,
    'local_whisper',
  );
  client.setAccount('bob');
  release!();
  await assert.rejects(stale);
  assert.equal(invalidations, 1);
});

test('audio provider settings are owner-scoped, cancellable, and key payload is write-only', async () => {
  const control = new AbortController();
  const calls: string[] = [];
  const client = createClient('/api', async (url, init) => {
    assert.equal(new Headers(init?.headers).get('X-Ordo-Account'), 'alice');
    assert.equal(init?.signal, control.signal);
    calls.push(String(url));
    if (init?.method === 'PATCH') {
      assert.deepEqual(JSON.parse(String(init.body)), {
        provider: 'openai',
        apiKey: 'fixture-key-not-real',
      });
      assert.equal(
        new Headers(init?.headers).get('Content-Type'),
        'application/json',
      );
    } else assert.equal(init?.body, undefined);
    return Response.json(
      String(url).endsWith('/test')
        ? { ok: true, message: 'Fixture connection checked.' }
        : {
            provider: 'openai',
            localAvailable: true,
            hasApiKey: true,
            configured: true,
          },
    );
  });
  client.setAccount('alice');
  await client.audioSettings(control.signal);
  const settings = await client.saveAudioSettings(
    { provider: 'openai', apiKey: 'fixture-key-not-real' },
    control.signal,
  );
  assert.equal('apiKey' in settings, false);
  assert.equal(settings.hasApiKey, true);
  await client.testAudioSettings(control.signal);
  assert.deepEqual(calls, [
    '/api/settings/audio',
    '/api/settings/audio',
    '/api/settings/audio/test',
  ]);
});

test('transcription preserves the visible provider snapshot and rejects changed settings without fallback', async () => {
  let visibleProvider: 'local_whisper' | 'openai' = 'local_whisper';
  const headers: Headers[] = [];
  let release: (() => void) | undefined;
  const client = createClient('/api', async (_url, init) => {
    headers.push(new Headers(init?.headers));
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return Response.json(
      {
        error: { code: 'AUDIO_SETTINGS_CHANGED', message: 'Settings changed.' },
      },
      { status: 409 },
    );
  });
  client.setAccount('alice');
  const pending = client.transcribeAudio(
    new Blob(['audio'], { type: 'audio/webm' }),
    undefined,
    visibleProvider,
  );
  visibleProvider = 'openai';
  release!();
  await assert.rejects(
    pending,
    (cause: unknown) =>
      cause instanceof RequestError && cause.code === 'AUDIO_SETTINGS_CHANGED',
  );
  assert.equal(headers.length, 1);
  assert.equal(headers[0].get('X-Ordo-Audio-Provider'), 'local_whisper');
  assert.equal(visibleProvider, 'openai');
});
