import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, users, sessions } from '@ordo/db';
import { buildApp } from '../src/app.js';
import type { FastifyInstance, HTTPMethods } from 'fastify';
const origin = 'http://localhost:3318';
const password = 'Fictional-Test-Passphrase-42';
async function harness() {
  const connection = await openDatabase();
  const app = await buildApp({ connection });
  await app.ready();
  return { app, db: connection.db };
}
async function account(app: FastifyInstance) {
  const email = `${randomUUID()}@example.invalid`;
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin },
    payload: { email, password, displayName: 'Fictional Tester' },
  });
  assert.equal(response.statusCode, 201, response.body);
  return {
    cookie: response.headers['set-cookie']!.toString().split(';')[0],
    email,
    user: response.json().user,
  };
}
async function call(
  app: FastifyInstance,
  cookie: string,
  method: HTTPMethods,
  url: string,
  payload?: unknown,
  key?: string,
) {
  return app.inject({
    method,
    url,
    headers: { origin, cookie, ...(key ? { 'idempotency-key': key } : {}) },
    ...(payload ? { payload: payload as object } : {}),
  });
}
async function createTask(app: FastifyInstance, cookie: string, input: object) {
  const result = await call(
    app,
    cookie,
    'POST',
    '/v1/tasks',
    input,
    randomUUID(),
  );
  assert.equal(result.statusCode, 201, result.body);
  return result.json();
}

test('account/session credentials, CSRF rejection, sign-in and revoked sign-out', async (t) => {
  const { app, db } = await harness();
  t.after(() => app.close());
  assert.equal((await app.inject('/v1/home')).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'bad@example.invalid', password, displayName: 'Bad' },
      })
    ).statusCode,
    403,
  );
  const user = await account(app);
  const cookie = user.cookie;
  assert.match(cookie, /^ordo_session=[a-f0-9]{64}$/);
  const [stored] = await db.select().from(users);
  const [session] = await db.select().from(sessions);
  assert.notEqual(stored.passwordHash, password);
  assert.match(stored.passwordHash, /^scrypt:/);
  assert.ok(!cookie.includes(session.tokenHash));
  assert.equal(
    (await call(app, cookie, 'GET', '/v1/auth/me')).json().user.id,
    user.user.id,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: { cookie, origin: 'https://untrusted.invalid' },
        payload: { name: 'Injected' },
      })
    ).statusCode,
    403,
  );
  const wrong = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { origin },
    payload: { email: user.email, password: 'Wrong-password-42' },
  });
  assert.equal(wrong.statusCode, 401);
  const logout = await call(app, cookie, 'POST', '/v1/auth/logout');
  assert.equal(logout.statusCode, 200);
  assert.equal((await call(app, cookie, 'GET', '/v1/home')).statusCode, 401);
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { origin },
    payload: { email: user.email, password },
  });
  assert.equal(login.statusCode, 200);
  assert.ok(!login.body.includes('passwordHash'));
});

test('task retries are idempotent, conflicting retries fail, edits use revision guards', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());
  const { cookie } = await account(app);
  const key = randomUUID();
  const payload = { title: 'A durable Inbox thought' };
  const first = await call(app, cookie, 'POST', '/v1/tasks', payload, key);
  assert.equal(first.statusCode, 201);
  const retry = await call(app, cookie, 'POST', '/v1/tasks', payload, key);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().id, first.json().id);
  assert.equal(
    (
      await call(
        app,
        cookie,
        'POST',
        '/v1/tasks',
        { title: 'Different content' },
        key,
      )
    ).statusCode,
    409,
  );
  const task = first.json();
  assert.equal(task.workspaceId, null);
  const changed = await call(app, cookie, 'PATCH', `/v1/tasks/${task.id}`, {
    status: 'done',
    expectedRevision: task.revision,
  });
  assert.equal(changed.statusCode, 200);
  assert.ok(changed.json().completedAt);
  assert.equal(changed.json().revision, 2);
  assert.equal(
    (
      await call(app, cookie, 'PATCH', `/v1/tasks/${task.id}`, {
        title: 'Stale edit',
        expectedRevision: 1,
      })
    ).statusCode,
    409,
  );
  const snapshot = (await call(app, cookie, 'GET', '/v1/home')).json();
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].title, payload.title);
  assert.equal(
    (
      await call(
        app,
        cookie,
        'POST',
        '/v1/tasks',
        { title: 'Not a calendar date', dueDate: '2026-02-30' },
        randomUUID(),
      )
    ).statusCode,
    400,
  );
});

test('owner and workspace/project isolation hold for reads, writes, home and notes', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());
  const alice = await account(app);
  const bob = await account(app);
  const workspace = (
    await call(app, alice.cookie, 'POST', '/v1/workspaces', {
      name: 'Private context',
    })
  ).json();
  const workspace2 = (
    await call(app, alice.cookie, 'POST', '/v1/workspaces', {
      name: 'Other context',
    })
  ).json();
  const project = (
    await call(app, alice.cookie, 'POST', '/v1/projects', {
      name: 'Private project',
      workspaceId: workspace.id,
    })
  ).json();
  const task = await createTask(app, alice.cookie, {
    title: 'Private task',
    workspaceId: workspace.id,
    projectId: project.id,
  });
  assert.equal(
    (await call(app, bob.cookie, 'GET', `/v1/tasks/${task.id}`)).statusCode,
    404,
  );
  assert.equal(
    (
      await call(app, bob.cookie, 'PATCH', `/v1/tasks/${task.id}`, {
        title: 'Forged edit',
        expectedRevision: 1,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await call(
        app,
        bob.cookie,
        'POST',
        '/v1/tasks',
        { title: 'Forged scope', workspaceId: workspace.id },
        randomUUID(),
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await call(
        app,
        alice.cookie,
        'POST',
        '/v1/tasks',
        {
          title: 'Mismatched project',
          workspaceId: workspace2.id,
          projectId: project.id,
        },
        randomUUID(),
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call(app, bob.cookie, 'POST', '/v1/notes', {
        title: 'Forged note',
        workspaceId: workspace.id,
      })
    ).statusCode,
    404,
  );
  const note = await call(app, alice.cookie, 'POST', '/v1/notes', {
    title: 'Private note',
    body: 'Preserve this content',
    workspaceId: workspace.id,
    projectId: project.id,
  });
  assert.equal(note.statusCode, 201);
  assert.equal(
    (await call(app, bob.cookie, 'GET', `/v1/notes/${note.json().id}`))
      .statusCode,
    404,
  );
  const updated = await call(
    app,
    alice.cookie,
    'PATCH',
    `/v1/notes/${note.json().id}`,
    { body: 'Edited content', expectedRevision: 1 },
  );
  assert.equal(updated.statusCode, 200);
  assert.equal(
    (
      await call(app, alice.cookie, 'PATCH', `/v1/notes/${note.json().id}`, {
        body: 'Stale content',
        expectedRevision: 1,
      })
    ).statusCode,
    409,
  );
  const snapshot = (await call(app, bob.cookie, 'GET', '/v1/home')).json();
  assert.deepEqual(snapshot.workspaces, []);
  assert.deepEqual(snapshot.projects, []);
  assert.deepEqual(snapshot.tasks, []);
  assert.deepEqual(snapshot.notes, []);
  assert.equal(
    (
      await call(
        app,
        alice.cookie,
        'POST',
        '/v1/tasks',
        { title: 'Owner injection', ownerUserId: bob.user.id },
        randomUUID(),
      )
    ).statusCode,
    400,
  );
});

test('nested task cycles, scope changes, parent archive and independent completion', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());
  const { cookie } = await account(app);
  const parent = await createTask(app, cookie, { title: 'Parent' });
  const child = await createTask(app, cookie, {
    title: 'Child',
    parentId: parent.id,
  });
  const leaf = await createTask(app, cookie, {
    title: 'Leaf',
    parentId: child.id,
  });
  assert.equal(
    (
      await call(app, cookie, 'PATCH', `/v1/tasks/${parent.id}`, {
        parentId: leaf.id,
        expectedRevision: 1,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call(app, cookie, 'PATCH', `/v1/tasks/${parent.id}`, {
        parentId: parent.id,
        expectedRevision: 1,
      })
    ).statusCode,
    400,
  );
  const workspace = (
    await call(app, cookie, 'POST', '/v1/workspaces', {
      name: 'Separate scope',
    })
  ).json();
  assert.equal(
    (
      await call(
        app,
        cookie,
        'POST',
        '/v1/tasks',
        {
          title: 'Wrong child',
          parentId: parent.id,
          workspaceId: workspace.id,
        },
        randomUUID(),
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call(app, cookie, 'PATCH', `/v1/tasks/${parent.id}`, {
        workspaceId: workspace.id,
        expectedRevision: 1,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await call(app, cookie, 'DELETE', `/v1/tasks/${parent.id}`, {
        expectedRevision: 1,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await call(app, cookie, 'PATCH', `/v1/tasks/${parent.id}`, {
        status: 'done',
        expectedRevision: 1,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await call(app, cookie, 'GET', `/v1/tasks/${child.id}`)).json().status,
    'todo',
  );
  const archived = await call(app, cookie, 'DELETE', `/v1/tasks/${leaf.id}`, {
    expectedRevision: 1,
  });
  assert.equal(archived.statusCode, 200);
  assert.ok(archived.json().deletedAt);
  assert.equal(
    (await call(app, cookie, 'GET', `/v1/tasks/${leaf.id}`)).statusCode,
    404,
  );
});

test('fictional fixtures load only explicitly, once, and only for the signed-in owner', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());
  const alice = await account(app);
  const bob = await account(app);
  assert.equal(
    (await call(app, alice.cookie, 'GET', '/v1/home')).json().workspaces.length,
    0,
  );
  const first = await call(app, alice.cookie, 'POST', '/v1/demo');
  assert.equal(first.statusCode, 200);
  const data = first.json();
  assert.equal(data.workspaces.length, 4);
  const mtn = data.workspaces.find((w: { name: string }) => w.name === 'MTN');
  assert.ok(
    data.projects.filter(
      (p: { workspaceId: string }) => p.workspaceId === mtn.id,
    ).length >= 21,
  );
  const second = (await call(app, alice.cookie, 'POST', '/v1/demo')).json();
  assert.equal(second.tasks.length, data.tasks.length);
  assert.equal(second.workspaces.length, 4);
  assert.deepEqual(
    (await call(app, bob.cookie, 'GET', '/v1/home')).json().workspaces,
    [],
  );
});

test('file-backed PostgreSQL persists account, session, task and migration across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ordo-api-test-'));
  try {
    let app = await buildApp({
      connection: await openDatabase({
        dataDir: join(directory, 'fresh', 'nested', 'database'),
      }),
    });
    const { cookie } = await account(app);
    const task = await createTask(app, cookie, {
      title: 'Survives process restart',
    });
    await app.close();
    app = await buildApp({
      connection: await openDatabase({
        dataDir: join(directory, 'fresh', 'nested', 'database'),
      }),
    });
    try {
      const result = await call(app, cookie, 'GET', `/v1/tasks/${task.id}`);
      assert.equal(result.statusCode, 200);
      assert.equal(result.json().title, task.title);
      assert.equal(
        (await call(app, cookie, 'GET', '/v1/home')).json().tasks.length,
        1,
      );
    } finally {
      await app.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('partial updates preserve all omitted fields and reject an old account queue after session switch', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());
  const alice = await account(app);
  const bob = await account(app);
  const workspace = (
    await call(app, alice.cookie, 'POST', '/v1/workspaces', {
      name: 'Scoped',
      color: '#112233',
    })
  ).json();
  const project = (
    await call(app, alice.cookie, 'POST', '/v1/projects', {
      name: 'Project',
      workspaceId: workspace.id,
      description: 'Keep project body',
    })
  ).json();
  const parent = await createTask(app, alice.cookie, {
    title: 'Parent',
    workspaceId: workspace.id,
    projectId: project.id,
  });
  const original = await createTask(app, alice.cookie, {
    title: 'Original',
    workspaceId: workspace.id,
    projectId: project.id,
    parentId: parent.id,
    description: 'Keep this description',
    status: 'waiting',
    priority: 'high',
    dueDate: '2026-12-25',
    followUpDate: '2026-12-20',
  });
  const changed = await call(
    app,
    alice.cookie,
    'PATCH',
    `/v1/tasks/${original.id}`,
    { title: 'Renamed', expectedRevision: 1 },
  );
  assert.equal(changed.statusCode, 200, changed.body);
  for (const field of [
    'workspaceId',
    'projectId',
    'parentId',
    'description',
    'status',
    'priority',
    'dueDate',
    'followUpDate',
  ])
    assert.equal(
      changed.json()[field],
      original[field],
      `Preserve task ${field}`,
    );
  const note = (
    await call(app, alice.cookie, 'POST', '/v1/notes', {
      title: 'Original',
      body: 'Keep note body',
      workspaceId: workspace.id,
      projectId: project.id,
    })
  ).json();
  const renamedNote = (
    await call(app, alice.cookie, 'PATCH', `/v1/notes/${note.id}`, {
      title: 'Renamed',
      expectedRevision: 1,
    })
  ).json();
  assert.equal(renamedNote.body, note.body);
  assert.equal(renamedNote.workspaceId, workspace.id);
  assert.equal(renamedNote.projectId, project.id);
  const renamedWorkspace = (
    await call(app, alice.cookie, 'PATCH', `/v1/workspaces/${workspace.id}`, {
      name: 'New workspace name',
      expectedRevision: 1,
    })
  ).json();
  assert.equal(renamedWorkspace.color, '#112233');
  const renamedProject = (
    await call(app, alice.cookie, 'PATCH', `/v1/projects/${project.id}`, {
      name: 'New project name',
      expectedRevision: 1,
    })
  ).json();
  assert.equal(renamedProject.description, 'Keep project body');
  const rejected = await app.inject({
    method: 'POST',
    url: '/v1/tasks',
    headers: {
      origin,
      cookie: bob.cookie,
      'x-ordo-account': alice.user.id,
      'idempotency-key': randomUUID(),
    },
    payload: { title: 'Alice queued Inbox capture' },
  });
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.json().error.code, 'SESSION_CHANGED');
  const aliceTasks = (await call(app, alice.cookie, 'GET', '/v1/home')).json()
    .tasks;
  const bobTasks = (await call(app, bob.cookie, 'GET', '/v1/home')).json()
    .tasks;
  assert.equal(aliceTasks.length, 2);
  assert.equal(bobTasks.length, 0);
});

test('login throttling never prevents an authenticated user from signing out', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());
  const user = await account(app);
  let blocked = false;
  for (let i = 0; i < 13; i++) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin },
      payload: { email: user.email, password: 'Wrong-password-42' },
    });
    if (response.statusCode === 429) blocked = true;
    else assert.equal(response.statusCode, 401);
  }
  assert.ok(blocked);
  assert.equal(
    (await call(app, user.cookie, 'POST', '/v1/auth/logout')).statusCode,
    200,
  );
  assert.equal(
    (await call(app, user.cookie, 'GET', '/v1/home')).statusCode,
    401,
  );
});

test('task times and people round-trip, preserve when omitted, and require their dates', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());
  const alice = await account(app);
  const bob = await account(app);
  const blank = await createTask(app, alice.cookie, { title: 'Defaults' });
  assert.equal(blank.dueTime, null);
  assert.equal(blank.followUpTime, null);
  assert.equal(blank.responsiblePerson, null);
  assert.equal(blank.waitingOn, null);
  const created = await createTask(app, alice.cookie, {
    title: 'Chase the quote',
    status: 'waiting',
    dueDate: '2026-10-23',
    dueTime: '09:30',
    followUpDate: '2026-10-22',
    followUpTime: '23:59',
    responsiblePerson: '  Ama Mensah  ',
    waitingOn: ' Kwame ',
  });
  assert.equal(created.dueTime, '09:30');
  assert.equal(created.followUpTime, '23:59');
  assert.equal(created.responsiblePerson, 'Ama Mensah');
  assert.equal(created.waitingOn, 'Kwame');
  const listed = (await call(app, alice.cookie, 'GET', '/v1/tasks'))
    .json()
    .find((task: { id: string }) => task.id === created.id);
  assert.equal(listed.waitingOn, 'Kwame');
  const home = (await call(app, alice.cookie, 'GET', '/v1/home'))
    .json()
    .tasks.find((task: { id: string }) => task.id === created.id);
  assert.equal(home.dueTime, '09:30');
  assert.equal(home.responsiblePerson, 'Ama Mensah');

  // Omitted fields stay unchanged.
  const renamed = await call(
    app,
    alice.cookie,
    'PATCH',
    `/v1/tasks/${created.id}`,
    { title: 'Chase the signed quote', expectedRevision: created.revision },
  );
  assert.equal(renamed.statusCode, 200, renamed.body);
  for (const field of [
    'dueDate',
    'dueTime',
    'followUpDate',
    'followUpTime',
    'responsiblePerson',
    'waitingOn',
  ])
    assert.equal(renamed.json()[field], created[field], field);

  // Empty names become null; whitespace-only too.
  const cleared = await call(
    app,
    alice.cookie,
    'PATCH',
    `/v1/tasks/${created.id}`,
    {
      responsiblePerson: '',
      waitingOn: '   ',
      expectedRevision: renamed.json().revision,
    },
  );
  assert.equal(cleared.statusCode, 200, cleared.body);
  assert.equal(cleared.json().responsiblePerson, null);
  assert.equal(cleared.json().waitingOn, null);
  let revision = cleared.json().revision;

  // Clearing a date while its time remains is rejected; clearing both succeeds.
  const orphan = await call(
    app,
    alice.cookie,
    'PATCH',
    `/v1/tasks/${created.id}`,
    {
      dueDate: null,
      expectedRevision: revision,
    },
  );
  assert.equal(orphan.statusCode, 400);
  assert.equal(orphan.json().error.code, 'INVALID_INPUT');
  assert.equal(orphan.json().error.message, 'A due time needs a due date.');
  const both = await call(
    app,
    alice.cookie,
    'PATCH',
    `/v1/tasks/${created.id}`,
    {
      dueDate: null,
      dueTime: null,
      expectedRevision: revision,
    },
  );
  assert.equal(both.statusCode, 200, both.body);
  assert.equal(both.json().dueDate, null);
  assert.equal(both.json().dueTime, null);
  assert.equal(both.json().followUpTime, '23:59');
  revision = both.json().revision;
  const timeOnly = await call(
    app,
    alice.cookie,
    'PATCH',
    `/v1/tasks/${created.id}`,
    {
      dueTime: '10:00',
      expectedRevision: revision,
    },
  );
  assert.equal(timeOnly.statusCode, 400);
  assert.equal(timeOnly.json().error.code, 'INVALID_INPUT');

  // Create-time validation: time without date, bad formats, overlong names.
  for (const payload of [
    { title: 'No date', dueTime: '09:00' },
    { title: 'No follow-up date', followUpTime: '09:00' },
    { title: 'Bad hour', dueDate: '2026-10-23', dueTime: '24:00' },
    { title: 'Bad shape', dueDate: '2026-10-23', dueTime: '9:00' },
    { title: 'Seconds', dueDate: '2026-10-23', dueTime: '09:00:00' },
    { title: 'Long', waitingOn: 'x'.repeat(81) },
  ]) {
    const rejected = await call(
      app,
      alice.cookie,
      'POST',
      '/v1/tasks',
      payload,
      randomUUID(),
    );
    assert.equal(rejected.statusCode, 400, payload.title);
    assert.equal(rejected.json().error.code, 'INVALID_INPUT');
  }
  assert.equal(
    (
      await createTask(app, alice.cookie, {
        title: 'Max',
        waitingOn: 'x'.repeat(80),
      })
    ).waitingOn.length,
    80,
  );

  // Authorization unchanged: another owner cannot read or edit the fields.
  assert.equal(
    (await call(app, bob.cookie, 'GET', `/v1/tasks/${created.id}`)).statusCode,
    404,
  );
  assert.equal(
    (
      await call(app, bob.cookie, 'PATCH', `/v1/tasks/${created.id}`, {
        waitingOn: 'Intruder',
        expectedRevision: revision,
      })
    ).statusCode,
    404,
  );
  assert.ok(
    !(await call(app, bob.cookie, 'GET', '/v1/home')).body.includes(
      'Ama Mensah',
    ),
  );
});
