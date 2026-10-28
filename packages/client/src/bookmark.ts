/**
 * Read-your-writes bookmark plumbing for the D1 Sessions API (Phase 2).
 *
 * The API may return an `X-Ordo-Bookmark` response header naming the newest
 * database version a request saw. The client keeps the latest value per
 * account and sends it on that account's next request, so a read never lands
 * on a replica older than the user's own last save. Today the API never sends
 * the header, so nothing is stored or sent and behaviour is unchanged.
 */
export const bookmarkHeader = 'X-Ordo-Bookmark';
const prefix = 'ordo.bookmark.v1:';

export interface BookmarkStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface BookmarkStore {
  /** Latest bookmark for this account; `null` account means not signed in yet. */
  get(account: string | null): string | null;
  set(account: string | null, value: string): void;
  clear(account: string | null): void;
  /** On sign-in, carry a bookmark seen before the account was known over to it. */
  adopt(account: string): void;
}

/**
 * Keeps bookmarks in memory and, for known accounts, in storage beside the
 * account-keyed task queue. The pre-sign-in bookmark is memory-only. Storage
 * is optional and every storage failure is ignored: a missing bookmark only
 * means the next read may come from a slightly older replica.
 */
export function createBookmarkStore(
  storage: () => BookmarkStorage | null | undefined = () => null,
): BookmarkStore {
  const memory = new Map<string, string>();
  const anonymous = '';
  const persistent = () => {
    try {
      return storage() ?? null;
    } catch {
      return null;
    }
  };
  const key = (account: string | null) => account ?? anonymous;
  function get(account: string | null) {
    const id = key(account);
    const cached = memory.get(id);
    if (cached !== undefined || id === anonymous) return cached ?? null;
    try {
      const saved = persistent()?.getItem(prefix + id) ?? null;
      if (saved) memory.set(id, saved);
      return saved || null;
    } catch {
      return null;
    }
  }
  function set(account: string | null, value: string) {
    if (!value) return;
    const id = key(account);
    memory.set(id, value);
    if (id === anonymous) return;
    try {
      persistent()?.setItem(prefix + id, value);
    } catch {
      /* Memory still holds it for this tab. */
    }
  }
  function clear(account: string | null) {
    const id = key(account);
    memory.delete(id);
    if (id === anonymous) return;
    try {
      persistent()?.removeItem(prefix + id);
    } catch {
      /* Nothing else to clear. */
    }
  }
  return {
    get,
    set,
    clear,
    adopt(account) {
      const early = memory.get(anonymous);
      memory.delete(anonymous);
      if (early && !get(account)) set(account, early);
    },
  };
}
