import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, RequestError } from '../src/index.ts';

function recorder(reply: (url: string, init?: RequestInit) => Response) {
  const sent: { url: string; method: string; body?: unknown }[] = [];
  const client = createClient('/api', async (url, init) => {
    sent.push({
      url: String(url),
      method: init?.method || 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return reply(String(url), init);
  });
  client.setAccount('owner');
  return { client, sent };
}
const record = {
  id: 'k1',
  name: 'Claude Code',
  scopes: ['read', 'write'],
  createdAt: '2026-10-30T09:00:00Z',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
};

test('creating a key returns it once with its record; listing never has secrets', async () => {
  const { client, sent } = recorder((url, init) =>
    init?.method === 'POST'
      ? Response.json(
          { token: 'ordo_pat_FAKE_FOR_TESTS', record },
          { status: 201 },
        )
      : Response.json([record]),
  );
  const created = await client.createAgentToken({
    name: 'Claude Code',
    scopes: ['read', 'write'],
    expiresAt: null,
  });
  assert.equal(created.token, 'ordo_pat_FAKE_FOR_TESTS');
  const list = await client.agentTokens();
  assert.ok(list.every((item) => !('token' in item)));
  assert.deepEqual(sent[0], {
    url: '/api/settings/agent-tokens',
    method: 'POST',
    body: { name: 'Claude Code', scopes: ['read', 'write'], expiresAt: null },
  });
});

test('revoking returns the record; the 20-key limit is a coded error', async () => {
  const { client, sent } = recorder((url, init) =>
    init?.method === 'DELETE'
      ? Response.json({ ...record, revokedAt: '2026-10-30T10:00:00Z' })
      : Response.json(
          { error: { code: 'TOKEN_LIMIT', message: 'Too many keys.' } },
          { status: 409 },
        ),
  );
  assert.ok((await client.revokeAgentToken('k1')).revokedAt);
  assert.equal(sent[0].url, '/api/settings/agent-tokens/k1');
  await assert.rejects(
    client.createAgentToken({ name: 'x', scopes: ['read'] }),
    (error: unknown) =>
      error instanceof RequestError && error.code === 'TOKEN_LIMIT',
  );
});

test('activity pages by key and by the last time seen', async () => {
  const { client, sent } = recorder(() => Response.json([]));
  await client.agentActivity();
  await client.agentActivity({
    tokenId: 'k1',
    before: '2026-10-30T09:00:00.000Z',
  });
  assert.deepEqual(
    sent.map((s) => s.url),
    [
      '/api/settings/agent-activity',
      '/api/settings/agent-activity?tokenId=k1&before=2026-10-30T09%3A00%3A00.000Z',
    ],
  );
});
