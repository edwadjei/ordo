import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/index.ts';
import { cacheNote, cachedNote, forgetNote } from '../src/note-bodies.ts';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}
const note = (id: string, revision = 1, body = `Body of ${id}`) => ({
  id,
  title: id,
  body,
  revision,
  updatedAt: '2026-10-30T00:00:00Z',
});

test('opening a note fetches it by id with the account guard', async () => {
  const client = createClient('/api', async (url, init) => {
    assert.equal(url, '/api/notes/n1');
    assert.equal(new Headers(init?.headers).get('X-Ordo-Account'), 'owner');
    return Response.json({ ...note('n1'), preview: 'Body', bodyLength: 10 });
  });
  client.setAccount('owner');
  assert.equal((await client.note('n1')).body, 'Body of n1');
});

test('opened bodies are kept per account for offline reading', () => {
  const storage = memory();
  cacheNote(storage, 'ama', note('n1'));
  assert.equal(cachedNote(storage, 'ama', 'n1')?.body, 'Body of n1');
  assert.equal(cachedNote(storage, 'kofi', 'n1'), null);
  assert.equal(cachedNote(storage, 'ama', 'n2'), null);
});

test('an older revision never replaces a newer cached body', () => {
  const storage = memory();
  cacheNote(storage, 'ama', note('n1', 3, 'newest'));
  cacheNote(storage, 'ama', note('n1', 2, 'stale'));
  assert.equal(cachedNote(storage, 'ama', 'n1')?.body, 'newest');
  cacheNote(storage, 'ama', note('n1', 4, 'saved again'));
  assert.equal(cachedNote(storage, 'ama', 'n1')?.body, 'saved again');
});

test('only the most recently opened notes are kept, and a list entry without a body is never cached', () => {
  const storage = memory();
  for (let i = 0; i < 5; i++)
    cacheNote(
      storage,
      'ama',
      note(`n${i}`),
      3,
      new Date(Date.UTC(2026, 9, 30, 0, i)),
    );
  assert.deepEqual(
    ['n0', 'n1', 'n2', 'n3', 'n4'].map(
      (id) => !!cachedNote(storage, 'ama', id),
    ),
    [false, false, true, true, true],
  );
  cacheNote(storage, 'ama', {
    ...note('preview-only'),
    body: undefined as unknown as string,
  });
  assert.equal(cachedNote(storage, 'ama', 'preview-only'), null);
  forgetNote(storage, 'ama', 'n4');
  assert.equal(cachedNote(storage, 'ama', 'n4'), null);
});

test('broken or full storage is ignored', () => {
  const storage = memory();
  storage.data.set('ordo.note-bodies.v1:ama', '{not json');
  assert.equal(cachedNote(storage, 'ama', 'n1'), null);
  const full = {
    ...memory(),
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.doesNotThrow(() => cacheNote(full, 'ama', note('n1')));
});
