import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { users, tasks, notes, workspaces, projects } from '@ordo/db';
import { openTestDatabase } from './d1-harness.js';
import { DatabaseAdapter } from '../src/adapters/database/database.adapter.js';
import { createSearchModule } from '../src/domains/search/search.module.js';
import { createTranscriptionsModule } from '../src/domains/transcriptions/transcriptions.module.js';
import { TranscriptionsService } from '../src/domains/transcriptions/transcriptions.service.js';
import { OpenAiTranscriber } from '../src/adapters/transcription/openai-transcriber.js';
import { guardedApp } from './http-harness.js';
import { SessionAuthenticator } from '../src/capabilities/session-authenticator.contract.js';
import { Transcriber } from '../src/capabilities/transcriber.contract.js';
const owner = randomUUID(),
  other = randomUUID(),
  origin = 'http://localhost:3318';
class TestSessions extends SessionAuthenticator {
  async resolveSession(token: string) {
    return ['a'.repeat(64), 'b'.repeat(64)].includes(token)
      ? {
          id: token === 'a'.repeat(64) ? owner : other,
          email: 'test@example.invalid',
          displayName: 'Fictional',
          timezone: 'Africa/Accra',
        }
      : null;
  }
}
class TestTranscriber extends Transcriber {
  calls = 0;
  fail = false;
  async transcribe() {
    this.calls++;
    if (this.fail) throw new Error('SECRET-PROVIDER-DETAIL');
    return 'A fictional test transcript.';
  }
}
function webHeaders(account = 'owner') {
  return {
    origin,
    cookie: `ordo_session=${(account === 'owner' ? 'a' : 'b').repeat(64)}`,
  };
}
async function apiHarness(transcriber?: Transcriber, timeoutMs?: number) {
  const directory = await mkdtemp(join(tmpdir(), 'ordo-temporary-audio-'));
  const module = createTranscriptionsModule({
    transcriber: transcriber ?? null,
    timeoutMs,
  });
  const app = await guardedApp(
    { authenticator: new TestSessions(), trustedOrigins: [origin] },
    module,
  );
  return {
    app,
    directory,
    service: module.service,
    close: async () => {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
// Fictional zero-frame WAV fixture; never sent to a real provider.
const audio = Buffer.alloc(44);
audio.write('RIFF', 0);
audio.writeUInt32LE(36, 4);
audio.write('WAVE', 8);
audio.write('fmt ', 12);
audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20);
audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24);
audio.writeUInt32LE(16000, 28);
audio.writeUInt16LE(2, 32);
audio.writeUInt16LE(16, 34);
audio.write('data', 36);
function transcribe(
  app: Awaited<ReturnType<typeof apiHarness>>['app'],
  payload: Buffer = Buffer.from(audio),
  extraHeaders: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: { ...webHeaders(), 'content-type': 'audio/wav', ...extraHeaders },
    payload,
  });
}
test('FTS5 search stems content, ranks results, excludes archives and other owners', async (t) => {
  const connection = await openTestDatabase();
  t.after(() => connection.close());
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
  const workspace = randomUUID(),
    project = randomUUID();
  await connection.db.insert(workspaces).values({
    id: workspace,
    ownerUserId: owner,
    name: 'Workspace',
    color: '#557799',
  });
  await connection.db.insert(projects).values({
    id: project,
    workspaceId: workspace,
    ownerUserId: owner,
    name: 'Research',
    description: 'Planning releases',
  });
  const active = randomUUID(),
    archived = randomUUID(),
    foreign = randomUUID(),
    waiting = randomUUID(),
    foreignWaiting = randomUUID(),
    note = randomUUID();
  await connection.db.insert(tasks).values([
    {
      id: active,
      ownerUserId: owner,
      title: 'Review release',
      description: 'Carefully planning all launches',
    },
    {
      id: archived,
      ownerUserId: owner,
      title: 'Planning hidden',
      deletedAt: new Date().toISOString(),
    },
    { id: foreign, ownerUserId: other, title: 'Planning private' },
    {
      id: waiting,
      ownerUserId: owner,
      title: 'Signed contract',
      responsiblePerson: 'Ama Mensah',
      waitingOn: 'Kwame Boateng',
    },
    {
      id: foreignWaiting,
      ownerUserId: other,
      title: 'Other contract',
      waitingOn: 'Kwame Boateng',
    },
  ]);
  await connection.db.insert(notes).values({
    id: note,
    ownerUserId: owner,
    title: 'Strategy',
    body: 'We planned launches carefully',
  });
  const app = await guardedApp(
    { authenticator: new TestSessions(), trustedOrigins: [origin] },
    createSearchModule(new DatabaseAdapter(connection.db)),
  );
  t.after(() => app.close());
  const result = await app.inject({
    url: '/v1/search?q=plan',
    headers: webHeaders(),
  });
  assert.equal(result.statusCode, 200, result.body);
  const ids = result.json().results.map((row: { id: string }) => row.id);
  assert.ok(ids.includes(active));
  assert.ok(ids.includes(note));
  assert.ok(ids.includes(project));
  assert.ok(!ids.includes(archived));
  assert.ok(!ids.includes(foreign));
  for (const name of ['Kwame', 'mensah']) {
    const byName = await app.inject({
      url: `/v1/search?q=${name}`,
      headers: webHeaders(),
    });
    assert.deepEqual(
      byName.json().results.map((row: { id: string }) => row.id),
      [waiting],
      name,
    );
  }
  assert.equal((await app.inject('/v1/search?q=plan')).statusCode, 401);
  assert.equal(
    (await app.inject({ url: '/v1/search?q=', headers: webHeaders() }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        url: '/v1/search?q=' + encodeURIComponent("'; DROP TABLE tasks; --"),
        headers: webHeaders(),
      })
    ).statusCode,
    200,
  );
});

test('transcription returns text without saving audio or transcripts and old storage routes are gone', async (t) => {
  const provider = new TestTranscriber();
  const h = await apiHarness(provider);
  t.after(h.close);
  const cwd = process.cwd();
  process.chdir(h.directory);
  try {
    assert.deepEqual(await readdir(h.directory), []);
    const result = await transcribe(h.app);
    assert.equal(result.statusCode, 200, result.body);
    assert.deepEqual(result.json(), {
      transcript: 'A fictional test transcript.',
    });
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(provider.calls, 1);
    assert.deepEqual(await readdir(h.directory), []);
    for (const url of [
      '/v1/captures',
      `/v1/captures/${randomUUID()}`,
      `/v1/captures/${randomUUID()}/audio`,
    ])
      assert.equal(
        (await h.app.inject({ url, headers: webHeaders() })).statusCode,
        404,
      );
    // No cached/persisted transcript: an explicit second request runs independently.
    await transcribe(h.app);
    assert.equal(provider.calls, 2);
    assert.deepEqual(await readdir(h.directory), []);
  } finally {
    process.chdir(cwd);
  }
});
test('missing provider and provider failure leave no files and never expose private provider details', async (t) => {
  const provider = new TestTranscriber();
  provider.fail = true;
  const h = await apiHarness(provider);
  t.after(h.close);
  const failed = await transcribe(h.app);
  assert.equal(failed.statusCode, 502);
  assert.ok(!failed.body.includes('SECRET-PROVIDER-DETAIL'));
  assert.deepEqual(await readdir(h.directory), []);
  provider.fail = false;
  assert.equal((await transcribe(h.app)).statusCode, 200);
  const absent = await apiHarness();
  t.after(absent.close);
  assert.equal((await transcribe(absent.app)).statusCode, 503);
  assert.deepEqual(await readdir(absent.directory), []);
  assert.equal(absent.service.transcriptionAvailable, false);
});
test('temporary audio requires session, trusted origin and matching account and validates MIME/size', async (t) => {
  const provider = new TestTranscriber();
  const h = await apiHarness(provider);
  t.after(h.close);
  assert.equal(
    (
      await h.app.inject({
        method: 'POST',
        url: '/v1/transcriptions',
        headers: { origin, 'content-type': 'audio/wav' },
        payload: Buffer.from(audio),
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await transcribe(h.app, Buffer.from(audio), {
        origin: 'http://attacker.invalid',
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await transcribe(h.app, Buffer.from(audio), { 'x-ordo-account': other }))
      .statusCode,
    409,
  );
  assert.equal(provider.calls, 0);
  assert.equal((await transcribe(h.app, Buffer.alloc(0))).statusCode, 400);
  assert.equal(
    (await transcribe(h.app, Buffer.from('not audio'))).statusCode,
    400,
  );
  assert.equal(
    (
      await transcribe(h.app, Buffer.from(audio), {
        'content-type': 'application/zip',
      })
    ).statusCode,
    415,
  );
  assert.equal(
    (await transcribe(h.app, Buffer.alloc(20 * 1024 * 1024 + 1))).statusCode,
    413,
  );
  assert.equal(provider.calls, 0);
  assert.deepEqual(await readdir(h.directory), []);
});
test('one request per owner and two global provider calls bound concurrency without storing audio', async () => {
  let finish!: (text: string) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const completion = new Promise<string>((resolve) => {
    finish = resolve;
  });
  class SlowTranscriber extends Transcriber {
    calls = 0;
    async transcribe() {
      this.calls++;
      entered();
      return completion;
    }
  }
  const provider = new SlowTranscriber();
  const service = new TranscriptionsService(provider);
  const firstAudio = Buffer.from(audio),
    secondAudio = Buffer.from(audio),
    thirdAudio = Buffer.from(audio);
  const first = service.transcribe(owner, 'audio/wav', firstAudio);
  await started;
  await assert.rejects(
    () => service.transcribe(owner, 'audio/wav', Buffer.from(audio)),
    (error: unknown) =>
      (error as { code?: string }).code === 'TRANSCRIPTION_IN_PROGRESS',
  );
  const second = service.transcribe(other, 'audio/wav', secondAudio);
  await assert.rejects(
    () => service.transcribe(randomUUID(), 'audio/wav', thirdAudio),
    (error: unknown) =>
      (error as { code?: string }).code === 'TRANSCRIPTION_BUSY',
  );
  assert.equal(provider.calls, 2);
  assert.ok(thirdAudio.every((byte: number) => byte === 0));
  finish('Temporary transcript');
  assert.deepEqual(await first, { transcript: 'Temporary transcript' });
  await second;
  assert.ok(firstAudio.every((byte: number) => byte === 0));
  assert.ok(secondAudio.every((byte: number) => byte === 0));
});
test('deadline aborts provider work and clears temporary input on timeout and failure', async () => {
  let aborted = false;
  class HangingTranscriber extends Transcriber {
    async transcribe(
      _audio: Uint8Array,
      _mime: string,
      signal?: AbortSignal,
    ): Promise<string> {
      return new Promise((_resolve, reject) =>
        signal?.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('private abort details'));
          },
          { once: true },
        ),
      );
    }
  }
  const service = new TranscriptionsService(new HangingTranscriber(), 10),
    temporary = Buffer.from(audio);
  await assert.rejects(
    () => service.transcribe(owner, 'audio/wav', temporary),
    (error: unknown) =>
      (error as { code?: string }).code === 'TRANSCRIPTION_FAILED',
  );
  assert.equal(aborted, true);
  assert.ok(temporary.every((byte: number) => byte === 0));
  const unavailable = Buffer.from(audio);
  await assert.rejects(() =>
    new TranscriptionsService().transcribe(owner, 'audio/wav', unavailable),
  );
  assert.ok(unavailable.every((byte: number) => byte === 0));
});
test('OpenAI adapter sends multipart to fixed endpoint and sanitizes failed provider response', async () => {
  let calls = 0;
  const adapter = new OpenAiTranscriber(
    'fictional-key',
    async (input, init) => {
      calls++;
      assert.equal(input, 'https://api.openai.com/v1/audio/transcriptions');
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        'Bearer fictional-key',
      );
      const form = init?.body as FormData;
      assert.equal(form.get('model'), 'gpt-4o-mini-transcribe');
      assert.equal(form.get('response_format'), 'json');
      assert.ok(form.get('file') instanceof Blob);
      return new Response(JSON.stringify({ text: 'Fictional response' }), {
        status: 200,
      });
    },
  );
  assert.equal(
    await adapter.transcribe(audio, 'audio/wav'),
    'Fictional response',
  );
  assert.equal(calls, 1);
  const failing = new OpenAiTranscriber(
    'fictional-key',
    async () => new Response('private provider detail', { status: 429 }),
  );
  await assert.rejects(
    () => failing.transcribe(audio, 'audio/wav'),
    /could not process/,
  );
});

test('disconnecting the caller aborts transcription and clears the request audio', async (t) => {
  let entered!: () => void;
  let cancelled!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const stopped = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  let observed: Uint8Array | undefined;
  let calls = 0;
  class WaitingProvider extends Transcriber {
    async transcribe(
      input: Uint8Array,
      _mime: string,
      signal?: AbortSignal,
    ): Promise<string> {
      calls++;
      observed = input;
      entered();
      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            cancelled();
            reject(new Error('cancelled test request'));
          },
          { once: true },
        );
      });
    }
  }
  const h = await apiHarness(new WaitingProvider());
  t.after(h.close);
  // The Worker aborts `request.signal` when the client goes away; aborting
  // the request's own signal exercises the same path.
  const control = new AbortController();
  const pending = h.app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: { ...webHeaders(), 'content-type': 'audio/wav' },
    payload: Buffer.from(audio),
    signal: control.signal,
  });
  await started;
  control.abort();
  await pending.catch(() => undefined);
  await stopped;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(observed?.every((byte: number) => byte === 0));
  const alreadyCancelled = Buffer.from(audio);
  await assert.rejects(() =>
    h.service.transcribe(owner, 'audio/wav', alreadyCancelled, control.signal),
  );
  assert.equal(calls, 1);
  assert.ok(alreadyCancelled.every((byte: number) => byte === 0));
  assert.deepEqual(await readdir(h.directory), []);
});
