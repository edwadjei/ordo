import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadedAssets } from '../lib/service-worker.ts';

test('only same-origin build assets are handed to the service worker', () => {
  const origin = 'https://ordo.example.test';
  const urls = loadedAssets(
    [
      { name: `${origin}/_next/static/chunks/app.js` },
      { name: `${origin}/_next/static/chunks/app.js` },
      { name: `${origin}/_next/static/css/app.css` },
      { name: `${origin}/api/home` },
      { name: 'https://elsewhere.example.test/_next/static/x.js' },
    ],
    origin,
  );
  assert.deepEqual(urls, [
    `${origin}/_next/static/chunks/app.js`,
    `${origin}/_next/static/css/app.css`,
  ]);
});

/** Runs public/sw.js against an in-memory cache and a fake network. */
function worker(network: (url: string) => Response | Promise<Response>) {
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: Request | string) =>
    new URL(
      typeof request === 'string' ? request : request.url,
      origin,
    ).toString();
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      match: async (request: Request | string) =>
        store.get(key(request))?.clone(),
      put: async (request: Request | string, response: Response) => {
        store.set(key(request), response);
      },
      add: async (request: string) => {
        store.set(key(request), await network(key(request)));
      },
    };
  };
  const listeners: Record<string, (event: unknown) => void> = {};
  const scope = {
    location: new URL(origin),
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const context = {
    self: scope,
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async () => true,
    },
    fetch: async (request: Request | string) => network(key(request)),
    URL,
    Set,
    Promise,
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    context,
  );
  async function dispatch(type: string, event: object) {
    let waited: Promise<unknown> | undefined;
    let answer: Promise<Response> | undefined;
    listeners[type]({
      ...event,
      waitUntil: (promise: Promise<unknown>) => (waited = promise),
      respondWith: (promise: Promise<Response>) => (answer = promise),
    });
    await waited;
    return answer;
  }
  return { dispatch, stores };
}
const origin = 'https://ordo.example.test';
const page = `<html><script src="/_next/static/chunks/main.js"></script><link href="/_next/static/css/app.css"></html>`;
function request(path: string, mode: RequestMode | 'navigate' = 'cors') {
  return { url: `${origin}${path}`, method: 'GET', mode } as unknown as Request;
}

test('the service worker leaves every API request to the network', async () => {
  const sw = worker(() => new Response('{}'));
  for (const path of ['/api/home', '/api', '/api/tasks?x=1'])
    assert.equal(
      await sw.dispatch('fetch', { request: request(path) }),
      undefined,
    );
});

test('installed, Ordo opens offline from the stored page and build files', async () => {
  let offline = false;
  const sw = worker((url) => {
    if (offline) throw new TypeError('Failed to fetch');
    return new Response(url.endsWith('/') ? page : `file ${url}`);
  });
  await sw.dispatch('install', {});
  offline = true;
  const shell = await sw.dispatch('fetch', {
    request: request('/', 'navigate'),
  });
  assert.equal(await shell?.text(), page);
  const script = await sw.dispatch('fetch', {
    request: request('/_next/static/chunks/main.js'),
  });
  assert.equal(
    await script?.text(),
    `file ${origin}/_next/static/chunks/main.js`,
  );
  const stored = [...sw.stores.values()].flatMap((store) => [...store.keys()]);
  assert.ok(stored.every((url) => !new URL(url).pathname.startsWith('/api')));
});
