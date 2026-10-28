/** Request and response header carrying the client's latest D1 bookmark. */
export const BOOKMARK_HEADER = 'X-Ordo-Bookmark';
const bookmarkShape = /^[A-Za-z0-9-]{1,256}$/;

/** `/api/health` → `/health`; `/api/<path>` → `/v1/<path>`. */
export function apiPath(pathname: string) {
  if (pathname === '/api/health') return '/health';
  return `/v1${pathname.slice('/api'.length)}`;
}

/**
 * Opens a D1 Sessions API session from the client's bookmark so it reads its
 * own saves. A missing or malformed bookmark starts unconstrained.
 */
export function openSession(db: D1Database, bookmark: string | null) {
  const start =
    bookmark && bookmarkShape.test(bookmark) ? bookmark : 'first-unconstrained';
  try {
    return db.withSession(start);
  } catch {
    return db.withSession('first-unconstrained');
  }
}
