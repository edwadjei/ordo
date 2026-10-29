import type { Note } from '@ordo/core';
import type { StorageLike } from './offline.ts';

/**
 * The full text of notes this browser has opened, per account, so they stay
 * readable offline. Lists only carry a preview; the body is fetched when a
 * note opens and kept here. The newest `limit` notes are kept; storage
 * failures are ignored (the note simply isn't available offline).
 */
const prefix = 'ordo.note-bodies.v1:';
export interface CachedNote {
  id: string;
  title: string;
  body: string;
  revision: number;
  updatedAt: string;
  /** When this browser last saw this body, for keeping the newest. */
  cachedAt: string;
}

function read(storage: StorageLike, ownerId: string): CachedNote[] {
  try {
    const value = JSON.parse(storage.getItem(prefix + ownerId) || '[]');
    return Array.isArray(value)
      ? value.filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.body === 'string' &&
            typeof item.revision === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

export function cachedNote(
  storage: StorageLike,
  ownerId: string,
  noteId: string,
): CachedNote | null {
  return read(storage, ownerId).find((item) => item.id === noteId) ?? null;
}

/** Keeps a note's full body; an older revision never replaces a newer one. */
export function cacheNote(
  storage: StorageLike,
  ownerId: string,
  note: Pick<Note, 'id' | 'title' | 'body' | 'revision' | 'updatedAt'>,
  limit = 50,
  now = new Date(),
) {
  if (typeof note.body !== 'string') return;
  const list = read(storage, ownerId);
  const current = list.find((item) => item.id === note.id);
  if (current && current.revision > note.revision) return;
  const next: CachedNote = {
    id: note.id,
    title: note.title,
    body: note.body,
    revision: note.revision,
    updatedAt: note.updatedAt,
    cachedAt: now.toISOString(),
  };
  const kept = [next, ...list.filter((item) => item.id !== note.id)]
    .sort((a, b) => b.cachedAt.localeCompare(a.cachedAt))
    .slice(0, limit);
  try {
    storage.setItem(prefix + ownerId, JSON.stringify(kept));
  } catch {
    // Full or blocked storage: the note just won't open offline.
  }
}

export function forgetNote(
  storage: StorageLike,
  ownerId: string,
  noteId: string,
) {
  const list = read(storage, ownerId);
  if (!list.some((item) => item.id === noteId)) return;
  try {
    storage.setItem(
      prefix + ownerId,
      JSON.stringify(list.filter((item) => item.id !== noteId)),
    );
  } catch {
    /* Ignored, as above. */
  }
}
