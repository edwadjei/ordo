'use client';
import { useEffect, useRef, useState } from 'react';
import type { Note } from '@ordo/client';
import { saveLatest } from '@ordo/client/autosave';
import { api } from '../lib/workspace';
import { Dialog } from './dialog';
export function NoteEditor({
  note,
  onClose,
  onSaved,
}: {
  note: Note;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [title, setTitle] = useState(note.title),
    [body, setBody] = useState(note.body),
    [state, setState] = useState<'saved' | 'unsaved' | 'saving' | 'error'>(
      'saved',
    ),
    [error, setError] = useState('');
  const revision = useRef(note.revision),
    saved = useRef({ title: note.title, body: note.body }),
    running = useRef(false),
    latest = useRef({ title, body }),
    mounted = useRef(true);
  latest.current = { title, body };
  async function save() {
    if (running.current) return;
    if (!latest.current.title.trim()) {
      setState('error');
      setError('Give your note a title to save it.');
      return;
    }
    running.current = true;
    setState('saving');
    setError('');
    try {
      // Serialize revisions and immediately drain edits made during an in-flight save.
      // Debounce timers alone can expire while the previous request is still running.
      await saveLatest(
        () => ({ ...latest.current }),
        async (value) => {
          if (!value.title.trim())
            throw new Error('Give your note a title to save it.');
          const updated = await api.updateNote(note.id, {
            ...value,
            expectedRevision: revision.current,
          });
          revision.current = updated.revision;
          saved.current = value;
        },
        (a, b) => a.title === b.title && a.body === b.body,
        () => mounted.current,
      );
      if (mounted.current)
        setState(
          latest.current.title === saved.current.title &&
            latest.current.body === saved.current.body
            ? 'saved'
            : 'unsaved',
        );
      // Updating the list is independent of draft persistence; it must not hold the save lock.
      void onSaved().catch(() => {
        if (mounted.current)
          setError('Your note was saved, but the list could not refresh.');
      });
    } catch (error) {
      if (mounted.current) {
        setState('error');
        setError((error as Error).message);
      }
    } finally {
      running.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (title === saved.current.title && body === saved.current.body) return;
    setState('unsaved');
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [title, body]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (
        latest.current.title !== saved.current.title ||
        latest.current.body !== saved.current.body
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  function close() {
    const dirty = title !== saved.current.title || body !== saved.current.body;
    if (
      dirty &&
      !window.confirm(
        'This note has unsaved changes. Stay here to retry saving, or close and discard those edits?',
      )
    )
      return;
    onClose();
  }
  return (
    <Dialog title="A place for your thoughts" drawer onClose={close}>
      <div className={`note-save-state ${state}`} role="status">
        {state === 'saved'
          ? 'Saved'
          : state === 'saving'
            ? 'Saving…'
            : state === 'error'
              ? 'Not saved — your text is still here'
              : 'Unsaved changes'}
      </div>
      <label>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
        />
      </label>
      <label>
        Note
        <textarea
          autoFocus
          data-autofocus
          className="note-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write freely. You can organize it later."
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error} Your current text has been preserved in this editor. Copy it
          before closing if the conflict needs resolving.
        </p>
      )}
      <button
        className="primary"
        disabled={state === 'saving' || state === 'saved'}
        onClick={() => void save()}
      >
        Save now
      </button>
      <p className="privacy-note">
        Plain-text notes · Autosave after you pause typing.
        <br />
        No AI processing or external sharing.
      </p>
    </Dialog>
  );
}
