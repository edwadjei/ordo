'use client';
import { useRef, useState, type FormEvent } from 'react';
import { FileUp, Save } from 'lucide-react';
import type { HomeSnapshot } from '@ordo/client';
import { api } from '../lib/workspace';
import {
  acceptedFile,
  fileText,
  noteBodyLimit,
  titleFromEmail,
  titleFromFile,
  transcriptExtensions,
} from '../lib/import-text';
import { Dialog } from './dialog';

export type ImportKind = 'email' | 'transcript';
const numbers = new Intl.NumberFormat('en-GB');

/**
 * Paste an email or pick a transcript file, choose where it goes, check the
 * text, and save it as a note. The file is read in the browser; only its text
 * is sent, and nothing is processed by AI.
 */
export function ImportDialog({
  data,
  initialKind,
  workspaceId,
  projectId,
  onClose,
  onSaved,
}: {
  data: HomeSnapshot;
  initialKind: ImportKind;
  workspaceId: string | null;
  projectId: string | null;
  onClose: () => void;
  onSaved: (noteId: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<ImportKind>(initialKind),
    [text, setText] = useState(''),
    [title, setTitle] = useState(''),
    [titleEdited, setTitleEdited] = useState(false),
    [fileName, setFileName] = useState(''),
    [workspace, setWorkspace] = useState(workspaceId || ''),
    [project, setProject] = useState(projectId || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const tooLong = text.length > noteBodyLimit;
  const body = text.trim();
  function takeText(next: string, suggested: string) {
    setText(next);
    if (!titleEdited) setTitle(suggested);
  }
  async function pick(file: File | undefined) {
    setError('');
    if (!file) return;
    if (!acceptedFile(file.name)) {
      setError(
        `Ordo reads ${transcriptExtensions.join(', ')} files. Save the transcript as one of those, or paste its text.`,
      );
      return;
    }
    try {
      const read = fileText(file.name, await file.text());
      setFileName(file.name);
      setKind('transcript');
      takeText(read, titleFromFile(file.name));
      if (!read) setError('That file has no text to save.');
    } catch {
      setError('Couldn’t read that file. Try again, or paste its text.');
    } finally {
      if (picker.current) picker.current.value = '';
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body || tooLong || !title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const note = await api.createNote({
        title: title.trim(),
        body,
        workspaceId: workspace || null,
        projectId: project || null,
        source: kind,
      });
      await onSaved(note.id);
    } catch (cause) {
      setError(
        `${(cause as Error).message} Your text is still here; nothing was lost.`,
      );
      setBusy(false);
    }
  }
  const dirty = !!text.trim();
  const close = () => {
    if (
      !dirty ||
      window.confirm('Discard this text? It hasn’t been saved as a note.')
    )
      onClose();
  };
  return (
    <Dialog
      title={kind === 'email' ? 'Paste an email.' : 'Bring in a transcript.'}
      eyebrow="SAVE AS A NOTE"
      onClose={close}
    >
      <form onSubmit={submit} className="import-form">
        <div className="segmented" role="radiogroup" aria-label="What is it?">
          {(
            [
              ['transcript', 'Transcript'],
              ['email', 'Email'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={kind === value ? 'selected' : ''}>
              <input
                type="radio"
                name="import-kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="import-file">
          <input
            ref={picker}
            id="import-file"
            type="file"
            className="sr-only"
            accept=".txt,.md,.vtt,.srt,text/plain,text/markdown,text/vtt"
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => picker.current?.click()}
          >
            <FileUp size={14} aria-hidden="true" /> Choose a file
          </button>
          <small>
            {fileName
              ? `Read from ${fileName} on this device`
              : '.txt, .md, .vtt or .srt · read on this device, never uploaded'}
          </small>
        </div>
        <label>
          {kind === 'email' ? 'Email text' : 'Transcript text'}
          <textarea
            data-autofocus
            className="import-text"
            value={text}
            onChange={(event) =>
              takeText(
                event.target.value,
                kind === 'email'
                  ? titleFromEmail(event.target.value)
                  : title || 'Transcript',
              )
            }
            placeholder={
              kind === 'email'
                ? 'Paste the email here, with its subject if you like.'
                : 'Paste a transcript, or choose a file above.'
            }
            rows={9}
            aria-describedby="import-count"
          />
        </label>
        <p
          id="import-count"
          className={`import-count ${tooLong ? 'error' : 'muted'}`}
          role={tooLong ? 'alert' : undefined}
        >
          {tooLong
            ? `This is ${numbers.format(text.length)} characters. A note holds up to ${numbers.format(noteBodyLimit)}, so it can’t be saved. Shorten it or split it into parts.`
            : `${numbers.format(text.length)} of ${numbers.format(noteBodyLimit)} characters`}
        </p>
        <label>
          Note title
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleEdited(true);
            }}
            maxLength={200}
            placeholder={kind === 'email' ? 'Email' : 'Transcript'}
            required
          />
        </label>
        <div className="field-grid">
          <label>
            Workspace
            <select
              value={workspace}
              onChange={(event) => {
                setWorkspace(event.target.value);
                setProject('');
              }}
            >
              <option value="">Personal Inbox</option>
              {data.workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select
              value={project}
              disabled={!workspace}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="">Workspace Inbox</option>
              {data.projects
                .filter((item) => item.workspaceId === workspace)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !body || tooLong || !title.trim()}
          >
            <Save size={14} aria-hidden="true" />
            {busy ? 'Saving…' : 'Save as note'}
          </button>
        </div>
        <p className="privacy-note">
          Saved as text only. Ordo doesn’t keep the file, and nothing here is
          sent to AI. Pulling tasks out of an email or transcript comes later.
        </p>
      </form>
    </Dialog>
  );
}
