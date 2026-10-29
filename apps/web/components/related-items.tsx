'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Link2,
  LoaderCircle,
  Mail,
  Search,
  Unlink,
} from 'lucide-react';
import type { HomeSnapshot, RelatedItems, Task } from '@ordo/client';
import { api } from '../lib/workspace';
import { listPreview } from '../lib/notes';
import { linkCandidates } from '../lib/related';

/**
 * Task panel › Related: what came from the same capture (tasks and drafts)
 * and notes linked by hand. Each item opens; linking needs a connection.
 */
export function RelatedSection({
  task,
  data,
  readOnly,
  onOpenNote,
  onOpenTask,
  onOpenDrafts,
}: {
  task: Task;
  data: HomeSnapshot;
  readOnly: boolean;
  onOpenNote: (id: string) => void;
  onOpenTask: (id: string) => void;
  onOpenDrafts: (projectId: string | null, workspaceId: string) => void;
}) {
  const [related, setRelated] = useState<RelatedItems | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (readOnly) return;
    const control = new AbortController();
    api
      .related(task.id, false, control.signal)
      .then((result) => {
        if (!control.signal.aborted) setRelated(result);
      })
      .catch((cause) => {
        if (!control.signal.aborted) setError((cause as Error).message);
      });
    return () => control.abort();
  }, [task.id, readOnly, version]);
  const candidates = useMemo(
    () => linkCandidates(data.notes, related?.linkedNotes ?? [], query, task),
    [data.notes, related, query, task],
  );
  async function change(action: () => Promise<unknown>, id: string) {
    setBusy(id);
    setError('');
    try {
      await action();
      setVersion((n) => n + 1);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy('');
    }
  }
  if (readOnly)
    return (
      <section className="related" aria-label="Related">
        <h3>Related</h3>
        <p className="section-empty">Related items need a connection.</p>
      </section>
    );
  const same =
    related?.captureTasks.filter((item) => item.id !== task.id) ?? [];
  return (
    <section className="related" aria-label="Related">
      <h3>Related</h3>
      {!related && !error && (
        <p className="muted small" role="status">
          <LoaderCircle size={12} className="spin" aria-hidden="true" />{' '}
          Loading…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {related && (same.length > 0 || related.drafts.length > 0) && (
        <div className="related-group">
          <h4>From the same capture</h4>
          <ul>
            {same.map((item) => (
              <li key={item.id}>
                <button
                  className="related-link"
                  onClick={() => onOpenTask(item.id)}
                >
                  <span
                    className={
                      item.status === 'done' ? 'tiny-check done' : 'tiny-check'
                    }
                  />
                  {item.title}
                </button>
              </li>
            ))}
            {related.drafts.map((draft) => (
              <li key={draft.id}>
                <button
                  className="related-link"
                  onClick={() =>
                    onOpenDrafts(draft.projectId, draft.workspaceId)
                  }
                >
                  <Mail size={13} aria-hidden="true" />
                  {draft.subject ||
                    (draft.kind === 'email' ? 'Email draft' : 'Message draft')}
                  {draft.usedAt && <small> · used</small>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {related && (
        <div className="related-group">
          <h4>Linked notes</h4>
          {related.linkedNotes.length ? (
            <ul>
              {related.linkedNotes.map((note) => (
                <li key={note.id} className="linked-note">
                  <button
                    className="related-link"
                    onClick={() => onOpenNote(note.id)}
                  >
                    <FileText size={13} aria-hidden="true" />
                    {note.title}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Unlink ${note.title}`}
                    title="Unlink"
                    disabled={busy === note.id}
                    onClick={() =>
                      void change(
                        () => api.unlinkNote(task.id, note.id),
                        note.id,
                      )
                    }
                  >
                    <Unlink size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-empty">No notes linked yet.</p>
          )}
          {picking ? (
            <div className="link-picker">
              <label className="search-input small">
                <Search size={14} aria-hidden="true" />
                <input
                  autoFocus
                  aria-label="Find a note to link"
                  placeholder="Find a note to link…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <ul className="link-results" aria-label="Notes you can link">
                {candidates.length ? (
                  candidates.map((note) => (
                    <li key={note.id}>
                      <button
                        className="related-link"
                        disabled={busy === note.id}
                        onClick={() =>
                          void change(async () => {
                            await api.linkNote(task.id, note.id);
                            setPicking(false);
                            setQuery('');
                          }, note.id)
                        }
                      >
                        <FileText size={13} aria-hidden="true" />
                        <span>
                          {note.title}
                          <small>{listPreview(note).slice(0, 80)}</small>
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="muted small">No notes match.</li>
                )}
              </ul>
              <button className="text-button" onClick={() => setPicking(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="text-button link-note"
              onClick={() => setPicking(true)}
            >
              <Link2 size={12} aria-hidden="true" /> Link a note
            </button>
          )}
        </div>
      )}
    </section>
  );
}
