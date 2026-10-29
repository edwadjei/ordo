'use client';
import { useEffect, useState, type ComponentProps } from 'react';
import { CloudOff, LoaderCircle, RotateCw } from 'lucide-react';
import type { NoteSummary } from '@ordo/client';
import { cacheNote, cachedNote } from '@ordo/client/note-bodies';
import { api } from '../lib/workspace';
import { openNote, type OpenedNote } from '../lib/open-note';
import { notePreview } from '../lib/views';
import { listPreview, previewIsPartial } from '../lib/notes';
import { Dialog } from './dialog';
import { NoteEditor } from './note-editor';

const storage = () => globalThis.localStorage;

/**
 * Opens a note from a list, which only has a preview: the whole note is
 * fetched first (or read from this device's copy when offline), so the editor
 * never starts from a preview and can't save one over the real note.
 */
export function NoteLoader({
  listed,
  ownerId,
  offline,
  ...editor
}: {
  listed: NoteSummary;
  ownerId: string;
  offline: boolean;
} & Omit<ComponentProps<typeof NoteEditor>, 'note' | 'onRemoteSaved'>) {
  const [opened, setOpened] = useState<OpenedNote | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    setOpened(null);
    openNote({
      listed,
      offline,
      fetchNote: async () => {
        const note = await api.note(listed.id, control.signal);
        cacheNote(storage(), ownerId, note);
        return note;
      },
      cached: () => {
        try {
          return cachedNote(storage(), ownerId, listed.id);
        } catch {
          return null;
        }
      },
    })
      .then((result) => {
        if (!control.signal.aborted) setOpened(result);
      })
      .catch(() => {});
    return () => control.abort();
    // Fetch again only for another note, a retry, or a change of connection.
  }, [listed.id, ownerId, offline, attempt]);

  if (!opened)
    return (
      <Dialog title="A place for your thoughts" drawer onClose={editor.onClose}>
        <p className="note-loading" role="status">
          <LoaderCircle size={14} className="spin" aria-hidden="true" />
          Opening “{listed.title}”…
        </p>
      </Dialog>
    );
  if (opened.kind === 'preview')
    return (
      <Dialog title={listed.title} drawer onClose={editor.onClose}>
        <p className="offline-note" role="status">
          <CloudOff size={13} aria-hidden="true" /> {opened.message}
        </p>
        <div className="note-preview-only">
          <p>{notePreview(listPreview(listed), 1000)}</p>
          {previewIsPartial(listed) && (
            <p className="muted small">This is only the start of the note.</p>
          )}
        </div>
        {opened.reason === 'error' && (
          <button
            className="secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            <RotateCw size={13} aria-hidden="true" /> Try again
          </button>
        )}
      </Dialog>
    );
  const fromDevice = opened.from === 'device';
  return (
    <NoteEditor
      {...editor}
      note={opened.note}
      readOnly={editor.readOnly || fromDevice}
      notice={
        fromDevice
          ? opened.outdated
            ? 'This is the copy saved on this device, from before the latest change. Editing needs a connection.'
            : 'This is the copy saved on this device. Editing needs a connection.'
          : undefined
      }
      onRemoteSaved={(note) => cacheNote(storage(), ownerId, note)}
    />
  );
}
