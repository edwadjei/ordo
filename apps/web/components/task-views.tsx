'use client';
import {
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  LoaderCircle,
  Plus,
  Redo2,
  UserRound,
} from 'lucide-react';
import type { HomeSnapshot } from '@ordo/client';
import {
  followUpOverdue,
  hasPassed,
  localNow,
  taskDepth,
  whenLabel,
  type Clock,
  type DayCounts,
  type EverydayTask,
  type Moment,
} from '../lib/views';

type Icon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

/** The user's local clock, refreshed each minute so greetings and "due now" stay true. */
export function useLocalClock(timezone: string) {
  const [now, setNow] = useState(() => localNow(timezone));
  useEffect(() => {
    setNow(localNow(timezone));
    const timer = window.setInterval(() => setNow(localNow(timezone)), 30_000);
    return () => window.clearInterval(timer);
  }, [timezone]);
  return now;
}

export function ScopeSelect({
  data,
  workspaceId,
  onChange,
}: {
  data: HomeSnapshot;
  workspaceId: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <label className="scope-select">
      <select
        aria-label="Filter workspace"
        value={workspaceId || ''}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">All workspaces</option>
        {data.workspaces.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <ChevronDown size={12} />
    </label>
  );
}

export function DayHeader({
  date,
  title,
  summary,
  aside,
}: {
  date: string;
  title: string;
  summary: string;
  aside: ReactNode;
}) {
  return (
    <header className="day-header">
      <div>
        <p className="day-date">{date}</p>
        <h1>{title}</h1>
        <p className="page-description">{summary}</p>
      </div>
      <div className="heading-aside">{aside}</div>
    </header>
  );
}

export function ViewHeader({
  icon: IconComponent,
  context,
  title,
  count,
  countLabel,
  purpose,
  aside,
}: {
  icon: Icon;
  context: string;
  title: string;
  count?: number;
  countLabel?: string;
  purpose: string;
  aside?: ReactNode;
}) {
  return (
    <header className="view-header">
      <span className="view-icon" aria-hidden="true">
        <IconComponent size={20} strokeWidth={1.6} />
      </span>
      <div className="view-heading">
        <p className="view-context">{context}</p>
        <h1>
          {title}
          {count !== undefined && (
            <span
              className="view-count"
              aria-label={countLabel ? `${count} ${countLabel}` : undefined}
            >
              {count}
            </span>
          )}
        </h1>
        <p className="page-description">{purpose}</p>
      </div>
      {aside && <div className="heading-aside">{aside}</div>}
    </header>
  );
}

const chipLabels: Record<keyof DayCounts, string> = {
  today: 'Today',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  waiting: 'Waiting On',
  inbox: 'Inbox',
};
export function CountChips({
  counts,
  onOpen,
}: {
  counts: DayCounts;
  onOpen: (key: keyof DayCounts) => void;
}) {
  return (
    <nav className="count-chips" aria-label="Your day at a glance">
      {(Object.keys(chipLabels) as (keyof DayCounts)[]).map((key) => (
        <button
          key={key}
          className={`count-chip ${counts[key] ? '' : 'is-zero'} ${
            key === 'overdue' && counts[key] ? 'is-warm' : ''
          }`}
          onClick={() => onOpen(key)}
          aria-label={`${chipLabels[key]}: ${counts[key]}${
            key === 'upcoming' ? ' in the next seven days' : ''
          }`}
        >
          <strong>{counts[key]}</strong>
          <span>{chipLabels[key]}</span>
          {key === 'upcoming' && <small>7 days</small>}
        </button>
      ))}
    </nav>
  );
}

export function InlineComposer({
  placeholder,
  hint,
  onAdd,
  inputRef,
  children,
}: {
  placeholder: string;
  hint: string;
  onAdd: (title: string) => Promise<unknown>;
  inputRef?: Ref<HTMLInputElement>;
  children?: ReactNode;
}) {
  const [title, setTitle] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    setTitle('');
    try {
      await onAdd(value);
    } catch (cause) {
      setTitle((current) => current || value);
      setError(`${(cause as Error).message} Your task has not been discarded.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-field">
        <span className="composer-plus" aria-hidden="true">
          {busy ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Plus size={15} strokeWidth={2} />
          )}
        </span>
        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={placeholder}
          aria-label="New task title"
          aria-describedby="composer-hint"
          maxLength={200}
          enterKeyHint="done"
        />
        <button
          className="composer-submit"
          disabled={!title.trim() || busy}
          aria-label="Add task"
        >
          <span>Add</span>
          <CornerDownLeft size={13} />
        </button>
      </div>
      <div className="composer-meta">
        <span id="composer-hint">{hint}</span>
        {children}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function Section({
  id,
  title,
  count,
  tone,
  action,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  tone?: 'now' | 'warm';
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`task-section ${tone ? `tone-${tone}` : ''}`}
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      tabIndex={id ? -1 : undefined}
    >
      <div className="task-section-heading">
        <h2 id={id ? `${id}-title` : undefined}>
          {tone === 'now' && <BellRing size={13} strokeWidth={1.8} />}
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({
  icon: IconComponent,
  title,
  text,
  compact,
}: {
  icon: Icon;
  title: string;
  text: string;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <span className="empty-icon" aria-hidden="true">
        <IconComponent size={20} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function TaskRow({
  task,
  data,
  now,
  busy,
  onComplete,
  onOpen,
  moment,
  variant = 'default',
}: {
  task: EverydayTask;
  data: HomeSnapshot;
  now: Clock;
  busy: boolean;
  onComplete: () => void;
  onOpen: () => void;
  moment?: Moment;
  variant?: 'default' | 'waiting' | 'flat';
}) {
  const today = now.date;
  const workspace = data.workspaces.find(
      (item) => item.id === task.workspaceId,
    ),
    project = data.projects.find((item) => item.id === task.projectId);
  const done = task.status === 'done';
  const due = task.dueDate
    ? { date: task.dueDate, time: task.dueTime || null }
    : null;
  const follow = task.followUpDate
    ? { date: task.followUpDate, time: task.followUpTime || null }
    : null;
  const tone = (value: { date: string; time: string | null }) =>
    done
      ? ''
      : value.date < today
        ? 'overdue'
        : hasPassed(value, now)
          ? 'now'
          : '';
  let when: ReactNode = null;
  if (moment)
    when = (
      <span className="task-when">
        <em className={`kind-pill kind-${moment.kind}`}>
          {moment.kind === 'due' ? 'Due' : 'Follow up'}
        </em>
        <span>{moment.time || 'Any time'}</span>
      </span>
    );
  else if (variant === 'waiting')
    when = (
      <span
        className={`task-when ${followUpOverdue(task, now) && !done ? 'overdue' : ''}`}
      >
        {follow ? (
          <>
            <em>
              {followUpOverdue(task, now) && !done
                ? 'Follow up overdue'
                : 'Follow up'}
            </em>
            <span>{whenLabel(follow.date, follow.time, today)}</span>
          </>
        ) : (
          <em>No follow-up set</em>
        )}
      </span>
    );
  // The earliest moment leads; the other one is shown in the meta line.
  const followFirst =
    !!follow &&
    (!due ||
      `${follow.date}T${follow.time || '99:99'}` <
        `${due.date}T${due.time || '99:99'}`);
  const main = followFirst ? follow : due,
    other = followFirst ? due : follow;
  if (!moment && variant !== 'waiting' && main)
    when = (
      <span className={`task-when ${tone(main)}`}>
        {main.date < today && !done ? (
          <em>{followFirst ? 'Follow-up overdue' : 'Overdue'}</em>
        ) : (
          followFirst && <em>Follow up</em>
        )}
        <span>{whenLabel(main.date, main.time, today)}</span>
      </span>
    );
  return (
    <div
      className={`task-row ${done ? 'is-done' : ''}`}
      style={
        variant === 'flat'
          ? undefined
          : { paddingLeft: taskDepth(task, data.tasks) * 18 }
      }
    >
      <button
        className="task-check"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Reopen' : 'Complete'} ${task.title}`}
        disabled={busy}
        onClick={onComplete}
      >
        {busy ? (
          <LoaderCircle size={11} className="spin" />
        ) : done ? (
          <Check size={11} />
        ) : null}
      </button>
      <button className="task-main" onClick={onOpen}>
        <span className="task-title">{task.title}</span>
        {variant === 'waiting' && (
          <span className="waiting-who">
            <UserRound size={12} strokeWidth={1.8} />
            {task.waitingOn ? (
              <span>
                Waiting on <strong>{task.waitingOn}</strong>
              </span>
            ) : (
              <span className="muted">Add who you’re waiting on</span>
            )}
          </span>
        )}
        <small>
          <i
            className="workspace-dot"
            style={{ background: workspace?.color || '#b9bfc4' }}
          />
          {workspace?.name || 'Personal Inbox'}
          {project && (
            <>
              <ChevronRight size={9} />
              {project.name}
            </>
          )}
          {variant !== 'waiting' && task.status === 'waiting' && (
            <span className="status-chip">Waiting</span>
          )}
          {variant !== 'waiting' && task.waitingOn && (
            <span className="meta-person">
              <UserRound size={10} /> Waiting on {task.waitingOn}
            </span>
          )}
          {task.responsiblePerson && (
            <span className="meta-person">
              Responsible: {task.responsiblePerson}
            </span>
          )}
          {!moment && variant !== 'waiting' && other && (
            <span className={`meta-follow ${tone(other)}`}>
              {followFirst ? (
                'Due'
              ) : (
                <>
                  <Redo2 size={10} /> Follow up
                </>
              )}{' '}
              {whenLabel(other.date, other.time, today)}
            </span>
          )}
          {task.priority === 'high' && (
            <span className="priority-dot" title="High priority">
              <span className="sr-only">High priority</span>
            </span>
          )}
        </small>
      </button>
      {when}
    </div>
  );
}

export function WaitingPreview({
  tasks,
  total,
  now,
  onOpen,
  onSeeAll,
}: {
  tasks: EverydayTask[];
  total: number;
  now: Clock;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <Section
      id="day-waiting"
      title="Waiting on others"
      count={total}
      action={
        <button className="see-all" onClick={onSeeAll}>
          See all <ArrowRight size={12} />
        </button>
      }
    >
      {tasks.length ? (
        <div className="waiting-preview">
          {tasks.map((task) => (
            <button key={task.id} onClick={() => onOpen(task.id)}>
              <UserRound size={14} strokeWidth={1.6} />
              <span>
                <strong>{task.title}</strong>
                <small>
                  {task.waitingOn ? task.waitingOn : 'Someone'}
                  {task.followUpDate && (
                    <span
                      className={
                        followUpOverdue(task, now) ? 'overdue-text' : ''
                      }
                    >
                      {' · Follow up '}
                      {whenLabel(
                        task.followUpDate,
                        task.followUpTime || null,
                        now.date,
                      )}
                    </span>
                  )}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="section-empty">
          Nothing is waiting on anyone. Set a task to Waiting to track a
          hand-off.
        </p>
      )}
    </Section>
  );
}
