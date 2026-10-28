import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { tasks, idempotencyKeys, workspaces, users } from '@ordo/db';
import { TasksRepository } from '../src/domains/tasks/tasks.repository.js';
import type { TestApp } from './http-harness.js';
import { apiHarness, origin, signIn, type Harness } from './d1-harness.js';

// Check-on-save: every rule is tested twice. Once deterministically at the
// statement level (a precondition changed between the read and the write),
// and once as real concurrent requests through the API.

function call(
  app: TestApp,
  cookie: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  key?: string,
) {
  return app.inject({
    method,
    url,
    headers: { origin, cookie, ...(key ? { 'idempotency-key': key } : {}) },
    ...(payload ? { payload } : {}),
  });
}
async function setup(t: { after(fn: () => Promise<void>): void }) {
  const h = await apiHarness();
  t.after(() => h.app.close());
  const owner = await signIn(h);
  const create = async (input: object) => {
    const response = await call(
      h.app,
      owner.cookie,
      'POST',
      '/v1/tasks',
      input,
      randomUUID(),
    );
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  };
  return {
    h,
    owner,
    create,
    repository: new TasksRepository(h.database),
    rows: (h: Harness) => h.db.select().from(tasks),
  };
}

test('two writers on one record: exactly one save wins, the other gets REVISION_CONFLICT', async (t) => {
  const { h, owner, create, repository } = await setup(t);
  const task = await create({ title: 'Shared record' });
  const results = await Promise.all(
    ['First writer', 'Second writer', 'Third writer'].map((title) =>
      call(h.app, owner.cookie, 'PATCH', `/v1/tasks/${task.id}`, {
        title,
        expectedRevision: 1,
      }),
    ),
  );
  const codes = results.map((r) => r.statusCode).sort();
  assert.deepEqual(codes, [200, 409, 409]);
  for (const loser of results.filter((r) => r.statusCode === 409))
    assert.equal(loser.json().error.code, 'REVISION_CONFLICT');
  const [row] = await h.db.select().from(tasks).where(eq(tasks.id, task.id));
  assert.equal(row.revision, 2);
  assert.equal(
    row.title,
    results.find((r) => r.statusCode === 200)!.json().title,
  );
  // Statement level: a stale revision writes nothing.
  assert.equal(
    await repository.updateGuarded(
      owner.user.id,
      task.id,
      { title: 'Stale' },
      { revision: 1 },
    ),
    undefined,
  );
  // Workspaces, projects and notes follow the same rule.
  const workspace = (
    await call(h.app, owner.cookie, 'POST', '/v1/workspaces', { name: 'W' })
  ).json();
  const note = (
    await call(h.app, owner.cookie, 'POST', '/v1/notes', { title: 'N' })
  ).json();
  for (const url of [
    `/v1/workspaces/${workspace.id}`,
    `/v1/notes/${note.id}`,
  ]) {
    const both = await Promise.all(
      ['A', 'B'].map((name) =>
        call(h.app, owner.cookie, 'PATCH', url, {
          ...(url.includes('notes') ? { title: name } : { name }),
          expectedRevision: 1,
        }),
      ),
    );
    assert.deepEqual(both.map((r) => r.statusCode).sort(), [200, 409], url);
  }
});

test('a retried create returns the original; concurrent retries make one task and one key', async (t) => {
  const { h, owner } = await setup(t);
  const key = randomUUID();
  const payload = { title: 'Captured once' };
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      call(h.app, owner.cookie, 'POST', '/v1/tasks', payload, key),
    ),
  );
  const codes = results.map((r) => r.statusCode).sort();
  assert.equal(codes.filter((code) => code === 201).length, 1, `${codes}`);
  assert.ok(codes.every((code) => code === 200 || code === 201));
  assert.equal(new Set(results.map((r) => r.json().id)).size, 1);
  assert.equal((await h.db.select().from(tasks)).length, 1);
  assert.equal((await h.db.select().from(idempotencyKeys)).length, 1);
  // Same key, different payload: refused, nothing new written.
  const changed = await call(
    h.app,
    owner.cookie,
    'POST',
    '/v1/tasks',
    { title: 'Something else' },
    key,
  );
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.json().error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await h.db.select().from(tasks)).length, 1);
});

test('a batch that fails rolls back: a duplicate key leaves no orphan task', async (t) => {
  const { h, owner, repository } = await setup(t);
  const key = { id: randomUUID(), key: 'retry-key', fingerprint: 'f' };
  const first = await repository.insertWithKey(
    { id: randomUUID(), ownerUserId: owner.user.id, title: 'First' },
    key,
  );
  assert.ok(first);
  const secondId = randomUUID();
  await assert.rejects(
    () =>
      repository.insertWithKey(
        { id: secondId, ownerUserId: owner.user.id, title: 'Second' },
        { ...key, id: randomUUID() },
      ),
    /UNIQUE/,
  );
  assert.equal(
    (await h.db.select().from(tasks).where(eq(tasks.id, secondId))).length,
    0,
    'the task insert in the failed batch rolled back',
  );
  assert.equal((await h.db.select().from(idempotencyKeys)).length, 1);
});

test('hierarchy moves are conditional on every ancestor revision, so crossing moves cannot make a cycle', async (t) => {
  const { h, owner, create, repository } = await setup(t);
  const a = await create({ title: 'A' });
  const b = await create({ title: 'B' });
  const results = await Promise.all([
    call(h.app, owner.cookie, 'PATCH', `/v1/tasks/${a.id}`, {
      parentId: b.id,
      expectedRevision: 1,
    }),
    call(h.app, owner.cookie, 'PATCH', `/v1/tasks/${b.id}`, {
      parentId: a.id,
      expectedRevision: 1,
    }),
  ]);
  const codes = results.map((r) => r.statusCode).sort();
  assert.equal(codes.filter((code) => code === 200).length, 1, `${codes}`);
  const rows = await h.db.select().from(tasks);
  const parent = new Map(rows.map((row) => [row.id, row.parentId]));
  assert.ok(
    !(parent.get(a.id) === b.id && parent.get(b.id) === a.id),
    'no cycle was saved',
  );
  // Statement level: an ancestor that changed after it was read blocks the
  // save even though the task's own revision is current.
  const root = await create({ title: 'Root' });
  const middle = await create({ title: 'Middle', parentId: root.id });
  const leaf = await create({ title: 'Leaf' });
  const chain = [
    { id: middle.id, revision: 1 },
    { id: root.id, revision: 1 },
  ];
  await call(h.app, owner.cookie, 'PATCH', `/v1/tasks/${root.id}`, {
    title: 'Root renamed elsewhere',
    expectedRevision: 1,
  });
  assert.equal(
    await repository.updateGuarded(
      owner.user.id,
      leaf.id,
      { parentId: middle.id },
      { revision: 1, ancestors: chain },
    ),
    undefined,
  );
  const saved = await repository.updateGuarded(
    owner.user.id,
    leaf.id,
    { parentId: middle.id },
    {
      revision: 1,
      ancestors: [chain[0], { id: root.id, revision: 2 }],
    },
  );
  assert.equal(saved?.parentId, middle.id);
  assert.equal(saved?.revision, 2);
});

test('archive and move refuse while an active child exists; a subtask insert needs a live, unchanged parent', async (t) => {
  const { h, owner, create, repository } = await setup(t);
  // Concurrent: archive the parent while a subtask is being created.
  for (let round = 0; round < 3; round++) {
    const parent = await create({ title: `Parent ${round}` });
    const [archived, child] = await Promise.all([
      call(h.app, owner.cookie, 'DELETE', `/v1/tasks/${parent.id}`, {
        expectedRevision: 1,
      }),
      call(
        h.app,
        owner.cookie,
        'POST',
        '/v1/tasks',
        { title: 'Child', parentId: parent.id },
        randomUUID(),
      ),
    ]);
    const [parentRow] = await h.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, parent.id));
    const children = (await h.db.select().from(tasks)).filter(
      (row) => row.parentId === parent.id && !row.deletedAt,
    );
    assert.ok(
      !(parentRow.deletedAt && children.length),
      'an archived parent never keeps an active child',
    );
    assert.ok(
      archived.statusCode === 200 || child.statusCode === 201,
      'one of the two saves wins',
    );
  }
  // Statement level: the NOT EXISTS guard and the conditional subtask insert.
  const parent = await create({ title: 'Guarded parent' });
  await create({ title: 'Active child', parentId: parent.id });
  assert.equal(
    await repository.updateGuarded(
      owner.user.id,
      parent.id,
      { deletedAt: new Date().toISOString() },
      { revision: 1, noActiveChildren: true },
    ),
    undefined,
  );
  const workspace = (
    await call(h.app, owner.cookie, 'POST', '/v1/workspaces', { name: 'Away' })
  ).json();
  const moved = await call(
    h.app,
    owner.cookie,
    'PATCH',
    `/v1/tasks/${parent.id}`,
    { workspaceId: workspace.id, expectedRevision: 1 },
  );
  assert.equal(moved.statusCode, 409);
  assert.equal(moved.json().error.code, 'HAS_SUBTASKS');
  const keyCount = (await h.db.select().from(idempotencyKeys)).length;
  assert.equal(
    await repository.insertWithKey(
      { id: randomUUID(), ownerUserId: owner.user.id, title: 'Late child' },
      { id: randomUUID(), key: randomUUID(), fingerprint: 'f' },
      { id: parent.id, revision: 99 },
    ),
    undefined,
    'a parent that changed since it was read refuses the subtask',
  );
  assert.equal(
    (await h.db.select().from(idempotencyKeys)).length,
    keyCount,
    'no key row without its task',
  );
});

test('demo fixtures: concurrent requests load exactly one set', async (t) => {
  const { h, owner } = await setup(t);
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      call(h.app, owner.cookie, 'POST', '/v1/demo'),
    ),
  );
  assert.ok(results.every((r) => r.statusCode === 200));
  assert.equal((await h.db.select().from(workspaces)).length, 4);
  assert.equal((await h.db.select().from(tasks)).length, 7);
  const [user] = await h.db
    .select()
    .from(users)
    .where(eq(users.id, owner.user.id));
  assert.equal(user.demoLoaded, true);
  assert.ok(user.demoClaim);
});
