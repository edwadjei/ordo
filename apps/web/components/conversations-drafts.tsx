'use client';
import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  FileText,
  LoaderCircle,
  Mail,
  MessageSquare,
  Mic,
  Sparkles,
} from 'lucide-react';
import type { HomeSnapshot, Note } from '@ordo/client';
import type { CaptureRun, Draft } from '@ordo/client/capture';
import { api } from '../lib/workspace';
import { noteSourceLabel } from '../lib/views';
import {
  conversations,
  draftText,
  notProcessed,
  tasksFromNote,
} from '../lib/capture';
import { Empty } from './task-views';

const sourceIcon = (source: string) =>
  source === 'recording' ? Mic : source === 'email' ? Mail : FileText;
const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });

/** Each capture's latest summary, fetched when the list is shown. */
function useSummaries(notes: Note[], enabled: boolean) {
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const ids = notes.map((note) => note.id).join(',');
  useEffect(() => {
    if (!enabled || !ids) return;
    const control = new AbortController();
    for (const id of ids.split(',').slice(0, 20))
      api
        .noteCaptureRuns(id, control.signal)
        .then(({ runs }) => {
          const latest = runs
            .filter((run: CaptureRun) => run.suggestions?.summary)
            .sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || ''),
            )[0];
          if (latest)
            setSummaries((current) => ({
              ...current,
              [id]: latest.suggestions!.summary,
            }));
        })
        .catch(() => {});
    return () => control.abort();
  }, [ids, enabled]);
  return summaries;
}

/**
 * Conversations: notes from a recording, an email or a transcript, each with
 * its AI summary (when processed) and the tasks created from it.
 */
export function ConversationsList({
  data,
  workspaceId,
  projectId,
  online,
  onNote,
  onTask,
  onProcess,
}: {
  data: HomeSnapshot;
  workspaceId: string | null;
  projectId: string | null;
  online: boolean;
  onNote: (id: string) => void;
  onTask: (id: string) => void;
  onProcess: (id: string) => void;
}) {
  const list = conversations(data.notes, { workspaceId, projectId });
  const summaries = useSummaries(list, online);
  if (!list.length)
    return (
      <Empty
        icon={MessageSquare}
        title="No conversations yet."
        text="Record a thought, paste an email or bring in a transcript. It shows here with what came out of it."
      />
    );
  return (
    <ul className="conversation-list">
      {list.map((note) => {
        const Icon = sourceIcon(note.source);
        const created = tasksFromNote(data.tasks, note.id);
        return (
          <li key={note.id} className="conversation">
            <button
              className="conversation-title"
              onClick={() => onNote(note.id)}
            >
              <Icon size={15} aria-hidden="true" />
              <strong>{note.title}</strong>
            </button>
            <small>
              {noteSourceLabel(note.source)} · {shortDate(note.updatedAt)}
              {notProcessed(note) && (
                <span className="not-processed"> · Not processed</span>
              )}
            </small>
            {summaries[note.id] && (
              <p className="conversation-summary">{summaries[note.id]}</p>
            )}
            {created.length > 0 ? (
              <ul
                className="conversation-actions"
                aria-label="Created from this conversation"
              >
                {created.map((task) => (
                  <li key={task.id}>
                    <button
                      className="text-button"
                      onClick={() => onTask(task.id)}
                    >
                      {task.status === 'done' && (
                        <Check size={11} aria-hidden="true" />
                      )}
                      {task.title}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <button
                className="text-button process-link"
                onClick={() => onProcess(note.id)}
              >
                <Sparkles size={12} aria-hidden="true" /> Process with AI
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** My Day's recent conversations, in the side column. */
export function RecentConversations({
  data,
  workspaceId,
  onNote,
}: {
  data: HomeSnapshot;
  workspaceId: string | null;
  onNote: (id: string) => void;
}) {
  const list = conversations(data.notes, { workspaceId }).slice(0, 3);
  if (!list.length) return null;
  return (
    <section className="recent-conversations" aria-label="Recent conversations">
      <div className="section-heading">
        <h2>Recent conversations</h2>
      </div>
      {list.map((note) => {
        const Icon = sourceIcon(note.source);
        const created = tasksFromNote(data.tasks, note.id).length;
        return (
          <button
            key={note.id}
            className="recent-project"
            onClick={() => onNote(note.id)}
          >
            <span>
              <Icon size={15} />
              {note.title}
            </span>
            <small>
              {noteSourceLabel(note.source)} ·{' '}
              {notProcessed(note)
                ? 'Not processed'
                : created
                  ? `${created} ${created === 1 ? 'task' : 'tasks'} created`
                  : shortDate(note.updatedAt)}
            </small>
          </button>
        );
      })}
    </section>
  );
}

/** The project's drafts: copy them elsewhere and mark them used. Never sent. */
export function DraftsList({
  projectId,
  workspaceId,
  online,
  onNote,
}: {
  projectId: string | null;
  workspaceId: string | null;
  online: boolean;
  onNote: (id: string) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!online) return;
    const control = new AbortController();
    setDrafts(null);
    setError('');
    api
      .drafts(
        {
          projectId: projectId || undefined,
          workspaceId: workspaceId || undefined,
        },
        control.signal,
      )
      .then(({ drafts }) => setDrafts(drafts))
      .catch((cause) => {
        if (!control.signal.aborted) setError((cause as Error).message);
      });
    return () => control.abort();
  }, [projectId, workspaceId, online]);
  async function copy(draft: Draft) {
    try {
      await navigator.clipboard.writeText(draftText(draft));
      setCopied(draft.id);
      window.setTimeout(
        () => setCopied((id) => (id === draft.id ? '' : id)),
        2500,
      );
    } catch {
      setError('Couldn’t copy. Select the text and copy it yourself.');
    }
  }
  async function markUsed(draft: Draft) {
    setBusy(draft.id);
    setError('');
    try {
      const updated = await api.markDraftUsed(draft.id, draft.revision);
      setDrafts(
        (list) =>
          list?.map((item) => (item.id === draft.id ? updated : item)) ?? null,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy('');
    }
  }
  if (!online)
    return <p className="section-empty">Drafts need a connection.</p>;
  if (error && !drafts)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!drafts)
    return (
      <p className="muted" role="status">
        <LoaderCircle size={13} className="spin" aria-hidden="true" /> Loading
        drafts…
      </p>
    );
  return (
    <div className="drafts">
      <p className="field-hint">
        Drafts are for you to copy into your email or chat. Ordo never sends
        them.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {drafts.length ? (
        <ul className="draft-list">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className={`draft ${draft.usedAt ? 'is-used' : ''}`}
            >
              <div className="draft-head">
                {draft.kind === 'email' ? (
                  <Mail size={14} aria-hidden="true" />
                ) : (
                  <MessageSquare size={14} aria-hidden="true" />
                )}
                <strong>
                  {draft.subject ||
                    (draft.kind === 'email' ? 'Email draft' : 'Message draft')}
                </strong>
                {draft.usedAt && (
                  <span className="used-badge">
                    Used {shortDate(draft.usedAt)}
                  </span>
                )}
              </div>
              {draft.to && <small>To {draft.to}</small>}
              <p className="draft-body">{draft.body}</p>
              <div className="draft-actions">
                <button className="secondary" onClick={() => void copy(draft)}>
                  {copied === draft.id ? (
                    <>
                      <Check size={13} aria-hidden="true" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={13} aria-hidden="true" /> Copy
                    </>
                  )}
                </button>
                {!draft.usedAt && (
                  <button
                    className="secondary"
                    disabled={busy === draft.id}
                    onClick={() => void markUsed(draft)}
                  >
                    <Check size={13} aria-hidden="true" /> Mark used
                  </button>
                )}
                {draft.sourceNoteId && (
                  <button
                    className="text-button"
                    onClick={() => onNote(draft.sourceNoteId!)}
                  >
                    From capture
                  </button>
                )}
              </div>
              <span className="sr-only" role="status">
                {copied === draft.id ? 'Copied to clipboard' : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          icon={Mail}
          title="No drafts yet."
          text="Process a conversation with AI and keep a suggested email or message. It waits here for you to copy."
        />
      )}
    </div>
  );
}
