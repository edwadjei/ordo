'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertCircle,
  Check,
  CloudOff,
  LoaderCircle,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { RequestError, type Note } from '@ordo/client';
import { saveLatest } from '@ordo/client/autosave';
import { noteSourceLabel, savedAtLabel } from '../lib/views';
import { conversationSources, notProcessed } from '../lib/capture';
import { api } from '../lib/workspace';
import { Dialog } from './dialog';
import { ByAgent } from './agent-names';

// The editor and its Markdown parser load only when a note opens.
const RichNoteBody = dynamic(() => import('./rich-note'), {
  ssr: false,
  loading: () => (
    <p className="muted small" role="status">
      Opening the editor…
    </p>
  ),
});

type SaveState = 'saved' | 'unsaved' | 'saving' | 'offline' | 'error';
export function NoteEditor({
  note,
  onClose,
  onSaved,
  readOnly = false,
  onProcess,
  processHint,
  notice,
  onRemoteSaved,
}: {
  note: Note;
  /** Offline or showing the saved view: the note can be read, not edited. */
  readOnly?: boolean;
  /** Process with AI: suggestions to review; nothing is created until saved. */
  onProcess?: () => void;
  /** Why AI can't run yet (for example "Set up in Settings"). */
  processHint?: string;
  /** Why the note is read-only, when it isn't simply offline. */
  notice?: string;
  /** Each save's full note, to keep this device's copy current. */
  onRemoteSaved?: (note: Note) => void;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [title, setTitle] = useState(note.title),
    [body, setBody] = useState(note.body),
    [state, setState] = useState<SaveState>('saved'),
    [savedAt, setSavedAt] = useState<Date | null>(() => {
      const when = new Date(note.updatedAt);
      return Number.isNaN(when.getTime()) ? null : when;
    }),
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
          onRemoteSaved?.(updated);
        },
        (a, b) => a.title === b.title && a.body === b.body,
        () => mounted.current,
      );
      if (mounted.current) setSavedAt(new Date());
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
      if (!mounted.current) return;
      // A request that never reached the server (no connection) is not a
      // rejected write: say so, and save again once the browser is back online.
      if (!(error instanceof RequestError) || !navigator.onLine) {
        setState('offline');
        setError('');
      } else {
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
    const reconnect = () => {
      if (
        latest.current.title !== saved.current.title ||
        latest.current.body !== saved.current.body
      )
        void save();
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, []);
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
  const actionable =
    state === 'unsaved' || state === 'error' || state === 'offline';
  return (
    <Dialog title="A place for your thoughts" drawer onClose={close}>
      {readOnly && state === 'saved' ? (
        <p className="offline-note" role="status">
          {notice ||
            'You’re viewing a saved copy. Editing notes needs a connection.'}
        </p>
      ) : (
        <div className={`note-save-state is-${state}`} role="status">
          {state === 'saved' ? (
            <>
              <Check size={12} aria-hidden="true" />
              {savedAt
                ? `Saved ${savedAt.toDateString() === new Date().toDateString() ? 'at' : 'on'} ${savedAtLabel(savedAt)}`
                : 'Saved'}
            </>
          ) : state === 'saving' ? (
            <>
              <LoaderCircle size={12} className="spin" aria-hidden="true" />
              Saving…
            </>
          ) : state === 'offline' ? (
            <>
              <CloudOff size={12} aria-hidden="true" />
              {typeof navigator !== 'undefined' && !navigator.onLine
                ? 'Offline — not saved yet. It will save when you’re back online.'
                : 'Couldn’t reach Ordo — not saved yet. Your text is still here.'}
            </>
          ) : state === 'error' ? (
            <>
              <AlertCircle size={12} aria-hidden="true" />
              Not saved — your text is still here
            </>
          ) : (
            <>
              <span className="note-save-dot" aria-hidden="true" />
              Unsaved changes
            </>
          )}
        </div>
      )}
      {(noteSourceLabel(note.source) || onProcess) && (
        <div className="note-capture-bar">
          <ByAgent item={note} className="note-source by-agent" />
          {noteSourceLabel(note.source) && (
            <span className="note-source">
              {noteSourceLabel(note.source)}
              {notProcessed(note) && (
                <span className="not-processed"> · Not processed</span>
              )}
            </span>
          )}
          {onProcess && !readOnly && (
            <button
              type="button"
              className={`process-button ${conversationSources.includes(note.source) ? 'is-offered' : ''}`}
              onClick={() => {
                if (
                  title !== saved.current.title ||
                  body !== saved.current.body
                ) {
                  setError('Save your changes before processing this note.');
                  return;
                }
                onProcess();
              }}
              aria-label={
                processHint
                  ? `Process with AI — ${processHint}`
                  : 'Process with AI'
              }
            >
              <Sparkles size={13} aria-hidden="true" /> Process with AI
              {processHint && <small>{processHint}</small>}
            </button>
          )}
        </div>
      )}
      <label>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          readOnly={readOnly && state === 'saved'}
          maxLength={200}
        />
      </label>
      <RichNoteBody
        value={body}
        onChange={setBody}
        readOnly={readOnly && state === 'saved'}
      />
      {error && (
        <p className="error" role="alert">
          {error} Your current text has been preserved in this editor. Copy it
          before closing if the conflict needs resolving.
        </p>
      )}
      {/* Stays in place (aria-disabled, not removed or disabled) so keyboard
          focus isn't lost when a save finishes; it is only an action while
          there is something to save. */}
      <button
        type="button"
        className={`note-save-button ${actionable ? 'primary' : `is-${state}`}`}
        aria-disabled={!actionable}
        onClick={() => {
          if (actionable) void save();
        }}
      >
        {state === 'saving' ? (
          <>
            <LoaderCircle size={14} className="spin" aria-hidden="true" />
            Saving…
          </>
        ) : state === 'saved' ? (
          <>
            <Check size={14} aria-hidden="true" />
            Saved
          </>
        ) : state === 'unsaved' ? (
          'Save now'
        ) : (
          <>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </>
        )}
      </button>
      <p className="privacy-note">
        Headings, lists, checklists, bold, italic and links, saved as plain
        Markdown text · Saves automatically when you pause typing.
        <br />
        Notes go to AI only when you choose Process with AI, and you review what
        it suggests before anything is saved. Voice notes are transcribed by the
        provider chosen in Settings, and the recording isn’t kept.
      </p>
    </Dialog>
  );
}
