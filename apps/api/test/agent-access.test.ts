import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { CreatedAgentToken } from '@ordo/core';
import { apiHarness, origin, signIn, type Harness } from './d1-harness.js';

// Agent access: personal access tokens, what they may do over REST, and the
// MCP server. Everything here is fictional; no real assistant connects.

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function setup(t: { after(fn: () => Promise<void>): void }) {
  const h = await apiHarness();
  t.after(() => h.app.close());
  const owner = await signIn(h);
  const session = (method: Method, url: string, payload?: object) =>
    h.app.inject({
      method,
      url,
      headers: {
        origin,
        cookie: owner.cookie,
        ...(method === 'POST' && url === '/v1/tasks'
          ? { 'idempotency-key': randomUUID() }
          : {}),
      },
      ...(payload ? { payload } : {}),
    });
  const ok = async (method: Method, url: string, payload?: object) => {
    const response = await session(method, url, payload);
    assert.ok(response.statusCode < 300, `${method} ${url}: ${response.body}`);
    return response.json();
  };
  const createToken = async (
    scopes: string[],
    name = 'Claude Code',
    cookie = owner.cookie,
  ) => {
    const response = await h.app.inject({
      method: 'POST',
      url: '/v1/settings/agent-tokens',
      headers: { origin, cookie },
      payload: { name, scopes },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json() as CreatedAgentToken;
  };
  /** A request with an access token, as a script or assistant would send it. */
  const agent = (
    token: string,
    method: Method,
    url: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    h.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}`, ...headers },
      ...(payload ? { payload } : {}),
    });
  let rpcId = 0;
  const mcp = async (
    token: string,
    method: string,
    params: object = {},
    headers: Record<string, string> = {},
  ) => {
    const response = await agent(
      token,
      'POST',
      '/v1/mcp',
      { jsonrpc: '2.0', id: ++rpcId, method, params },
      { accept: 'application/json, text/event-stream', ...headers },
    );
    return {
      status: response.statusCode,
      body: response.body ? response.json() : undefined,
    };
  };
  const call = async (token: string, name: string, args: object = {}) => {
    const { status, body } = await mcp(token, 'tools/call', {
      name,
      arguments: args,
    });
    assert.equal(status, 200, JSON.stringify(body));
    return body.result as {
      isError: boolean;
      structuredContent: any;
      content: { type: string; text: string }[];
    };
  };
  return { h, owner, session, ok, createToken, agent, mcp, call };
}

async function tokenRow(h: Harness, id: string) {
  return (await h.d1
    .prepare('SELECT * FROM agent_tokens WHERE id = ?')
    .bind(id)
    .first()) as Record<string, string | null>;
}

test('a token is shown once and stored only as a keyed hash', async (t) => {
  const { h, createToken, ok, session } = await setup(t);
  const { token, record } = await createToken(['read', 'write']);
  assert.match(token, /^ordo_pat_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(record.scopes, ['read', 'write']);
  assert.equal(record.lastUsedAt, null);
  const listed = await ok('GET', '/v1/settings/agent-tokens');
  assert.deepEqual(Object.keys(listed[0]).sort(), [
    'createdAt',
    'expiresAt',
    'id',
    'lastUsedAt',
    'name',
    'revokedAt',
    'scopes',
  ]);
  assert.ok(!JSON.stringify(listed).includes(token.slice(-43)));
  const row = await tokenRow(h, record.id);
  assert.match(row.secret_hash!, /^hmac-sha256:[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(row).includes(token.slice(-43)), 'no secret in D1');
  // Validation: names, scopes and expiry.
  for (const payload of [
    { name: '', scopes: ['read'] },
    { name: 'x', scopes: [] },
    { name: 'x', scopes: ['admin'] },
    { name: 'x', scopes: ['read'], expiresAt: '2001-01-01T00:00:00Z' },
  ])
    assert.equal(
      (await session('POST', '/v1/settings/agent-tokens', payload)).statusCode,
      400,
      JSON.stringify(payload),
    );
});

test('revoked, expired, unknown or altered tokens get 401; use is recorded at most once a minute', async (t) => {
  const { h, createToken, agent, session } = await setup(t);
  const { token, record } = await createToken(['read']);
  assert.equal((await agent(token, 'GET', '/v1/home')).statusCode, 200);
  const used = (await tokenRow(h, record.id)).last_used_at;
  assert.ok(used);
  await agent(token, 'GET', '/v1/home');
  assert.equal(
    (await tokenRow(h, record.id)).last_used_at,
    used,
    'not rewritten within a minute',
  );
  const altered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
  for (const bad of [
    altered,
    `ordo_pat_${randomUUID()}_${'A'.repeat(43)}`,
    'not-a-token',
    '',
  ])
    assert.equal((await agent(bad, 'GET', '/v1/home')).statusCode, 401, bad);
  const revoked = await session(
    'DELETE',
    `/v1/settings/agent-tokens/${record.id}`,
  );
  assert.ok(revoked.json().revokedAt);
  assert.equal((await agent(token, 'GET', '/v1/home')).statusCode, 401);
  // Expired: an expiry that has passed (written straight to D1).
  const second = await createToken(['read'], 'Expiring');
  await h.d1
    .prepare(
      "UPDATE agent_tokens SET expires_at = '2001-01-01T00:00:00.000Z' WHERE id = ?",
    )
    .bind(second.record.id)
    .run();
  assert.equal((await agent(second.token, 'GET', '/v1/home')).statusCode, 401);
});

test('a read token cannot write, and no token reaches settings, keys, sign-in or deletes', async (t) => {
  const { h, createToken, agent, ok } = await setup(t);
  const read = (await createToken(['read'])).token;
  const write = (await createToken(['write'], 'Writer')).token;
  const workspace = await ok('POST', '/v1/workspaces', { name: 'Fiction' });
  const project = await ok('POST', '/v1/projects', {
    name: 'Plan',
    workspaceId: workspace.id,
  });
  const task = await ok('POST', '/v1/tasks', { title: 'Existing' });
  const note = await ok('POST', '/v1/notes', { title: 'Existing note' });
  const refused = await agent(
    read,
    'POST',
    '/v1/tasks',
    { title: 'No' },
    { 'idempotency-key': 'k' },
  );
  assert.equal(refused.statusCode, 403);
  assert.equal(refused.json().error.code, 'INSUFFICIENT_SCOPE');
  assert.equal(
    (
      await agent(read, 'PATCH', `/v1/tasks/${task.id}`, {
        title: 'No',
        expectedRevision: 1,
      })
    ).statusCode,
    403,
  );
  for (const [method, url, payload] of [
    ['GET', '/v1/settings/agent-tokens'],
    [
      'POST',
      '/v1/settings/agent-tokens',
      { name: 'Another', scopes: ['write'] },
    ],
    ['GET', '/v1/settings/agent-activity'],
    ['GET', '/v1/settings/audio'],
    ['PATCH', '/v1/settings/ai', { textProvider: 'workers_ai' }],
    ['GET', '/v1/auth/me'],
    ['POST', '/v1/auth/logout'],
    ['POST', '/v1/auth/otp/request', { contact: 'agent@example.test' }],
    [
      'DELETE',
      `/v1/workspaces/${workspace.id}`,
      { confirmName: 'Fiction', expectedRevision: 1 },
    ],
    [
      'DELETE',
      `/v1/projects/${project.id}`,
      { confirmName: 'Plan', expectedRevision: 1 },
    ],
    [
      'PATCH',
      `/v1/workspaces/${workspace.id}`,
      { archived: true, expectedRevision: 1 },
    ],
    ['DELETE', `/v1/tasks/${task.id}/links/${note.id}`],
    ['POST', `/v1/notes/${note.id}/process`, { workspaceId: workspace.id }],
    ['POST', '/v1/demo'],
  ] as [Method, string, object?][]) {
    const response = await agent(write, method, url, payload);
    assert.equal(
      response.statusCode,
      403,
      `${method} ${url}: ${response.body}`,
    );
    assert.equal(
      response.json().error.code,
      'AGENT_NOT_ALLOWED',
      `${method} ${url}`,
    );
  }
  // Nothing was deleted or archived.
  assert.equal(
    (await ok('GET', `/v1/workspaces/${workspace.id}`)).archivedAt,
    null,
  );
  assert.equal((await ok('GET', '/v1/settings/agent-tokens')).length, 2);
  // An untrusted browser origin is refused even with a valid token.
  assert.equal(
    (
      await agent(read, 'GET', '/v1/home', undefined, {
        origin: 'https://evil.example',
      })
    ).statusCode,
    403,
  );
  assert.equal(h.delivery.messages.length, 1, 'no code was sent by a token');
});

test('tasks and notes a token creates are marked agent; idempotency and check-on-save still hold', async (t) => {
  const { createToken, agent, ok } = await setup(t);
  const { token, record } = await createToken(['read', 'write']);
  const key = randomUUID();
  const first = await agent(
    token,
    'POST',
    '/v1/tasks',
    { title: 'From an assistant' },
    { 'idempotency-key': key },
  );
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().origin, 'agent');
  assert.equal(first.json().createdByTokenId, record.id);
  const retry = await agent(
    token,
    'POST',
    '/v1/tasks',
    { title: 'From an assistant' },
    { 'idempotency-key': key },
  );
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().id, first.json().id);
  assert.equal(
    (await agent(token, 'POST', '/v1/tasks', { title: 'No key' })).statusCode,
    400,
    'the Idempotency-Key header is still required',
  );
  const stale = await agent(token, 'PATCH', `/v1/tasks/${first.json().id}`, {
    title: 'Edited',
    expectedRevision: 7,
  });
  assert.equal(stale.statusCode, 409);
  const note = (
    await agent(token, 'POST', '/v1/notes', { title: 'Agent note' })
  ).json();
  assert.equal(note.origin, 'agent');
  assert.equal(note.createdByTokenId, record.id);
  // A client cannot claim either field.
  assert.equal(
    (await agent(token, 'POST', '/v1/notes', { title: 'x', origin: 'manual' }))
      .statusCode,
    400,
  );
  // Made in the app: manual.
  assert.equal(
    (await ok('POST', '/v1/notes', { title: 'Mine' })).origin,
    'manual',
  );
  assert.equal(
    (await ok('POST', '/v1/tasks', { title: 'Mine' })).origin,
    'manual',
  );
});

test('the activity log records what kind of thing happened to which id, never content', async (t) => {
  const { createToken, agent, ok, call } = await setup(t);
  const a = await createToken(['read', 'write'], 'A');
  const b = await createToken(['read', 'write'], 'B');
  const task = (
    await agent(
      a.token,
      'POST',
      '/v1/tasks',
      { title: 'Secret plan title', description: 'Private words' },
      { 'idempotency-key': randomUUID() },
    )
  ).json();
  await agent(a.token, 'PATCH', `/v1/tasks/${task.id}`, {
    title: 'Secret renamed',
    expectedRevision: 1,
  });
  await agent(a.token, 'GET', `/v1/tasks/${task.id}`);
  await agent(a.token, 'DELETE', `/v1/tasks/${task.id}`, {
    expectedRevision: 2,
  });
  await call(b.token, 'create_note', {
    title: 'Private note',
    body: 'Private body',
  });
  const all = await ok('GET', '/v1/settings/agent-activity');
  assert.deepEqual(
    all.map((entry: { action: string }) => entry.action),
    [
      'mcp.create_note',
      'task.archive',
      'task.read',
      'task.update',
      'task.create',
    ],
  );
  const text = JSON.stringify(all);
  for (const word of ['Secret', 'Private', 'plan', 'words'])
    assert.ok(!text.includes(word), `no content: ${word}`);
  assert.deepEqual(Object.keys(all[0]).sort(), [
    'action',
    'createdAt',
    'entityId',
    'entityType',
    'id',
    'tokenId',
  ]);
  const forA = await ok(
    'GET',
    `/v1/settings/agent-activity?tokenId=${a.record.id}`,
  );
  assert.equal(forA.length, 4);
  assert.ok(
    forA.every((entry: { entityId: string }) => entry.entityId === task.id),
  );
  // Paging continues from a createdAt.
  const older = await ok(
    'GET',
    `/v1/settings/agent-activity?tokenId=${a.record.id}&before=${encodeURIComponent(forA[1].createdAt)}`,
  );
  assert.ok(older.length < forA.length);
});

test('MCP: handshake, discovery, versions and the transport rules', async (t) => {
  const { createToken, mcp, agent, h } = await setup(t);
  const read = (await createToken(['read'])).token;
  const write = (await createToken(['read', 'write'], 'Writer')).token;
  const init = await mcp(write, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.body.result.serverInfo.name, 'ordo');
  assert.ok(init.body.result.capabilities.tools);
  const future = await mcp(write, 'initialize', {
    protocolVersion: '2099-01-01',
  });
  assert.equal(future.body.result.protocolVersion, '2025-11-25');
  // A notification: 202, no body.
  const notification = await agent(write, 'POST', '/v1/mcp', {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  assert.equal(notification.statusCode, 202);
  assert.equal(notification.body, '');
  const discover = await mcp(write, 'server/discover', {
    _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
  });
  assert.ok(discover.body.result.supportedVersions.includes('2026-07-28'));
  assert.equal(discover.body.result.resultType, 'complete');
  assert.deepEqual((await mcp(write, 'ping')).body.result, {
    resultType: 'complete',
  });
  const unsupported = await mcp(
    write,
    'tools/list',
    {},
    { 'mcp-protocol-version': '1999-01-01' },
  );
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.body.error.code, -32022);
  assert.equal(unsupported.body.error.data.requested, '1999-01-01');
  const mismatch = await mcp(
    write,
    'tools/list',
    { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
    { 'mcp-protocol-version': '2025-11-25' },
  );
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.error.code, -32020);
  assert.equal(
    (await mcp(write, 'tools/list', {}, { 'mcp-method': 'tools/call' })).body
      .error.code,
    -32020,
  );
  const unknown = await mcp(write, 'resources/list');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, -32601);
  const batch = await agent(write, 'POST', '/v1/mcp', [
    { jsonrpc: '2.0', id: 1, method: 'ping' },
  ]);
  assert.equal(batch.statusCode, 400);
  assert.equal((await agent(write, 'GET', '/v1/mcp')).statusCode, 405);
  assert.equal((await agent(write, 'DELETE', '/v1/mcp')).statusCode, 405);
  // A read token sees only read tools.
  const readTools = (await mcp(read, 'tools/list')).body.result.tools.map(
    (tool: { name: string }) => tool.name,
  );
  assert.deepEqual(readTools.sort(), [
    'get_my_day',
    'get_note',
    'get_task',
    'list_projects',
    'list_tasks',
    'list_workspaces',
    'search',
  ]);
  const writeTools = (await mcp(write, 'tools/list')).body.result.tools;
  assert.equal(writeTools.length, 11);
  for (const tool of writeTools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description);
  }
  // No token, or a session cookie instead of one: 401.
  const anonymous = await h.app.inject({
    method: 'POST',
    url: '/v1/mcp',
    headers: { origin },
    payload: { jsonrpc: '2.0', id: 1, method: 'ping' },
  });
  assert.equal(anonymous.statusCode, 401);
  const viaCookie = await h.app.inject({
    method: 'POST',
    url: '/v1/mcp',
    headers: { origin, cookie: (await signIn(h)).cookie },
    payload: { jsonrpc: '2.0', id: 1, method: 'ping' },
  });
  assert.equal(viaCookie.statusCode, 401);
});

test('MCP tools: every tool works, checks its scope, and reports Ordo errors as tool errors', async (t) => {
  const { createToken, call, mcp, ok, h } = await setup(t);
  const write = (await createToken(['read', 'write'])).token;
  const read = (await createToken(['read'], 'Reader')).token;
  const workspace = await ok('POST', '/v1/workspaces', { name: 'DAMSYN' });
  const project = await ok('POST', '/v1/projects', {
    name: 'Website Relaunch',
    workspaceId: workspace.id,
    aliases: ['site relaunch'],
  });
  const archivedProject = await ok('POST', '/v1/projects', {
    name: 'Old',
    workspaceId: workspace.id,
  });
  await ok('PATCH', `/v1/projects/${archivedProject.id}`, {
    archived: true,
    expectedRevision: 1,
  });

  const workspaces = await call(read, 'list_workspaces');
  assert.deepEqual(workspaces.structuredContent.workspaces, [
    { id: workspace.id, name: 'DAMSYN' },
  ]);
  const projects = await call(read, 'list_projects', {
    workspaceId: workspace.id,
  });
  assert.deepEqual(
    projects.structuredContent.projects.map((p: { name: string }) => p.name),
    ['Website Relaunch'],
  );
  // Acceptance scenario 8: an authenticated assistant adds a task to a project.
  const key = randomUUID();
  const created = await call(write, 'create_task', {
    title: 'Book the relaunch review',
    workspaceId: workspace.id,
    projectId: project.id,
    dueDate: '2026-11-14',
    dueTime: '10:00',
    idempotencyKey: key,
  });
  assert.equal(created.isError, false, created.content[0].text);
  const task = created.structuredContent;
  assert.equal(task.projectId, project.id);
  assert.equal(task.origin, 'agent');
  assert.equal(task.created, true);
  assert.deepEqual(JSON.parse(created.content[0].text), task);
  const retried = await call(write, 'create_task', {
    title: 'Book the relaunch review',
    workspaceId: workspace.id,
    projectId: project.id,
    dueDate: '2026-11-14',
    dueTime: '10:00',
    idempotencyKey: key,
  });
  assert.equal(retried.structuredContent.id, task.id);
  assert.equal(retried.structuredContent.created, false);
  const home = await ok('GET', '/v1/home');
  assert.equal(
    home.tasks.find((x: { id: string }) => x.id === task.id).origin,
    'agent',
  );

  assert.equal(
    (await call(read, 'get_task', { id: task.id })).structuredContent.title,
    'Book the relaunch review',
  );
  const listed = await call(read, 'list_tasks', {
    projectId: project.id,
    dueAfter: '2026-11-01',
    dueBefore: '2026-11-30',
  });
  assert.deepEqual(
    listed.structuredContent.tasks.map((x: { id: string }) => x.id),
    [task.id],
  );
  assert.equal(
    listed.structuredContent.tasks[0].description,
    undefined,
    'compact',
  );
  assert.equal(
    (await call(read, 'list_tasks', { waiting: true })).structuredContent.total,
    0,
  );
  const updated = await call(write, 'update_task', {
    id: task.id,
    status: 'waiting',
    waitingOn: 'Yaw',
  });
  assert.equal(updated.structuredContent.status, 'waiting');
  assert.equal(
    (await call(read, 'list_tasks', { waiting: true })).structuredContent.total,
    1,
  );
  const stale = await call(write, 'update_task', {
    id: task.id,
    title: 'x',
    expectedRevision: 1,
  });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /^REVISION_CONFLICT: /);
  assert.equal(
    (await call(write, 'complete_task', { id: task.id })).structuredContent
      .status,
    'done',
  );
  const day = await call(read, 'get_my_day');
  assert.match(day.structuredContent.today, /^\d{4}-\d{2}-\d{2}$/);
  for (const list of ['overdue', 'dueToday', 'followUps', 'waiting'])
    assert.ok(Array.isArray(day.structuredContent[list]));

  const note = await call(write, 'create_note', {
    title: 'Relaunch call',
    body: 'Discussed the zebra stripes.',
    workspaceId: workspace.id,
    projectId: project.id,
    source: 'transcript',
  });
  assert.equal(note.structuredContent.origin, 'agent');
  assert.equal(
    (await call(read, 'get_note', { id: note.structuredContent.id }))
      .structuredContent.body,
    'Discussed the zebra stripes.',
  );
  const found = await call(read, 'search', { query: 'zebra' });
  assert.deepEqual(
    found.structuredContent.results.map((r: { id: string }) => r.id),
    [note.structuredContent.id],
  );

  // Failures: scope, validation, unknown ids, another owner's ids, unknown tool.
  const scope = await call(read, 'create_task', { title: 'No' });
  assert.equal(scope.isError, true);
  assert.match(scope.content[0].text, /^INSUFFICIENT_SCOPE: /);
  for (const [name, args] of [
    ['create_task', {}],
    ['create_task', { title: 'x', dueTime: '10:00' }],
    ['update_task', { id: 'nope' }],
    ['list_tasks', { limit: 500 }],
    ['search', { query: '' }],
    ['create_note', { title: 'x', body: 'y', unknownField: 1 }],
  ] as [string, object][]) {
    const result = await call(write, name, args);
    assert.equal(result.isError, true, `${name} ${JSON.stringify(args)}`);
    assert.match(
      result.content[0].text,
      /^INVALID_INPUT: /,
      result.content[0].text,
    );
  }
  const stranger = await signIn(h);
  const theirs = (
    await h.app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: {
        origin,
        cookie: stranger.cookie,
        'idempotency-key': randomUUID(),
      },
      payload: { title: 'Not yours' },
    })
  ).json();
  for (const [name, args] of [
    ['get_task', { id: theirs.id }],
    ['complete_task', { id: theirs.id }],
    ['update_task', { id: theirs.id, title: 'Mine now' }],
    ['get_note', { id: randomUUID() }],
    ['create_task', { title: 'x', workspaceId: randomUUID() }],
  ] as [string, object][]) {
    const result = await call(write, name, args);
    assert.equal(result.isError, true, name);
    assert.match(
      result.content[0].text,
      /^NOT_FOUND: /,
      `${name}: ${result.content[0].text}`,
    );
  }
  const unknownTool = await mcp(write, 'tools/call', {
    name: 'delete_everything',
    arguments: {},
  });
  assert.equal(unknownTool.body.error.code, -32602);
});

test('at most 20 active tokens', async (t) => {
  const { createToken, session } = await setup(t);
  const ids = [];
  for (let i = 0; i < 20; i++)
    ids.push((await createToken(['read'], `Key ${i}`)).record.id);
  const over = await session('POST', '/v1/settings/agent-tokens', {
    name: 'One more',
    scopes: ['read'],
  });
  assert.equal(over.statusCode, 409);
  assert.equal(over.json().error.code, 'TOKEN_LIMIT');
  await session('DELETE', `/v1/settings/agent-tokens/${ids[0]}`);
  assert.equal(
    (
      await session('POST', '/v1/settings/agent-tokens', {
        name: 'Now fits',
        scopes: ['read'],
      })
    ).statusCode,
    201,
  );
  assert.equal(
    (await session('DELETE', `/v1/settings/agent-tokens/${randomUUID()}`))
      .statusCode,
    404,
  );
});

test('use is recorded with the request: with its activity entry, or alone when nothing is logged', async (t) => {
  const { h, createToken, mcp, call, ok } = await setup(t);
  const a = await createToken(['read'], 'Handshake only');
  await mcp(a.token, 'initialize', { protocolVersion: '2025-06-18' });
  assert.ok(
    (await tokenRow(h, a.record.id)).last_used_at,
    'set by a handshake',
  );
  assert.deepEqual(
    await ok('GET', `/v1/settings/agent-activity?tokenId=${a.record.id}`),
    [],
  );
  const b = await createToken(['read', 'write'], 'Tool user');
  const failed = await call(b.token, 'get_task', { id: randomUUID() });
  assert.equal(failed.isError, true);
  assert.ok(
    (await tokenRow(h, b.record.id)).last_used_at,
    'set by a failed tool call',
  );
  assert.deepEqual(
    await ok('GET', `/v1/settings/agent-activity?tokenId=${b.record.id}`),
    [],
  );
});
