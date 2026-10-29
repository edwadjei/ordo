/**
 * Registers Ordo's service worker (public/sw.js) so the app opens offline.
 * Only the built static export registers it: under `next dev` it would cache
 * hot-reload files, so development never installs one.
 */
export function registerServiceWorker(
  /** Lazily loaded code to fetch first, so it opens offline too (the note editor). */
  preload: () => Promise<unknown> = async () => {},
  enabled = process.env.NODE_ENV === 'production',
) {
  if (!enabled || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('/sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(async (registration) => {
      await idle();
      await preload().catch(() => {});
      return registration;
    })
    .then((registration) =>
      registration.active?.postMessage({
        type: 'ordo-cache-assets',
        urls: loadedAssets(),
      }),
    )
    .catch(() => {
      // Without a worker Ordo still works online; it just won't open offline.
    });
}
function idle() {
  return new Promise<void>((resolve) =>
    'requestIdleCallback' in window
      ? window.requestIdleCallback(() => resolve(), { timeout: 3000 })
      : setTimeout(resolve, 1000),
  );
}
/** Same-origin scripts and styles this page has loaded, for the worker to keep. */
export function loadedAssets(
  entries: { name: string }[] = performance.getEntriesByType('resource'),
  origin = location.origin,
) {
  return [
    ...new Set(
      entries
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(`${origin}/_next/static/`)),
    ),
  ];
}
