import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { apiHarness, origin, signIn, type Harness } from './d1-harness.js';

// Archiving and permanently deleting workspaces and projects, task links and
// related items. A permanent delete must leave no orphan in any table.

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function setup(t: { after(fn: () => Promise<void>): void }) {
  const h = await apiHarness();
  t.after(() => h.app.close());
  const owner = await signIn(h);
  const as = (cookie: string) => {
    const call = (method: Method, url: string, payload?: object) =>
      h.app.inject({
        method,
        url,
        headers: {
          origin,
          cookie,
          ...(method === 'POST' && url === '/v1/tasks'
            ? { 'idempotency-key': randomUUID() }
            : {}),
        },
        ...(payload ? { payload } : {}),
      });
    const ok = async (method: Method, url: string, payload?: object) => {
      const response = await call(method, url, payload);
      assert.ok(
        response.statusCode < 300,
        `${method} ${url}: ${response.body}`,
      );
      return response.body ? response.json() : undefined;
    };
    return { call, ok };
  };
  return { h, owner, ...as(owner.cookie), as };
}

/** A workspace with a project full of fictional, nested content. */
async function populate(
  h: Harness,
  ok: (method: Method, url: string, payload?: object) => Promise<any>,
  label: string,
) {
  const workspace = await ok('POST', '/v1/workspaces', {
    name: `${label} workspace`,
  });
  const project = await ok('POST', '/v1/projects', {
    name: `${label} project`,
    workspaceId: workspace.id,
    favorite: true,
  });
  const scope = { workspaceId: workspace.id, projectId: project.id };
  const note = await ok('POST', '/v1/notes', {
    ...scope,
    title: `${label} note`,
    body: `zebrafish ${label} meeting notes`,
    source: 'transcript',
  });
  const parent = await ok('POST', '/v1/tasks', {
    ...scope,
    title: `zebrafish ${label} parent`,
    sourceNoteId: note.id,
  });
  const child = await ok('POST', '/v1/tasks', {
    ...scope,
    title: `${label} child`,
    parentId: parent.id,
  });
  const grandchild = await ok('POST', '/v1/tasks', {
    ...scope,
    title: `${label} grandchild`,
    parentId: child.id,
  });
  const archivedTask = await ok('POST', '/v1/tasks', {
    ...scope,
    title: `${label} archived`,
  });
  await ok('DELETE', `/v1/tasks/${archivedTask.id}`, { expectedRevision: 1 });
  const draft = await ok('POST', '/v1/drafts', {
    ...scope,
    sourceNoteId: note.id,
    kind: 'email',
    body: `${label} draft`,
  });
  await ok('POST', `/v1/tasks/${parent.id}/links`, { noteId: note.id });
  await h.d1
    .prepare(
      `INSERT INTO capture_runs (id, owner_user_id, note_id, note_revision, workspace_id, project_id, status, provider)
       SELECT ?, owner_user_id, ?, 1, ?, ?, 'pending', 'workers_ai' FROM notes WHERE id = ?`,
    )
    .bind(randomUUID(), note.id, workspace.id, project.id, note.id)
    .run();
  return {
    workspace,
    project,
    note,
    parent,
    child,
    grandchild,
    archivedTask,
    draft,
  };
}

/** Row counts of every table that holds owner data, for orphan checks. */
async function rowsReferencing(h: Harness, ids: string[]) {
  const list = JSON.stringify(ids);
  const count = async (sql: string) =>
    Number(((await h.d1.prepare(sql).bind(list).first()) as { n: number }).n);
  const inList = `(SELECT value FROM json_each(?1))`;
  return {
    workspaces: await count(
      `SELECT COUNT(*) AS n FROM workspaces WHERE id IN ${inList}`,
    ),
    projects: await count(
      `SELECT COUNT(*) AS n FROM projects WHERE id IN ${inList} OR workspace_id IN ${inList}`,
    ),
    tasks: await count(
      `SELECT COUNT(*) AS n FROM tasks WHERE id IN ${inList} OR workspace_id IN ${inList} OR project_id IN ${inList} OR parent_id IN ${inList} OR source_note_id IN ${inList}`,
    ),
    notes: await count(
      `SELECT COUNT(*) AS n FROM notes WHERE id IN ${inList} OR workspace_id IN ${inList} OR project_id IN ${inList}`,
    ),
    drafts: await count(
      `SELECT COUNT(*) AS n FROM drafts WHERE id IN ${inList} OR workspace_id IN ${inList} OR project_id IN ${inList} OR source_note_id IN ${inList}`,
    ),
    captureRuns: await count(
      `SELECT COUNT(*) AS n FROM capture_runs WHERE note_id IN ${inList} OR workspace_id IN ${inList} OR project_id IN ${inList}`,
    ),
    links: await count(
      `SELECT COUNT(*) AS n FROM task_note_links WHERE task_id IN ${inList} OR note_id IN ${inList}`,
    ),
    retryKeys: await count(
      `SELECT COUNT(*) AS n FROM idempotency_keys WHERE task_id IN ${inList}`,
    ),
  };
}

const zero = {
  workspaces: 0,
  projects: 0,
  tasks: 0,
  notes: 0,
  drafts: 0,
  captureRuns: 0,
  links: 0,
  retryKeys: 0,
};

/** Rows the full-text indexes still return for a word. */
async function ftsHits(h: Harness, word: string) {
  const hits = async (table: string) =>
    (
      await h.d1
        .prepare(`SELECT rowid FROM ${table} WHERE ${table} MATCH ?`)
        .bind(word)
        .all()
    ).results.length;
  return {
    tasks: await hits('tasks_fts'),
    notes: await hits('notes_fts'),
    projects: await hits('projects_fts'),
  };
}

test('archiving hides a project or workspace everywhere by default and restoring brings it back', async (t) => {
  const { h, ok, call } = await setup(t);
  const keep = await ok('POST', '/v1/workspaces', { name: 'Kept' });
  const a = await populate(h, ok, 'alpha');
  const visible = async (query = '') => {
    const [tasks, notes, drafts, home, search] = await Promise.all([
      ok('GET', `/v1/tasks${query}`),
      ok('GET', `/v1/notes${query}`),
      ok('GET', `/v1/drafts${query}`),
      ok('GET', '/v1/home'),
      ok('GET', `/v1/search?q=zebrafish${query ? '&includeArchived=1' : ''}`),
    ]);
    return {
      tasks: tasks.length,
      notes: notes.length,
      drafts: drafts.length,
      homeTasks: home.tasks.length,
      homeNotes: home.notes.length,
      search: search.results.length,
    };
  };
  const all = {
    tasks: 3,
    notes: 1,
    drafts: 1,
    homeTasks: 3,
    homeNotes: 1,
    search: 2,
  };
  assert.deepEqual(await visible(), all);
  const archived = await ok('PATCH', `/v1/projects/${a.project.id}`, {
    archived: true,
    expectedRevision: 1,
  });
  assert.ok(archived.archivedAt);
  assert.equal(archived.revision, 2);
  assert.deepEqual(await visible(), {
    tasks: 0,
    notes: 0,
    drafts: 0,
    homeTasks: 0,
    homeNotes: 0,
    search: 0,
  });
  // Still there, and found when asked for.
  assert.deepEqual(await visible('?includeArchived=1'), {
    ...all,
    homeTasks: 0,
    homeNotes: 0,
  });
  // Archived projects still list, marked, for the Archived filter.
  const home = await ok('GET', '/v1/home');
  assert.ok(
    home.projects.find((p: { id: string }) => p.id === a.project.id).archivedAt,
  );
  // Archiving twice keeps the first time; restoring clears it.
  const again = await ok('PATCH', `/v1/projects/${a.project.id}`, {
    archived: true,
    expectedRevision: 2,
  });
  assert.equal(again.archivedAt, archived.archivedAt);
  await ok('PATCH', `/v1/projects/${a.project.id}`, {
    archived: false,
    expectedRevision: 3,
  });
  assert.deepEqual(await visible(), all);
  // A workspace hides everything inside, its projects included.
  const ws = await ok('PATCH', `/v1/workspaces/${a.workspace.id}`, {
    archived: true,
    expectedRevision: 1,
  });
  assert.ok(ws.archivedAt);
  assert.deepEqual(await visible(), {
    tasks: 0,
    notes: 0,
    drafts: 0,
    homeTasks: 0,
    homeNotes: 0,
    search: 0,
  });
  const stale = await call('PATCH', `/v1/workspaces/${a.workspace.id}`, {
    archived: false,
    expectedRevision: 1,
  });
  assert.equal(stale.statusCode, 409);
  await ok('PATCH', `/v1/workspaces/${a.workspace.id}`, {
    archived: false,
    expectedRevision: 2,
  });
  assert.deepEqual(await visible(), all);
  assert.equal((await ok('GET', `/v1/workspaces/${keep.id}`)).archivedAt, null);
});

test('deleting a project removes everything in it, and only that, with no orphans', async (t) => {
  const { h, ok, call } = await setup(t);
  const a = await populate(h, ok, 'alpha');
  // Elsewhere in the same workspace: a task and draft saved from alpha's
  // note, and a task linking it. They stay, without the pointer or link.
  const other = await ok('POST', '/v1/projects', {
    name: 'Other project',
    workspaceId: a.workspace.id,
  });
  const keptTask = await ok('POST', '/v1/tasks', {
    workspaceId: a.workspace.id,
    projectId: other.id,
    title: 'Kept task',
    sourceNoteId: a.note.id,
  });
  const inboxTask = await ok('POST', '/v1/tasks', {
    title: 'Inbox task',
    sourceNoteId: a.note.id,
  });
  const keptDraft = await ok('POST', '/v1/drafts', {
    workspaceId: a.workspace.id,
    sourceNoteId: a.note.id,
    kind: 'message',
    body: 'Kept draft',
  });
  await ok('POST', `/v1/tasks/${keptTask.id}/links`, { noteId: a.note.id });
  const preview = await ok(
    'GET',
    `/v1/projects/${a.project.id}/delete-preview`,
  );
  assert.deepEqual(preview, {
    name: 'alpha project',
    projects: 1,
    tasks: 4,
    notes: 1,
    drafts: 1,
    captureRuns: 1,
  });
  assert.deepEqual(await ftsHits(h, 'zebrafish'), {
    tasks: 1,
    notes: 1,
    projects: 0,
  });
  const deleted = await ok('DELETE', `/v1/projects/${a.project.id}`, {
    confirmName: 'alpha project',
    expectedRevision: 1,
  });
  const { name: _name, ...counts } = preview;
  assert.deepEqual(deleted, { deleted: counts });
  const gone = [
    a.project.id,
    a.note.id,
    a.parent.id,
    a.child.id,
    a.grandchild.id,
    a.archivedTask.id,
    a.draft.id,
  ];
  assert.deepEqual(await rowsReferencing(h, gone), zero);
  assert.deepEqual(await ftsHits(h, 'zebrafish'), {
    tasks: 0,
    notes: 0,
    projects: 0,
  });
  assert.deepEqual(await ftsHits(h, 'alpha'), {
    tasks: 0,
    notes: 0,
    projects: 0,
  });
  assert.deepEqual(
    (await h.d1.prepare('PRAGMA foreign_key_check').all()).results,
    [],
  );
  // What lived elsewhere is kept, without the deleted note.
  for (const task of [keptTask, inboxTask]) {
    const after = await ok('GET', `/v1/tasks/${task.id}`);
    assert.equal(after.sourceNoteId, null);
    assert.equal(after.revision, task.revision + 1);
  }
  assert.equal(
    (await ok('GET', `/v1/drafts/${keptDraft.id}`)).sourceNoteId,
    null,
  );
  assert.equal(
    (await ok('GET', `/v1/projects/${other.id}`)).name,
    'Other project',
  );
  // Retrying after success: 404.
  const retry = await call('DELETE', `/v1/projects/${a.project.id}`, {
    confirmName: 'alpha project',
    expectedRevision: 1,
  });
  assert.equal(retry.statusCode, 404);
});

test('deleting a workspace removes its projects and everything inside, with no orphans', async (t) => {
  const { h, ok } = await setup(t);
  const a = await populate(h, ok, 'alpha');
  const b = await populate(h, ok, 'beta');
  // A second project in alpha, and a workspace-level note.
  const second = await ok('POST', '/v1/projects', {
    name: 'Second',
    workspaceId: a.workspace.id,
  });
  const looseNote = await ok('POST', '/v1/notes', {
    workspaceId: a.workspace.id,
    title: 'Loose zebrafish note',
  });
  // Beta links alpha's note; the link goes, beta's task stays.
  await ok('POST', `/v1/tasks/${b.parent.id}/links`, { noteId: a.note.id });
  const before = await rowsReferencing(h, [
    b.workspace.id,
    b.project.id,
    b.note.id,
    b.parent.id,
  ]);
  const preview = await ok(
    'GET',
    `/v1/workspaces/${a.workspace.id}/delete-preview`,
  );
  assert.deepEqual(preview, {
    name: 'alpha workspace',
    projects: 2,
    tasks: 4,
    notes: 2,
    drafts: 1,
    captureRuns: 1,
  });
  const deleted = await ok('DELETE', `/v1/workspaces/${a.workspace.id}`, {
    confirmName: 'alpha workspace',
    expectedRevision: 1,
  });
  const { name: _name, ...counts } = preview;
  assert.deepEqual(deleted, { deleted: counts });
  assert.deepEqual(
    await rowsReferencing(h, [
      a.workspace.id,
      a.project.id,
      second.id,
      a.note.id,
      looseNote.id,
      a.parent.id,
      a.child.id,
      a.grandchild.id,
      a.archivedTask.id,
      a.draft.id,
    ]),
    zero,
  );
  assert.deepEqual(
    (await h.d1.prepare('PRAGMA foreign_key_check').all()).results,
    [],
  );
  // Beta is untouched apart from the link to alpha's note.
  const after = await rowsReferencing(h, [
    b.workspace.id,
    b.project.id,
    b.note.id,
    b.parent.id,
  ]);
  assert.deepEqual(after, { ...before, links: before.links - 1 });
  assert.deepEqual(await ftsHits(h, 'alpha'), {
    tasks: 0,
    notes: 0,
    projects: 0,
  });
  assert.deepEqual(await ftsHits(h, 'beta'), {
    tasks: 4,
    notes: 1,
    projects: 1,
  });
  const home = await ok('GET', '/v1/home');
  assert.deepEqual(
    home.workspaces.map((w: { id: string }) => w.id),
    [b.workspace.id],
  );
});

test('a delete needs the exact name, the current revision, and another workspace left', async (t) => {
  const { h, ok, call, as } = await setup(t);
  const a = await populate(h, ok, 'alpha');
  const refused = async (
    url: string,
    body: object,
    status: number,
    code: string,
  ) => {
    const response = await call('DELETE', url, body);
    assert.equal(response.statusCode, status, response.body);
    assert.equal(response.json().error.code, code);
  };
  for (const confirmName of ['Alpha project', 'alpha project ', '', 'alpha'])
    await refused(
      `/v1/projects/${a.project.id}`,
      { confirmName, expectedRevision: 1 },
      400,
      'CONFIRM_NAME_MISMATCH',
    );
  await ok('PATCH', `/v1/projects/${a.project.id}`, {
    name: 'Renamed',
    expectedRevision: 1,
  });
  await refused(
    `/v1/projects/${a.project.id}`,
    { confirmName: 'Renamed', expectedRevision: 1 },
    409,
    'REVISION_CONFLICT',
  );
  // The only workspace this owner has.
  await refused(
    `/v1/workspaces/${a.workspace.id}`,
    { confirmName: 'alpha workspace', expectedRevision: 1 },
    409,
    'LAST_WORKSPACE',
  );
  assert.equal(
    (
      await call('DELETE', `/v1/projects/${a.project.id}`, {
        expectedRevision: 2,
      })
    ).statusCode,
    400,
  );
  // Nothing was removed by any refusal.
  assert.equal((await ok('GET', '/v1/tasks')).length, 3);
  // Another account sees none of it.
  const stranger = as((await signIn(h)).cookie);
  for (const url of [
    `/v1/projects/${a.project.id}/delete-preview`,
    `/v1/workspaces/${a.workspace.id}/delete-preview`,
  ])
    assert.equal((await stranger.call('GET', url)).statusCode, 404);
  assert.equal(
    (
      await stranger.call('DELETE', `/v1/projects/${a.project.id}`, {
        confirmName: 'Renamed',
        expectedRevision: 2,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await stranger.call('PATCH', `/v1/workspaces/${a.workspace.id}`, {
        archived: true,
        expectedRevision: 1,
      })
    ).statusCode,
    404,
  );
});

test("links: one per pair, both sides the owner's; related items show the same capture", async (t) => {
  const { h, ok, call, as } = await setup(t);
  const a = await populate(h, ok, 'alpha');
  const extra = await ok('POST', '/v1/notes', { title: 'Extra note' });
  const first = await call('POST', `/v1/tasks/${a.child.id}/links`, {
    noteId: extra.id,
  });
  assert.equal(first.statusCode, 201);
  assert.deepEqual(Object.keys(first.json()).sort(), [
    'createdAt',
    'noteId',
    'taskId',
  ]);
  const again = await call('POST', `/v1/tasks/${a.child.id}/links`, {
    noteId: extra.id,
  });
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.json(), first.json());
  const stranger = as((await signIn(h)).cookie);
  const theirs = await stranger.ok('POST', '/v1/notes', { title: 'Theirs' });
  for (const [task, noteId] of [
    [a.child.id, theirs.id],
    [a.child.id, randomUUID()],
    [randomUUID(), extra.id],
  ])
    assert.equal(
      (await call('POST', `/v1/tasks/${task}/links`, { noteId })).statusCode,
      404,
    );
  assert.equal(
    (
      await stranger.call('POST', `/v1/tasks/${a.child.id}/links`, {
        noteId: theirs.id,
      })
    ).statusCode,
    404,
  );
  // Same capture: another task and a draft saved from alpha's note.
  const sibling = await ok('POST', '/v1/tasks', {
    workspaceId: a.workspace.id,
    projectId: a.project.id,
    title: 'Sibling',
    sourceNoteId: a.note.id,
  });
  const related = await ok('GET', `/v1/tasks/${a.parent.id}/related`);
  assert.equal(related.sourceNote.id, a.note.id);
  assert.equal('body' in related.sourceNote, false);
  assert.ok(related.sourceNote.preview);
  assert.deepEqual(
    related.linkedNotes.map((n: { id: string }) => n.id),
    [a.note.id],
  );
  assert.deepEqual(
    related.captureTasks.map((task: { id: string }) => task.id),
    [sibling.id],
  );
  assert.equal('description' in related.captureTasks[0], false);
  assert.deepEqual(
    related.drafts.map((d: { id: string }) => d.id),
    [a.draft.id],
  );
  // A task with no source note has only its links.
  assert.deepEqual(await ok('GET', `/v1/tasks/${a.child.id}/related`), {
    sourceNote: null,
    linkedNotes: [
      {
        ...(await ok('GET', '/v1/notes')).find(
          (n: { id: string }) => n.id === extra.id,
        ),
      },
    ],
    captureTasks: [],
    drafts: [],
  });
  // Archived items are left out unless asked for; archiving keeps links.
  await ok('DELETE', `/v1/tasks/${sibling.id}`, { expectedRevision: 1 });
  await ok('DELETE', `/v1/notes/${extra.id}`, { expectedRevision: 1 });
  assert.deepEqual(
    (await ok('GET', `/v1/tasks/${a.parent.id}/related`)).captureTasks,
    [],
  );
  assert.deepEqual(
    (await ok('GET', `/v1/tasks/${a.child.id}/related`)).linkedNotes,
    [],
  );
  assert.equal(
    (await ok('GET', `/v1/tasks/${a.child.id}/related?includeArchived=1`))
      .linkedNotes.length,
    1,
  );
  assert.equal(
    (await ok('GET', `/v1/tasks/${a.parent.id}/related?includeArchived=1`))
      .captureTasks.length,
    1,
  );
  // Unlink: 204, then 404.
  const unlinked = await call(
    'DELETE',
    `/v1/tasks/${a.parent.id}/links/${a.note.id}`,
  );
  assert.equal(unlinked.statusCode, 204);
  assert.equal(unlinked.body, '');
  assert.equal(
    (await call('DELETE', `/v1/tasks/${a.parent.id}/links/${a.note.id}`))
      .statusCode,
    404,
  );
  assert.equal(
    (await stranger.call('GET', `/v1/tasks/${a.parent.id}/related`)).statusCode,
    404,
  );
});

test('related items cap the same-capture lists at 20', async (t) => {
  const { h, ok } = await setup(t);
  const a = await populate(h, ok, 'alpha');
  for (let i = 0; i < 22; i++) {
    await ok('POST', '/v1/tasks', {
      title: `Saved ${i}`,
      sourceNoteId: a.note.id,
    });
    await ok('POST', '/v1/drafts', {
      workspaceId: a.workspace.id,
      sourceNoteId: a.note.id,
      kind: 'message',
      body: `Draft ${i}`,
    });
  }
  const related = await ok('GET', `/v1/tasks/${a.parent.id}/related`);
  assert.equal(related.captureTasks.length, 20);
  assert.equal(related.drafts.length, 20);
});
