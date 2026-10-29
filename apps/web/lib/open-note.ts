import type { Note } from '@ordo/client';
import type { CachedNote } from '@ordo/client/note-bodies';

export type OpenedNote =
  /** The whole note: from Ordo, or this device's copy (read-only). */
  | {
      kind: 'full';
      note: Note;
      from: 'server' | 'device';
      /** The device copy is older than the version the list knows about. */
      outdated: boolean;
    }
  /** Only the list's preview is available. */
  | { kind: 'preview'; reason: 'offline' | 'error'; message: string };

/**
 * Opens a note: online it fetches the whole note; when that fails, or when
 * offline, it uses the copy this device kept from an earlier opening; with
 * neither, only the preview can be shown. Never edits from a preview.
 */
export async function openNote({
  listed,
  offline,
  fetchNote,
  cached,
}: {
  listed: Note;
  offline: boolean;
  fetchNote: () => Promise<Note>;
  cached: () => CachedNote | null;
}): Promise<OpenedNote> {
  let failure = '';
  if (!offline) {
    try {
      return {
        kind: 'full',
        note: await fetchNote(),
        from: 'server',
        outdated: false,
      };
    } catch (cause) {
      if ((cause as Error)?.name === 'AbortError') throw cause;
      failure = (cause as Error)?.message || 'Couldn’t reach Ordo.';
    }
  }
  const copy = cached();
  if (copy)
    return {
      kind: 'full',
      from: 'device',
      outdated: copy.revision < listed.revision,
      note: {
        ...listed,
        title: copy.title,
        body: copy.body,
        revision: copy.revision,
        updatedAt: copy.updatedAt,
      },
    };
  return offline
    ? {
        kind: 'preview',
        reason: 'offline',
        message: 'Open online to read the whole note.',
      }
    : {
        kind: 'preview',
        reason: 'error',
        message: `${failure} Only the start of this note is shown.`,
      };
}
