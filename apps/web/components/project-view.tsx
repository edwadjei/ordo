'use client';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  Star,
  Clock3,
  FileText,
  Mic,
  NotebookPen,
  Plus,
  Upload,
} from 'lucide-react';
import type { HomeSnapshot, Note, Task } from '@ordo/client';
import { noteSourceLabel, projectOverview, type Clock } from '../lib/views';
import { Empty, Section } from './task-views';

export const projectTabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'drafts', label: 'Drafts' },
] as const;
export type ProjectTab = (typeof projectTabs)[number]['key'];
export const tabId = (key: ProjectTab) => `project-tab-${key}`;
export const panelId = 'project-tab-panel';

/** Overview · Tasks · Notes · Conversations · Drafts, with arrow-key movement. */
export function ProjectTabs({
  tab,
  counts,
  onChange,
}: {
  tab: ProjectTab;
  counts: Partial<Record<ProjectTab, number>>;
  onChange: (tab: ProjectTab) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  function key(event: KeyboardEvent) {
    const index = projectTabs.findIndex((item) => item.key === tab);
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? projectTabs.length - 1
          : step
            ? (index + step + projectTabs.length) % projectTabs.length
            : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(projectTabs[next].key);
    list.current
      ?.querySelector<HTMLButtonElement>(`#${tabId(projectTabs[next].key)}`)
      ?.focus();
  }
  return (
    <div
      className="section-tabs project-tabs"
      role="tablist"
      aria-label="Project sections"
      ref={list}
      onKeyDown={key}
    >
      {projectTabs.map((item) => (
        <button
          key={item.key}
          id={tabId(item.key)}
          role="tab"
          aria-selected={tab === item.key}
          aria-controls={panelId}
          tabIndex={tab === item.key ? 0 : -1}
          className={tab === item.key ? 'selected' : ''}
          onClick={() => onChange(item.key)}
        >
          {item.label}
          {counts[item.key] !== undefined && (
            <span className="count">{counts[item.key]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Add task, Add note, Record and Upload, all landing in this project. */
export function ProjectActions({
  onTask,
  onNote,
  onRecord,
  onUpload,
  recordHint,
  busy,
}: {
  onTask: () => void;
  onNote: () => void;
  onRecord: () => void;
  onUpload: () => void;
  recordHint?: string;
  busy?: boolean;
}) {
  return (
    <div className="project-actions" aria-label="Add to this project">
      <button onClick={onTask}>
        <Plus size={14} aria-hidden="true" /> Add task
      </button>
      <button onClick={onNote} disabled={busy}>
        <NotebookPen size={14} aria-hidden="true" /> Add note
      </button>
      <button
        onClick={onRecord}
        title={recordHint}
        aria-label={recordHint ? `Record — ${recordHint}` : 'Record'}
      >
        <Mic size={14} aria-hidden="true" /> Record
      </button>
      <button onClick={onUpload}>
        <Upload size={14} aria-hidden="true" /> Upload
      </button>
    </div>
  );
}

export function ProjectOverview({
  data,
  projectId,
  now,
  row,
  onNote,
  onTab,
}: {
  data: HomeSnapshot;
  projectId: string;
  now: Clock;
  row: (task: Task) => ReactNode;
  onNote: (id: string) => void;
  onTab: (tab: ProjectTab) => void;
}) {
  const overview = projectOverview(data, projectId, now);
  return (
    <div className="project-overview">
      <dl className="overview-stats">
        <div>
          <dt>Open</dt>
          <dd>{overview.open.length}</dd>
        </div>
        <div className={overview.overdue.length ? 'is-warm' : ''}>
          <dt>Overdue</dt>
          <dd>{overview.overdue.length}</dd>
        </div>
        <div>
          <dt>Waiting</dt>
          <dd>{overview.waiting.length}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{overview.notes.length}</dd>
        </div>
      </dl>
      {overview.overdue.length > 0 && (
        <Section
          title="Blockers · overdue"
          count={overview.overdue.length}
          tone="warm"
        >
          {overview.overdue.map(row)}
        </Section>
      )}
      <Section
        title="Open tasks"
        count={overview.open.length}
        action={
          overview.open.length > overview.next.length ? (
            <button className="text-button" onClick={() => onTab('tasks')}>
              See all
            </button>
          ) : undefined
        }
      >
        {overview.next.length ? (
          overview.next.map(row)
        ) : (
          <Empty
            compact
            icon={AlertTriangle}
            title="Nothing open."
            text="Add the next step for this project and it will show here."
          />
        )}
      </Section>
      <Section title="Waiting on" count={overview.waiting.length}>
        {overview.waiting.length ? (
          <ul className="overview-waiting">
            {overview.waiting.map((task) => (
              <li key={task.id}>
                <Clock3 size={13} aria-hidden="true" />
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {task.waitingOn
                      ? `Waiting on ${task.waitingOn}`
                      : 'No one named yet'}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-empty">Nothing is waiting on anyone.</p>
        )}
      </Section>
      <Section
        title="Recent notes"
        count={overview.notes.length}
        action={
          overview.notes.length > overview.recentNotes.length ? (
            <button className="text-button" onClick={() => onTab('notes')}>
              See all
            </button>
          ) : undefined
        }
      >
        {overview.recentNotes.length ? (
          <ul className="overview-notes">
            {overview.recentNotes.map((note) => (
              <li key={note.id}>
                <button onClick={() => onNote(note.id)}>
                  <FileText size={14} aria-hidden="true" />
                  <span>
                    <strong>{note.title}</strong>
                    <small>{noteMeta(note)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-empty">No notes in this project yet.</p>
        )}
      </Section>
    </div>
  );
}

function noteMeta(note: Note) {
  const date = new Date(note.updatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  const source = noteSourceLabel(note.source);
  return source ? `${date} · ${source}` : date;
}

export function ComingSoonTab({ kind }: { kind: 'conversations' | 'drafts' }) {
  return (
    <Empty
      icon={kind === 'conversations' ? Mic : FileText}
      title="Coming soon"
      text={
        kind === 'conversations'
          ? 'Conversations will keep a meeting or call linked to the tasks and notes it produced.'
          : 'Drafts will hold emails and messages you prepare for this project. Ordo will never send them for you.'
      }
    />
  );
}

/** A star that favourites a project; favourites sort first everywhere. */
export function FavoriteToggle({
  name,
  favorite,
  busy,
  onToggle,
  className = '',
}: {
  name: string;
  favorite: boolean;
  busy?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`favorite-toggle ${favorite ? 'is-favorite' : ''} ${className}`}
      aria-pressed={favorite}
      aria-label={favorite ? `Unfavourite ${name}` : `Favourite ${name}`}
      title={favorite ? 'Favourite · click to remove' : 'Add to favourites'}
      disabled={busy}
      onClick={onToggle}
    >
      <Star
        size={13}
        strokeWidth={1.8}
        fill={favorite ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
    </button>
  );
}
