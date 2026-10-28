import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { ftsQuery } from '../src/domains/search/search.repository.js';
import type { TestApp } from './http-harness.js';
import { apiHarness, origin, signIn } from './d1-harness.js';

function call(
  app: TestApp,
  cookie: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return app.inject({
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
}

test('FTS query text: words only, each quoted, operators are plain words', () => {
  assert.equal(ftsQuery('plan launch'), '"plan" "launch"');
  assert.equal(
    ftsQuery('title:secret NEAR("a" b)*'),
    '"title" "secret" "NEAR" "a" "b"',
  );
  assert.equal(ftsQuery('Ama-Mensah'), '"Ama" "Mensah"');
  assert.equal(ftsQuery('!!!'), '');
  assert.equal(ftsQuery('é café'), '"é" "café"');
});

test('FTS5 search through the API: bm25 ranking, people names, edits, archives, cap and hostile input', async (t) => {
  const h = await apiHarness();
  t.after(() => h.app.close());
  const { cookie } = await signIn(h);
  const create = async (input: object) =>
    (await call(h.app, cookie, 'POST', '/v1/tasks', input)).json();
  const strong = await create({
    title: 'Budget budget review',
    description: 'The budget, the whole budget',
  });
  const weak = await create({
    title: 'Quarterly planning',
    description: 'Mentions the budget once among many other words here',
  });
  const person = await create({
    title: 'Contract',
    responsiblePerson: 'Ama Mensah',
    waitingOn: 'Kwame Boateng',
  });
  const search = async (q: string) => {
    const response = await call(
      h.app,
      cookie,
      'GET',
      `/v1/search?q=${encodeURIComponent(q)}`,
    );
    assert.equal(response.statusCode, 200, response.body);
    return response.json().results as {
      id: string;
      type: string;
      title: string;
      excerpt: string;
    }[];
  };
  const ranked = await search('budget');
  assert.deepEqual(
    ranked.map((row) => row.id),
    [strong.id, weak.id],
  );
  assert.deepEqual(Object.keys(ranked[0]).sort(), [
    'excerpt',
    'id',
    'projectId',
    'title',
    'type',
    'workspaceId',
  ]);
  assert.equal(ranked[0].type, 'task');
  assert.deepEqual(
    (await search('boateng')).map((row) => row.id),
    [person.id],
  );
  // Editing reindexes: the old title no longer matches, the new one does.
  const renamed = await call(h.app, cookie, 'PATCH', `/v1/tasks/${weak.id}`, {
    title: 'Quarterly forecast',
    description: 'Nothing about money',
    expectedRevision: 1,
  });
  assert.equal(renamed.statusCode, 200);
  assert.deepEqual(
    (await search('budget')).map((row) => row.id),
    [strong.id],
  );
  assert.deepEqual(
    (await search('forecast')).map((row) => row.id),
    [weak.id],
  );
  // Archived tasks and notes disappear from results.
  await call(h.app, cookie, 'DELETE', `/v1/tasks/${strong.id}`, {
    expectedRevision: 1,
  });
  assert.deepEqual(await search('budget'), []);
  const note = (
    await call(h.app, cookie, 'POST', '/v1/notes', {
      title: 'Garden notes',
      body: 'Tomatoes need watering',
    })
  ).json();
  assert.deepEqual(
    (await search('tomato')).map((row) => [row.id, row.type]),
    [[note.id, 'note']],
  );
  await call(h.app, cookie, 'DELETE', `/v1/notes/${note.id}`, {
    expectedRevision: 1,
  });
  assert.deepEqual(await search('tomato'), []);
  // At most 30 results across tasks, notes and projects.
  for (let i = 0; i < 32; i++) await create({ title: `Repeated item ${i}` });
  assert.equal((await search('repeated')).length, 30);
  // FTS syntax in user input is treated as words, never as a query.
  for (const hostile of [
    '"',
    'title:Repeated',
    'repeated*',
    'NEAR(repeated item)',
    "'; DROP TABLE tasks; --",
    '!!!',
  ])
    await search(hostile);
  assert.equal((await search('repeated')).length, 30);
});
