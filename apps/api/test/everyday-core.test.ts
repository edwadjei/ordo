import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { tasks } from '@ordo/db';
import { TasksRepository } from '../src/domains/tasks/tasks.repository.js';
import { apiHarness, origin, signIn, type Harness } from './d1-harness.js';

// Finishing the everyday core: setting your name, project favourites, note
// sources, and moving a task with its subtasks.

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function setup(t: { after(fn: () => Promise<void>): void }) {
  const h = await apiHarness();
  t.after(() => h.app.close());
  const owner = await signIn(h);
  const call = (method: Method, url: string, payload?: object) =>
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
    const response = await call(method, url, payload);
    assert.ok(response.statusCode < 300, `${url}: ${response.body}`);
    return response.json();
  };
  return { h, owner, call, ok };
}

async function rows(h: Harness) {
  return new Map((await h.db.select().from(tasks)).map((row) => [row.id, row]));
}

test('set, trim and clear your name; phone- or email-like names are refused', async (t) => {
  const { h, owner, call, ok } = await setup(t);
  const set = await ok('PATCH', '/v1/auth/me', { displayName: '  Ama  ' });
  assert.equal(set.user.displayName, 'Ama');
  assert.deepEqual(
    set,
    await ok('GET', '/v1/auth/me'),
    'the same body as GET /v1/auth/me',
  );
  assert.equal((await ok('GET', '/v1/home')).user.displayName, 'Ama');
  for (const displayName of ['0558601966', '+233 55 860 1966', 'a@b.test']) {
    const refused = await call('PATCH', '/v1/auth/me', { displayName });
    assert.equal(refused.statusCode, 400, displayName);
    assert.equal(refused.json().error.code, 'INVALID_INPUT');
    assert.equal(
      refused.json().error.message,
      'Use your name, not a phone number or email address.',
    );
  }
  for (const payload of [
    { displayName: 'x'.repeat(81) },
    {},
    { displayName: 'Ama', email: 'other@example.test' },
  ])
    assert.equal((await call('PATCH', '/v1/auth/me', payload)).statusCode, 400);
  assert.equal((await ok('GET', '/v1/auth/me')).user.displayName, 'Ama');
  for (const displayName of [null, '', '   ']) {
    await ok('PATCH', '/v1/auth/me', { displayName: 'Ama' });
    const cleared = await ok('PATCH', '/v1/auth/me', { displayName });
    assert.equal(cleared.user.displayName, '', String(displayName));
  }
  // Signed-in and same-origin only.
  const anonymous = await h.app.inject({
    method: 'PATCH',
    url: '/v1/auth/me',
    headers: { origin },
    payload: { displayName: 'Intruder' },
  });
  assert.equal(anonymous.statusCode, 401);
  const crossSite = await h.app.inject({
    method: 'PATCH',
    url: '/v1/auth/me',
    headers: { origin: 'https://elsewhere.example.test', cookie: owner.cookie },
    payload: { displayName: 'Intruder' },
  });
  assert.equal(crossSite.statusCode, 403);
  assert.equal((await ok('GET', '/v1/auth/me')).user.displayName, '');
});

test('project favourites: default off, set on create and PATCH, returned everywhere', async (t) => {
  const { call, ok } = await setup(t);
  const workspace = await ok('POST', '/v1/workspaces', { name: 'Fiction' });
  const plain = await ok('POST', '/v1/projects', {
    name: 'Plain',
    workspaceId: workspace.id,
  });
  assert.equal(plain.favorite, false);
  const starred = await ok('POST', `/v1/workspaces/${workspace.id}/projects`, {
    name: 'Starred',
    favorite: true,
  });
  assert.equal(starred.favorite, true);
  const toggled = await ok('PATCH', `/v1/projects/${plain.id}`, {
    favorite: true,
    expectedRevision: 1,
  });
  assert.equal(toggled.favorite, true);
  assert.equal(toggled.revision, 2);
  assert.equal(toggled.name, 'Plain', 'other fields are unchanged');
  const stale = await call('PATCH', `/v1/projects/${plain.id}`, {
    favorite: false,
    expectedRevision: 1,
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, 'REVISION_CONFLICT');
  assert.equal(
    (
      await call('PATCH', `/v1/projects/${plain.id}`, {
        favorite: 'yes',
        expectedRevision: 2,
      })
    ).statusCode,
    400,
  );
  const favourites = (projects: { id: string; favorite: boolean }[]) =>
    Object.fromEntries(projects.map((p) => [p.id, p.favorite]));
  const expected = { [plain.id]: true, [starred.id]: true };
  assert.deepEqual(
    favourites(await ok('GET', `/v1/workspaces/${workspace.id}/projects`)),
    expected,
  );
  assert.deepEqual(
    favourites((await ok('GET', '/v1/home')).projects),
    expected,
  );
  assert.equal((await ok('GET', `/v1/projects/${plain.id}`)).favorite, true);
  const unstarred = await ok('PATCH', `/v1/projects/${plain.id}`, {
    favorite: false,
    expectedRevision: 2,
  });
  assert.equal(unstarred.favorite, false);
});

test('note source: manual by default, set on create only, Markdown body kept as text', async (t) => {
  const { call, ok } = await setup(t);
  const manual = await ok('POST', '/v1/notes', { title: 'Typed' });
  assert.equal(manual.source, 'manual');
  for (const source of ['recording', 'email', 'transcript'])
    assert.equal(
      (await ok('POST', '/v1/notes', { title: source, source })).source,
      source,
    );
  assert.equal(
    (await call('POST', '/v1/notes', { title: 'Bad', source: 'fax' }))
      .statusCode,
    400,
  );
  const changed = await call('PATCH', `/v1/notes/${manual.id}`, {
    source: 'email',
    expectedRevision: 1,
  });
  assert.equal(changed.statusCode, 400, 'source cannot change after create');
  const body =
    '# Plan\n\n- [ ] Call **Kwame** about <b>budget</b>\n1. [Brief](https://example.test)';
  const edited = await ok('PATCH', `/v1/notes/${manual.id}`, {
    body,
    expectedRevision: 1,
  });
  assert.equal(edited.body, body, 'stored exactly as sent');
  assert.equal(edited.source, 'manual');
  assert.equal(
    (await ok('GET', '/v1/home')).notes.find(
      (note: { id: string }) => note.id === manual.id,
    ).source,
    'manual',
  );
  const found = await ok('GET', '/v1/search?q=Kwame');
  assert.deepEqual(
    found.results.map((hit: { id: string }) => hit.id),
    [manual.id],
    'search indexes the raw Markdown text',
  );
});

test('moving a task carries its subtasks across projects and workspaces', async (t) => {
  const { h, call, ok } = await setup(t);
  const home = await ok('POST', '/v1/workspaces', { name: 'Home' });
  const work = await ok('POST', '/v1/workspaces', { name: 'Work' });
  const first = await ok('POST', '/v1/projects', {
    name: 'First',
    workspaceId: home.id,
  });
  const second = await ok('POST', '/v1/projects', {
    name: 'Second',
    workspaceId: home.id,
  });
  const away = await ok('POST', '/v1/projects', {
    name: 'Away',
    workspaceId: work.id,
  });
  const scope = { workspaceId: home.id, projectId: first.id };
  const parent = await ok('POST', '/v1/tasks', { title: 'Parent', ...scope });
  const child = await ok('POST', '/v1/tasks', {
    title: 'Child',
    parentId: parent.id,
    ...scope,
  });
  const grandchild = await ok('POST', '/v1/tasks', {
    title: 'Grandchild',
    parentId: child.id,
    ...scope,
  });
  const archived = await ok('POST', '/v1/tasks', {
    title: 'Archived child',
    parentId: parent.id,
    ...scope,
  });
  await ok('DELETE', `/v1/tasks/${archived.id}`, { expectedRevision: 1 });
  const bystander = await ok('POST', '/v1/tasks', {
    title: 'Not a subtask',
    ...scope,
  });
  const subtree = [child.id, grandchild.id, archived.id];
  const expectScope = async (
    workspaceId: string | null,
    projectId: string | null,
  ) => {
    const saved = await rows(h);
    for (const id of [parent.id, ...subtree]) {
      assert.equal(saved.get(id)!.workspaceId, workspaceId, id);
      assert.equal(saved.get(id)!.projectId, projectId, id);
    }
    assert.equal(saved.get(bystander.id)!.projectId, first.id);
    assert.equal(saved.get(bystander.id)!.revision, 1);
    return saved;
  };

  // Another project in the same workspace.
  const moved = await ok('PATCH', `/v1/tasks/${parent.id}`, {
    projectId: second.id,
    expectedRevision: 1,
  });
  assert.equal(moved.projectId, second.id);
  assert.equal(moved.revision, 2);
  let saved = await expectScope(home.id, second.id);
  assert.equal(saved.get(child.id)!.revision, 2);
  assert.equal(saved.get(child.id)!.updatedAt, moved.updatedAt);

  // Another workspace's project, then the Inbox (no workspace or project).
  await ok('PATCH', `/v1/tasks/${parent.id}`, {
    workspaceId: work.id,
    projectId: away.id,
    expectedRevision: 2,
  });
  await expectScope(work.id, away.id);
  await ok('PATCH', `/v1/tasks/${parent.id}`, {
    workspaceId: null,
    projectId: null,
    expectedRevision: 3,
  });
  saved = await expectScope(null, null);
  assert.equal(saved.get(grandchild.id)!.revision, 4);
  assert.equal(saved.get(grandchild.id)!.parentId, child.id, 'hierarchy kept');

  // A project from another workspace is refused and nothing moves.
  const mismatch = await call('PATCH', `/v1/tasks/${parent.id}`, {
    workspaceId: home.id,
    projectId: away.id,
    expectedRevision: 4,
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(mismatch.json().error.code, 'SCOPE_MISMATCH');
  // A stale revision is refused and nothing moves.
  const stale = await call('PATCH', `/v1/tasks/${parent.id}`, {
    workspaceId: home.id,
    expectedRevision: 3,
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, 'REVISION_CONFLICT');
  await expectScope(null, null);
  // A subtask edit read before the move is now stale.
  const staleChild = await call('PATCH', `/v1/tasks/${child.id}`, {
    title: 'Edited before the move',
    expectedRevision: 1,
  });
  assert.equal(staleChild.statusCode, 409);
  // A subtask alone cannot leave its parent's destination.
  const alone = await call('PATCH', `/v1/tasks/${child.id}`, {
    workspaceId: home.id,
    expectedRevision: 4,
  });
  assert.equal(alone.statusCode, 400);
  assert.equal(alone.json().error.code, 'SCOPE_MISMATCH');
  // Another account's project does not exist for this owner.
  const stranger = await signIn(h);
  const theirs = (
    await h.app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: { origin, cookie: stranger.cookie },
      payload: { name: 'Theirs' },
    })
  ).json();
  const foreign = await call('PATCH', `/v1/tasks/${parent.id}`, {
    workspaceId: theirs.id,
    expectedRevision: 4,
  });
  assert.equal(foreign.statusCode, 404);
  await expectScope(null, null);
});

test('a move is check-on-save: a refused move writes no subtask, and a racing subtask create lands in the parent’s destination', async (t) => {
  const { h, owner, call, ok } = await setup(t);
  const workspace = await ok('POST', '/v1/workspaces', { name: 'Elsewhere' });
  const repository = new TasksRepository(h.database);
  // Statement level: a stale revision refuses the task and its subtasks.
  const parent = await ok('POST', '/v1/tasks', { title: 'Parent' });
  const child = await ok('POST', '/v1/tasks', {
    title: 'Child',
    parentId: parent.id,
  });
  assert.equal(
    await repository.moveGuarded(
      owner.user.id,
      parent.id,
      { workspaceId: workspace.id, updatedAt: new Date().toISOString() },
      { revision: 7 },
    ),
    undefined,
  );
  const unchanged = await rows(h);
  assert.equal(unchanged.get(parent.id)!.workspaceId, null);
  assert.equal(unchanged.get(child.id)!.workspaceId, null);
  assert.equal(unchanged.get(child.id)!.revision, 1);
  // Concurrent: move the parent while a subtask is being created under it.
  for (let round = 0; round < 3; round++) {
    const racing = await ok('POST', '/v1/tasks', { title: `Racing ${round}` });
    const [move, create] = await Promise.all([
      call('PATCH', `/v1/tasks/${racing.id}`, {
        workspaceId: workspace.id,
        expectedRevision: 1,
      }),
      call('POST', '/v1/tasks', { title: 'Late child', parentId: racing.id }),
    ]);
    assert.equal(move.statusCode, 200, move.body);
    const saved = await rows(h);
    const children = [...saved.values()].filter(
      (row) => row.parentId === racing.id,
    );
    for (const row of children)
      assert.equal(
        row.workspaceId,
        saved.get(racing.id)!.workspaceId,
        'a subtask always shares its parent’s destination',
      );
    assert.equal(children.length, create.statusCode === 201 ? 1 : 0);
  }
  // Two concurrent moves of one task: exactly one wins.
  const contested = await ok('POST', '/v1/tasks', { title: 'Contested' });
  await ok('POST', '/v1/tasks', { title: 'Sub', parentId: contested.id });
  const other = await ok('POST', '/v1/workspaces', { name: 'Other' });
  const results = await Promise.all(
    [workspace.id, other.id].map((workspaceId) =>
      call('PATCH', `/v1/tasks/${contested.id}`, {
        workspaceId,
        expectedRevision: 1,
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  const [winner] = await h.db
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, contested.id));
  assert.equal(
    winner.workspaceId,
    results.find((r) => r.statusCode === 200)!.json().workspaceId,
  );
});
