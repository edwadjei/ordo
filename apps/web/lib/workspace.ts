'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBookmarkStore,
  createClient,
  RequestError,
  type HomeSnapshot,
  type TaskInput,
} from '@ordo/client';
import {
  drainQueue,
  enqueueTask,
  readQueue,
  type PendingTask,
} from '@ordo/client/offline';
let sessionInvalid: (() => void) | null = null;
export const api = createClient(
  '/api',
  fetch,
  () => sessionInvalid?.(),
  createBookmarkStore(() => globalThis.localStorage),
);
const ownerKey = 'ordo.active-account.v1';
const cacheKey = (id: string) => `ordo.home.v1:${id}`;
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true),
    [online, setOnline] = useState(true);
  const [pending, setPending] = useState<PendingTask[]>([]);
  const [message, setMessage] = useState(''),
    [syncing, setSyncing] = useState(false),
    // True while the view is the last snapshot saved on this device rather
    // than a fresh load: Ordo is then read-only apart from queued task capture.
    [stale, setStale] = useState(false);
  const owner = useRef<string | null>(null),
    epoch = useRef(0),
    running = useRef(false),
    followup = useRef(false);
  const expire = useCallback(() => {
    epoch.current++;
    owner.current = null;
    api.setAccount(null);
    setSnapshot(null);
    setStale(false);
    setPending([]);
    setSyncing(false);
    try {
      localStorage.removeItem(ownerKey);
    } catch {
      /* Account data remains private to its owner key. */
    }
  }, []);
  useEffect(() => {
    sessionInvalid = () => {
      expire();
      setMessage('Your session changed. Sign in again to continue.');
    };
    return () => {
      sessionInvalid = null;
    };
  }, [expire]);
  const cache = useCallback((next: HomeSnapshot) => {
    owner.current = next.user.id;
    api.setAccount(next.user.id);
    setSnapshot(next);
    try {
      localStorage.setItem(ownerKey, next.user.id);
      localStorage.setItem(cacheKey(next.user.id), JSON.stringify(next));
    } catch {
      setMessage(
        'Browser storage is unavailable. Keep this tab open; offline capture may be unavailable.',
      );
    }
    try {
      setPending(readQueue(localStorage, next.user.id));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, []);
  const refresh = useCallback(async () => {
    const generation = epoch.current;
    try {
      const next = await api.home();
      if (generation === epoch.current) {
        cache(next);
        setStale(false);
      }
      return next;
    } catch (error) {
      if (
        generation === epoch.current &&
        error instanceof RequestError &&
        (error.status === 401 || error.code === 'SESSION_CHANGED')
      )
        expire();
      throw error;
    }
  }, [cache, expire]);
  const sync = useCallback(
    async function syncNow() {
      const id = owner.current,
        generation = epoch.current;
      if (!id || !navigator.onLine) return;
      if (running.current) {
        followup.current = true;
        return;
      }
      running.current = true;
      setSyncing(true);
      let fullyDrained = false;
      try {
        const current = await api.me();
        if (generation !== epoch.current || owner.current !== id) return;
        if (current.user.id !== id) {
          expire();
          setMessage(
            'Your account changed in another tab. Sign in again to open the correct workspace.',
          );
          return;
        }
        const count = readQueue(localStorage, id).length;
        const saved = await drainQueue(localStorage, id, (input, key) => {
          if (generation !== epoch.current || owner.current !== id)
            throw new RequestError(
              409,
              'SESSION_CHANGED',
              'The active account changed.',
            );
          return api.createTask(input, key, id);
        });
        fullyDrained = saved === count;
        if (generation !== epoch.current) return;
        setPending(readQueue(localStorage, id));
        await refresh();
      } catch (error) {
        if (generation !== epoch.current) return;
        if (
          error instanceof RequestError &&
          (error.status === 401 || error.code === 'SESSION_CHANGED')
        ) {
          expire();
          setMessage(
            'Sign in again to sync your saved captures for this account.',
          );
        } else
          setMessage(
            'Your captures are saved on this device. Reconnect and retry sync.',
          );
      } finally {
        running.current = false;
        if (generation === epoch.current) setSyncing(false);
        const again = followup.current;
        followup.current = false;
        if (
          again &&
          fullyDrained &&
          generation === epoch.current &&
          owner.current === id &&
          navigator.onLine
        )
          void syncNow();
      }
    },
    [refresh, expire],
  );
  useEffect(() => {
    setOnline(navigator.onLine);
    let active = true;
    const generation = epoch.current;
    api
      .home()
      .then((next) => {
        if (active && generation === epoch.current) {
          cache(next);
          void sync();
        }
      })
      .catch((error) => {
        if (!active || generation !== epoch.current) return;
        if (error instanceof RequestError && error.status === 401) {
          expire();
          return;
        }
        try {
          const id = localStorage.getItem(ownerKey),
            saved = id && localStorage.getItem(cacheKey(id));
          if (saved) {
            cache(JSON.parse(saved));
            setStale(true);
          } else
            setMessage(
              'Could not reach Ordo. Check that the API is running, then retry.',
            );
        } catch {
          setMessage('Could not load your local view. Reconnect and retry.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const connected = () => {
        setOnline(true);
        // A successful sync reloads, which also leaves the saved view.
        void sync();
      },
      disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      active = false;
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, [cache, sync, expire]);
  async function capture(input: Partial<TaskInput> & { title: string }) {
    if (!owner.current) throw new Error('Sign in before adding a task.');
    enqueueTask(localStorage, owner.current, input);
    setPending(readQueue(localStorage, owner.current));
    await sync();
  }
  async function signOut() {
    if (
      pending.length &&
      !window.confirm(
        `You have ${pending.length} captures waiting to sync. They will remain on this device for this account. Sign out anyway?`,
      )
    )
      return false;
    // Invalidate prior reads before logout so a slow response cannot restore the old account UI.
    epoch.current++;
    try {
      await api.logout();
      expire();
      return true;
    } catch (error) {
      if (
        error instanceof RequestError &&
        (error.status === 401 || error.code === 'SESSION_CHANGED')
      )
        expire();
      setMessage((error as Error).message);
      throw error;
    }
  }
  return {
    snapshot,
    loading,
    online,
    stale,
    /** Edits need the API: true when offline or showing the saved view. */
    readOnly: !online || stale,
    pending,
    syncing,
    message,
    setMessage,
    refresh,
    sync,
    capture,
    signOut,
  };
}
