import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestError, createClient } from '../src/index.ts';
import {
  drainQueue,
  enqueueTask,
  readQueue,
  type StorageLike,
} from '../src/offline.ts';
function store(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}
test('offline queues remain isolated by account and preserve retry keys after failure', async () => {
  const storage = store();
  enqueueTask(storage, 'alice', { title: 'Private task' }, 'retry-key');
  assert.deepEqual(readQueue(storage, 'bob'), []);
  await drainQueue(storage, 'alice', async () => {
    throw new TypeError('Network lost');
  });
  assert.equal(readQueue(storage, 'alice')[0].key, 'retry-key');
  const keys: string[] = [];
  assert.equal(
    await drainQueue(storage, 'alice', async (_, key) => {
      keys.push(key);
    }),
    1,
  );
  assert.deepEqual(keys, ['retry-key']);
  assert.deepEqual(readQueue(storage, 'alice'), []);
});
test('storage quota errors do not claim capture was saved', () => {
  const storage = store();
  storage.setItem = () => {
    throw new Error('quota');
  };
  assert.throws(
    () => enqueueTask(storage, 'alice', { title: 'Keep this text' }),
    /quota/,
  );
});
test('validation failures stay recoverable in queue', async () => {
  const storage = store();
  enqueueTask(storage, 'alice', { title: 'Wrong destination' }, 'key');
  await drainQueue(storage, 'alice', async () => {
    throw new RequestError(403, 'FORBIDDEN', 'Destination unavailable');
  });
  assert.equal(readQueue(storage, 'alice')[0].error, 'Destination unavailable');
});
test('typed client passes session credentials and explicit task idempotency keys', async () => {
  let options: RequestInit | undefined;
  const client = createClient('/api', async (_url, init) => {
    options = init;
    return new Response(JSON.stringify({ id: 'task' }), { status: 201 });
  });
  await client.createTask({ title: 'Test' }, 'stable-key');
  assert.equal(options?.credentials, 'include');
  assert.equal(
    (options?.headers as Record<string, string>)['Idempotency-Key'],
    'stable-key',
  );
});

test('all authenticated writes carry displayed-account precondition; login does not', async () => {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const client = createClient('/api', async (url, init) => {
    requests.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
    });
    return new Response('{}', { status: 200 });
  });
  client.setAccount('alice');
  await client.createNote({ title: 'Private note' });
  await client.createWorkspace({ name: 'Private space' });
  await client.demo();
  await client.logout();
  await client.login({
    email: 'bob@example.test',
    password: 'not-a-real-password',
  });
  assert.equal(requests[0].headers['X-Ordo-Account'], 'alice');
  assert.equal(requests[1].headers['X-Ordo-Account'], 'alice');
  assert.equal(requests[2].headers['X-Ordo-Account'], 'alice');
  assert.equal(requests[3].headers['X-Ordo-Account'], 'alice');
  assert.equal(requests[4].headers['X-Ordo-Account'], undefined);
});
test('session change escapes queue drain while preserving owner input', async () => {
  const storage = store();
  enqueueTask(storage, 'alice', { title: 'Private' }, 'key');
  await assert.rejects(
    drainQueue(storage, 'alice', async () => {
      throw new RequestError(409, 'SESSION_CHANGED', 'Account changed');
    }),
    /Account changed/,
  );
  assert.equal(readQueue(storage, 'alice').length, 1);
  assert.deepEqual(readQueue(storage, 'bob'), []);
});

test('autosave drains edits made during a slow in-flight write without another keystroke', async () => {
  const { saveLatest } = await import('../src/autosave.ts');
  let latest = 'first',
    release: () => void = () => {};
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: string[] = [];
  const saving = saveLatest(
    () => latest,
    async (value) => {
      writes.push(value);
      if (writes.length === 1) await slow;
    },
    (a, b) => a === b,
  );
  latest = 'last edit';
  release();
  await saving;
  assert.deepEqual(writes, ['first', 'last edit']);
});
test('autosave does not loop after a rejected write, retaining the caller draft', async () => {
  const { saveLatest } = await import('../src/autosave.ts');
  let calls = 0;
  const latest = 'do not lose this';
  await assert.rejects(
    saveLatest(
      () => latest,
      async () => {
        calls++;
        throw new Error('Conflict');
      },
      (a, b) => a === b,
    ),
    /Conflict/,
  );
  assert.equal(calls, 1);
  assert.equal(latest, 'do not lose this');
});
