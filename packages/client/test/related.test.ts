import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, RequestError } from '../src/index.ts';

function recorder(reply: (url: string, init?: RequestInit) => Response) {
  const sent: {
    url: string;
    method: string;
    body?: unknown;
    account: string | null;
  }[] = [];
  const client = createClient('/api', async (url, init) => {
    sent.push({
      url: String(url),
      method: init?.method || 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      account: new Headers(init?.headers).get('X-Ordo-Account'),
    });
    return reply(String(url), init);
  });
  client.setAccount('owner');
  return { client, sent };
}

test('archive and restore patch the archived flag with the revision', async () => {
  const { client, sent } = recorder(() =>
    Response.json({ id: 'x', revision: 2 }),
  );
  await client.updateProject('p1', { archived: true, expectedRevision: 1 });
  await client.updateWorkspace('w1', { archived: false, expectedRevision: 4 });
  assert.deepEqual(
    sent.map((s) => [s.method, s.url, s.body]),
    [
      ['PATCH', '/api/projects/p1', { archived: true, expectedRevision: 1 }],
      ['PATCH', '/api/workspaces/w1', { archived: false, expectedRevision: 4 }],
    ],
  );
});

test('a permanent delete reads the preview, then sends the typed name and revision', async () => {
  const { client, sent } = recorder((url, init) =>
    init?.method === 'DELETE'
      ? Response.json({
          deleted: {
            projects: 2,
            tasks: 14,
            notes: 6,
            drafts: 1,
            captureRuns: 3,
          },
        })
      : Response.json({
          name: 'MTN',
          projects: 2,
          tasks: 14,
          notes: 6,
          drafts: 1,
          captureRuns: 3,
        }),
  );
  const preview = await client.deletePreview('workspaces', 'w1');
  assert.equal(preview.tasks, 14);
  const result = await client.deletePermanently('workspaces', 'w1', {
    confirmName: 'MTN',
    expectedRevision: 3,
  });
  assert.equal(result.deleted.notes, 6);
  assert.deepEqual(sent[1], {
    url: '/api/workspaces/w1',
    method: 'DELETE',
    body: { confirmName: 'MTN', expectedRevision: 3 },
    account: 'owner',
  });
});

test('a wrong name and the last workspace come back as errors with their codes', async () => {
  for (const [code, status] of [
    ['CONFIRM_NAME_MISMATCH', 400],
    ['LAST_WORKSPACE', 409],
  ] as const) {
    const { client } = recorder(() =>
      Response.json({ error: { code, message: 'No.' } }, { status }),
    );
    await assert.rejects(
      client.deletePermanently('workspaces', 'w1', {
        confirmName: 'x',
        expectedRevision: 1,
      }),
      (error: unknown) => error instanceof RequestError && error.code === code,
    );
  }
});

test('related items, linking and unlinking', async () => {
  const { client, sent } = recorder((url, init) =>
    init?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : Response.json(
          { sourceNote: null, linkedNotes: [], captureTasks: [], drafts: [] },
          { status: init?.method === 'POST' ? 201 : 200 },
        ),
  );
  await client.related('t1');
  await client.related('t1', true);
  await client.linkNote('t1', 'n1');
  await client.unlinkNote('t1', 'n1');
  assert.deepEqual(
    sent.map((s) => [s.method, s.url, s.body]),
    [
      ['GET', '/api/tasks/t1/related', undefined],
      ['GET', '/api/tasks/t1/related?includeArchived=1', undefined],
      ['POST', '/api/tasks/t1/links', { noteId: 'n1' }],
      ['DELETE', '/api/tasks/t1/links/n1', undefined],
    ],
  );
});
