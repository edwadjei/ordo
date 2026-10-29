import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, RequestError } from '../src/index.ts';
import type { CaptureRun, Suggestions } from '../src/capture.ts';

/** A fake API whose "model" returns fixed suggestions, or is unavailable. */
function fakeApi(model: 'ok' | 'unavailable' | 'invalid' = 'ok') {
  const runs = new Map<string, CaptureRun>();
  const savedKeys = new Map<string, unknown>();
  const calls: { method: string; url: string; body: any; headers: Headers }[] =
    [];
  const suggestions: Suggestions = {
    summary: 'UAT readiness check-in.',
    tasks: [
      { key: 't1', title: 'Send QA the test scope', isFollowUp: false },
      {
        key: 't2',
        title: 'Check readiness with QA',
        isFollowUp: true,
        followUpDate: '2026-10-30',
      },
    ],
    drafts: [
      {
        key: 'd1',
        kind: 'email',
        to: 'qa@example.test',
        subject: 'UAT readiness',
        body: 'Hi QA, …',
      },
    ],
    destination: {
      workspaceId: 'w-mtn',
      projectId: 'p-sim',
      confidence: 'high',
      reason: 'Mentions SIM registration',
    },
  };
  const transport = async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method || 'GET';
    const path = String(url).replace(/^\/api/, '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({
      method,
      url: path,
      body,
      headers: new Headers(init?.headers),
    });
    let match = path.match(/^\/notes\/([^/]+)\/process$/);
    if (match && method === 'POST') {
      const run: CaptureRun = {
        id: `run-${runs.size + 1}`,
        noteId: match[1],
        status:
          model === 'ok'
            ? 'ready'
            : model === 'unavailable'
              ? 'pending'
              : 'failed',
        provider: 'fake',
        model: 'fake-1',
        suggestions: model === 'ok' ? suggestions : null,
        errorCode:
          model === 'ok'
            ? null
            : model === 'unavailable'
              ? 'AI_UNAVAILABLE'
              : 'AI_INVALID_OUTPUT',
      };
      runs.set(run.id, run);
      return Response.json(run, { status: 201 });
    }
    match = path.match(/^\/capture-runs\/([^/]+)\/save$/);
    if (match && method === 'POST') {
      const key = new Headers(init?.headers).get('Idempotency-Key')!;
      if (savedKeys.has(key)) return Response.json(savedKeys.get(key));
      const run = runs.get(match[1])!;
      if (run.status === 'saved')
        return Response.json(
          { error: { code: 'RUN_ALREADY_SAVED', message: 'Already saved.' } },
          { status: 409 },
        );
      run.status = 'saved';
      const result = {
        run,
        tasks: body.tasks.map((t: { title: string }, i: number) => ({
          id: `task-${i}`,
          title: t.title,
        })),
        drafts: body.drafts.map(
          (d: { subject: string; kind: string }, i: number) => ({
            id: `draft-${i}`,
            subject: d.subject,
            kind: d.kind,
          }),
        ),
      };
      savedKeys.set(key, result);
      return Response.json(result, { status: 201 });
    }
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Not found' } },
      { status: 404 },
    );
  };
  return { transport, calls, runs };
}

test('Process with AI posts the chosen destination and returns reviewable suggestions', async () => {
  const api = fakeApi();
  const client = createClient('/api', api.transport);
  client.setAccount('owner');
  const run = await client.processNote('note-1', {
    workspaceId: 'w-mtn',
    projectId: null,
  });
  assert.equal(run.status, 'ready');
  assert.equal(run.suggestions?.tasks.length, 2);
  assert.deepEqual(api.calls[0].body, {
    workspaceId: 'w-mtn',
    projectId: null,
  });
  assert.equal(api.calls[0].headers.get('X-Ordo-Account'), 'owner');
});

test('unavailable AI gives a pending run and invalid output a failed one, with no suggestions', async () => {
  for (const [model, status] of [
    ['unavailable', 'pending'],
    ['invalid', 'failed'],
  ] as const) {
    const client = createClient('/api', fakeApi(model).transport);
    const run = await client.processNote('note-1', { workspaceId: 'w' });
    assert.equal(run.status, status);
    assert.equal(run.suggestions, null);
  }
});

test('processing can be cancelled', async () => {
  const control = new AbortController();
  const client = createClient('/api', async (_url, init) => {
    assert.equal(init?.signal, control.signal);
    control.abort();
    throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(
    client.processNote('n', { workspaceId: 'w' }, control.signal),
    /Aborted/,
  );
});

test('saving reuses its idempotency key on retry and a second save is refused', async () => {
  const api = fakeApi();
  const client = createClient('/api', api.transport);
  const run = await client.processNote('note-1', { workspaceId: 'w-mtn' });
  const body = {
    workspaceId: 'w-mtn',
    projectId: 'p-sim',
    tasks: [{ title: 'Send QA the test scope', isFollowUp: false }],
    drafts: [],
  };
  const first = await client.saveCaptureRun(run.id, body, 'key-1');
  const retry = await client.saveCaptureRun(run.id, body, 'key-1');
  assert.deepEqual(retry, first);
  assert.equal(api.calls.at(-1)?.headers.get('Idempotency-Key'), 'key-1');
  await assert.rejects(
    client.saveCaptureRun(run.id, body, 'key-2'),
    (error: unknown) =>
      error instanceof RequestError &&
      error.status === 409 &&
      error.code === 'RUN_ALREADY_SAVED',
  );
});

test('drafts list by project, and Mark used patches usedAt with the revision', async () => {
  const sent: { url: string; method?: string; body?: unknown }[] = [];
  const client = createClient('/api', async (url, init) => {
    sent.push({
      url: String(url),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Response.json(
      init?.method ? { id: 'd1', revision: 3 } : { drafts: [] },
    );
  });
  await client.drafts({ projectId: 'p 1' });
  await client.markDraftUsed('d1', 2, new Date('2026-10-29T12:00:00Z'));
  assert.deepEqual(sent, [
    { url: '/api/drafts?projectId=p+1', method: undefined, body: undefined },
    {
      url: '/api/drafts/d1',
      method: 'PATCH',
      body: { usedAt: '2026-10-29T12:00:00.000Z', expectedRevision: 2 },
    },
  ]);
});
