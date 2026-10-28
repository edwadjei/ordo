import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/index.ts';
import { createBookmarkStore, type BookmarkStorage } from '../src/bookmark.ts';

function storage(): BookmarkStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** A fake API that returns the queued bookmark (if any) and records what it was sent. */
function server(bookmarks: (string | null)[]) {
  const sent: (string | undefined)[] = [];
  const transport = (async (_url: string, init?: RequestInit) => {
    sent.push((init?.headers as Record<string, string>)['X-Ordo-Bookmark']);
    const next = bookmarks.shift() ?? null;
    return new Response('{}', {
      status: 200,
      headers: next ? { 'X-Ordo-Bookmark': next } : {},
    });
  }) as typeof fetch;
  return { sent, transport };
}

test('without the header the client sends no bookmark and stores nothing', async () => {
  const saved = storage();
  const api = server([]);
  const client = createClient(
    '/api',
    api.transport,
    undefined,
    createBookmarkStore(() => saved),
  );
  client.setAccount('alice');
  await client.home();
  await client.createNote({ title: 'Plain' });
  await client.home();
  assert.deepEqual(api.sent, [undefined, undefined, undefined]);
  assert.equal(saved.map.size, 0);
});

test('stores the latest bookmark and forwards it on the next request', async () => {
  const saved = storage();
  const api = server(['b1', null, 'b2']);
  const client = createClient(
    '/api',
    api.transport,
    undefined,
    createBookmarkStore(() => saved),
  );
  client.setAccount('alice');
  await client.createNote({ title: 'First' }); // returns b1
  await client.home(); // sends b1, returns nothing
  await client.updateNote('n', { expectedRevision: 1 }); // sends b1, returns b2
  await client.home(); // sends b2
  assert.deepEqual(api.sent, [undefined, 'b1', 'b1', 'b2']);
  assert.equal(saved.map.get('ordo.bookmark.v1:alice'), 'b2');
});

test('a reloaded client picks up the stored bookmark for that account', async () => {
  const saved = storage();
  saved.setItem('ordo.bookmark.v1:alice', 'from-last-visit');
  const api = server([]);
  const client = createClient(
    '/api',
    api.transport,
    undefined,
    createBookmarkStore(() => saved),
  );
  client.setAccount('alice');
  await client.home();
  assert.deepEqual(api.sent, ['from-last-visit']);
});

test('bookmarks stay separate per account', async () => {
  const saved = storage();
  const api = server(['alice-1', 'bob-1']);
  const client = createClient(
    '/api',
    api.transport,
    undefined,
    createBookmarkStore(() => saved),
  );
  client.setAccount('alice');
  await client.home();
  client.setAccount('bob');
  await client.home();
  client.setAccount('alice');
  await client.home();
  client.setAccount('bob');
  await client.home();
  assert.deepEqual(api.sent, [undefined, undefined, 'alice-1', 'bob-1']);
  assert.equal(saved.map.get('ordo.bookmark.v1:alice'), 'alice-1');
  assert.equal(saved.map.get('ordo.bookmark.v1:bob'), 'bob-1');
});

test('a bookmark from sign-in carries over to the account that signed in', async () => {
  const saved = storage();
  const api = server(['after-sign-in']);
  const client = createClient(
    '/api',
    api.transport,
    undefined,
    createBookmarkStore(() => saved),
  );
  await client.verifyOtp({ challengeId: 'c', code: '000000' });
  client.setAccount('alice');
  await client.home();
  assert.deepEqual(api.sent, [undefined, 'after-sign-in']);
  assert.equal(saved.map.get('ordo.bookmark.v1:alice'), 'after-sign-in');
});

test('sign-out clears only that account, even when the request fails', async () => {
  const saved = storage();
  saved.setItem('ordo.bookmark.v1:alice', 'a');
  saved.setItem('ordo.bookmark.v1:bob', 'b');
  const store = createBookmarkStore(() => saved);
  const client = createClient(
    '/api',
    async () => {
      throw new TypeError('Network lost');
    },
    undefined,
    store,
  );
  client.setAccount('alice');
  await assert.rejects(client.logout(), /Network lost/);
  assert.equal(saved.map.has('ordo.bookmark.v1:alice'), false);
  assert.equal(store.get('alice'), null);
  assert.equal(saved.map.get('ordo.bookmark.v1:bob'), 'b');
});

test('unavailable storage keeps the bookmark in memory without failing requests', async () => {
  const api = server(['b1']);
  const client = createClient(
    '/api',
    api.transport,
    undefined,
    createBookmarkStore(() => {
      throw new Error('SecurityError');
    }),
  );
  client.setAccount('alice');
  await client.home();
  await client.home();
  assert.deepEqual(api.sent, [undefined, 'b1']);
});
