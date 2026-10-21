import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import {
  openDatabase,
  users,
  tasks,
  notes,
  workspaces,
  projects,
} from '@ordo/db';
import { DatabaseAdapter } from '../src/adapters/database/database.adapter.js';
import { createSearchModule } from '../src/domains/search/search.module.js';
import { createCapturesModule } from '../src/domains/captures/captures.module.js';
import { LocalCaptureStore } from '../src/adapters/captures/local-capture-store.js';
import { OpenAiTranscriber } from '../src/adapters/transcription/openai-transcriber.js';
import { CapturesService } from '../src/domains/captures/captures.service.js';
import { registerErrorHandler } from '../src/platform/http/error-handler.js';
import { registerRequestSecurity } from '../src/platform/http/request-security.js';
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
async function apiHarness(transcriber?: Transcriber) {
  const directory = await mkdtemp(join(tmpdir(), 'ordo-captures-'));
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerRequestSecurity(app, {
    authenticator: new TestSessions(),
    trustedOrigins: [origin],
  });
  const module = createCapturesModule({
    dataDir: directory,
    transcriber: transcriber ?? null,
  });
  module.register(app);
  await app.ready();
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
// Small fixture bytes are intentionally not a live recording and never leave the process.
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
async function upload(app: Awaited<ReturnType<typeof apiHarness>>['app']) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/captures',
    headers: { ...webHeaders(), 'content-type': 'audio/wav' },
    payload: audio,
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
test('PostgreSQL search stems content, ranks results, excludes archives and other owners', async (t) => {
  const connection = await openDatabase();
  t.after(() => connection.close());
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
  ]);
  await connection.db.insert(notes).values({
    id: note,
    ownerUserId: owner,
    title: 'Strategy',
    body: 'We planned launches carefully',
  });
  const app = Fastify();
  t.after(() => app.close());
  registerErrorHandler(app);
  registerRequestSecurity(app, {
    authenticator: new TestSessions(),
    trustedOrigins: [origin],
  });
  createSearchModule(new DatabaseAdapter(connection.db)).register(app);
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
test('recordings persist privately and survive service recreation with owner isolation', async (t) => {
  const h = await apiHarness();
  t.after(h.close);
  const record = await upload(h.app);
  const bytes = await h.app.inject({
    url: `/v1/captures/${record.id}/audio`,
    headers: webHeaders(),
  });
  assert.equal(bytes.statusCode, 200);
  assert.deepEqual(bytes.rawPayload, audio);
  assert.equal(bytes.headers['x-content-type-options'], 'nosniff');
  const recreated = new CapturesService(new LocalCaptureStore(h.directory));
  assert.equal((await recreated.get(owner, record.id)).status, 'recorded');
  assert.deepEqual(
    Buffer.from((await recreated.audio(owner, record.id)).audio),
    audio,
  );
  for (const route of [
    `/v1/captures/${record.id}`,
    `/v1/captures/${record.id}/audio`,
  ])
    assert.equal(
      (await h.app.inject({ url: route, headers: webHeaders('other') }))
        .statusCode,
      404,
    );
  const list = await h.app.inject({
    url: '/v1/captures',
    headers: webHeaders('other'),
  });
  assert.deepEqual(list.json(), { captures: [] });
  assert.equal(
    (
      await h.app.inject({
        method: 'POST',
        url: `/v1/captures/${record.id}/transcribe`,
        headers: webHeaders('other'),
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await h.app.inject({
        method: 'POST',
        url: `/v1/captures/${record.id}/transcribe`,
        headers: webHeaders(),
      })
    ).statusCode,
    503,
  );
  assert.equal(
    (
      await h.app.inject({
        url: `/v1/captures/${record.id}`,
        headers: webHeaders(),
      })
    ).json().status,
    'recorded',
  );
});
test('capture upload enforces origin, size and nonempty audio limits', async (t) => {
  const h = await apiHarness();
  t.after(h.close);
  assert.equal(
    (
      await h.app.inject({
        method: 'POST',
        url: '/v1/captures',
        headers: { cookie: 'ordo_session=owner', 'content-type': 'audio/wav' },
        payload: audio,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await h.app.inject({
        method: 'POST',
        url: '/v1/captures',
        headers: { ...webHeaders(), 'content-type': 'audio/wav' },
        payload: Buffer.alloc(0),
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await h.app.inject({
        method: 'POST',
        url: '/v1/captures',
        headers: { ...webHeaders(), 'content-type': 'audio/wav' },
        payload: Buffer.alloc(20 * 1024 * 1024 + 1),
      })
    ).statusCode,
    413,
  );
  assert.equal(
    (
      await h.app.inject({
        url: '/v1/captures/not-a-uuid/audio',
        headers: webHeaders(),
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await h.app.inject({
        method: 'POST',
        url: '/v1/captures',
        headers: { ...webHeaders(), 'content-type': 'audio/wav' },
        payload: Buffer.from('not real audio'),
      })
    ).statusCode,
    400,
  );
});
test('transcription failure retains audio, exposes no provider details, and supports a safe retry', async (t) => {
  const provider = new TestTranscriber();
  provider.fail = true;
  const h = await apiHarness(provider);
  t.after(h.close);
  const record = await upload(h.app);
  const failed = await h.app.inject({
    method: 'POST',
    url: `/v1/captures/${record.id}/transcribe`,
    headers: webHeaders(),
  });
  assert.equal(failed.statusCode, 502);
  assert.ok(!failed.body.includes('SECRET-PROVIDER-DETAIL'));
  const persisted = JSON.parse(
    await readFile(
      join(h.directory, owner, record.id, 'metadata.json'),
      'utf8',
    ),
  );
  assert.equal(persisted.status, 'failed');
  provider.fail = false;
  const done = await h.app.inject({
    method: 'POST',
    url: `/v1/captures/${record.id}/transcribe`,
    headers: webHeaders(),
  });
  assert.equal(done.statusCode, 200, done.body);
  assert.equal(done.json().transcript, 'A fictional test transcript.');
  await h.app.inject({
    method: 'POST',
    url: `/v1/captures/${record.id}/transcribe`,
    headers: webHeaders(),
  });
  assert.equal(provider.calls, 2);
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

test('concurrent transcription requests do not duplicate provider calls and interrupted work can retry', async (t) => {
  let finish!: (value: string) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const transcript = new Promise<string>((resolve) => {
    finish = resolve;
  });
  class SlowTranscriber extends Transcriber {
    calls = 0;
    async transcribe() {
      this.calls++;
      entered();
      return transcript;
    }
  }
  const provider = new SlowTranscriber();
  const h = await apiHarness(provider);
  t.after(h.close);
  const record = await upload(h.app);
  const first = h.service.transcribe(owner, record.id);
  await started;
  await assert.rejects(
    () => h.service.transcribe(owner, record.id),
    (error: unknown) =>
      (error as { code?: string }).code === 'TRANSCRIPTION_IN_PROGRESS',
  );
  assert.equal(provider.calls, 1);
  finish('Saved transcript');
  await first;
  const store = new LocalCaptureStore(h.directory);
  const persisted = await store.get(owner, record.id);
  assert.ok(persisted);
  await store.update(owner, {
    ...persisted,
    status: 'transcribing',
    transcript: undefined,
  });
  const restarted = new CapturesService(store, new TestTranscriber());
  assert.equal((await restarted.get(owner, record.id)).status, 'recorded');
  assert.equal(
    (await restarted.transcribe(owner, record.id)).status,
    'transcribed',
  );
});
