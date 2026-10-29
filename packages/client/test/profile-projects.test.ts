import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/index.ts';

test('setting your name is a guarded write; reading who you are is not', async () => {
  const sent: {
    url: string;
    method?: string;
    account: string | null;
    body?: unknown;
  }[] = [];
  let invalid = 0;
  const client = createClient(
    '/api',
    async (url, init) => {
      sent.push({
        url: String(url),
        method: init?.method,
        account: new Headers(init?.headers).get('X-Ordo-Account'),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (init?.method === 'PATCH')
        return Response.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } },
          { status: 401 },
        );
      return Response.json({ user: { id: 'owner', displayName: '' } });
    },
    () => invalid++,
  );
  client.setAccount('owner');
  await client.me();
  await assert.rejects(client.updateMe({ displayName: 'Ama Mensah' }));
  assert.deepEqual(sent, [
    { url: '/api/auth/me', method: undefined, account: null, body: undefined },
    {
      url: '/api/auth/me',
      method: 'PATCH',
      account: 'owner',
      body: { displayName: 'Ama Mensah' },
    },
  ]);
  assert.equal(invalid, 1);
});

test('clearing your name sends null', async () => {
  const client = createClient('/api', async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { displayName: null });
    return Response.json({ user: { id: 'owner', displayName: '' } });
  });
  client.setAccount('owner');
  assert.equal(
    (await client.updateMe({ displayName: null })).user.displayName,
    '',
  );
});

test('favouriting a project patches it with its revision', async () => {
  const client = createClient('/api', async (url, init) => {
    assert.equal(url, '/api/projects/p1');
    assert.equal(init?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      favorite: true,
      expectedRevision: 3,
    });
    return Response.json({ id: 'p1', favorite: true, revision: 4 });
  });
  client.setAccount('owner');
  const project = await client.updateProject('p1', {
    favorite: true,
    expectedRevision: 3,
  });
  assert.equal(project.revision, 4);
});
