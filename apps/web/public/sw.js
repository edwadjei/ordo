// Ordo's service worker: keeps the static web app (HTML, scripts, styles,
// icons) so Ordo opens with no connection. Account data is never cached here;
// the app keeps its own last-loaded snapshot and task queue in localStorage.
// The API (/api/*) always goes to the network.
const CACHE = 'ordo-shell-v1';
const SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(SHELL, { cache: 'no-store' });
      if (response.ok) {
        await cache.put(SHELL, response.clone());
        // One missing file must not stop the worker installing.
        await Promise.all(
          assetsIn(await response.text()).map((url) =>
            cache.add(url).catch(() => {}),
          ),
        );
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

// The page sends the scripts and styles it has loaded, including chunks
// fetched before this worker took control, so they open offline too.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'ordo-cache-assets') return;
  const urls = (event.data.urls || []).filter(cacheable);
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        urls.map(async (url) => {
          if (!(await cache.match(url))) await cache.add(url).catch(() => {});
        }),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApi(url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    // Content-hashed files never change: the cached copy is always right.
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

function isApi(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}
function cacheable(value) {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && !isApi(url);
  } catch {
    return false;
  }
}
function assetsIn(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g))
    if (cacheable(match[1])) found.add(match[1]);
  return [...found];
}
// Navigations: the newest page when online, refreshing the stored copy; the
// stored app page when offline (Ordo is a single page).
async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).pathname === SHELL)
      await cache.put(SHELL, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw error;
  }
}
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}
