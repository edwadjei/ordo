'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  GitMerge,
  LoaderCircle,
  Mail,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  RequestError,
  requestId,
  type HomeSnapshot,
  type Note,
} from '@ordo/client';
import type { CaptureRun, CaptureSaveResult } from '@ordo/client/capture';
import { api } from '../lib/workspace';
import {
  destinationReady,
  editDraft,
  editTask,
  mergeTasks,
  removeItem,
  saveBody,
  saveProblem,
  startReview,
  taskGroups,
  type Destination,
  type Review,
  type ReviewTask,
} from '../lib/capture-review';
import { Dialog } from './dialog';

type Phase =
  | { step: 'choose' }
  | { step: 'processing' }
  | { step: 'later'; run: CaptureRun | null; reason: string }
  | { step: 'review' }
  | { step: 'saved'; result: CaptureSaveResult };

/**
 * Process with AI: choose where the capture belongs, let the AI suggest tasks,
 * follow-ups and drafts, review them, and save only what you keep. If AI
 * can't run, the capture stays as it is and can be processed later.
 */
export function CaptureFlow({
  data,
  note,
  onClose,
  onSaved,
  onOpenTask,
  onOpenDrafts,
}: {
  data: HomeSnapshot;
  note: Note;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onOpenTask: (id: string) => void;
  onOpenDrafts: (projectId: string | null, workspaceId: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ step: 'choose' });
  const [workspaceId, setWorkspaceId] = useState(
    note.workspaceId || data.workspaces[0]?.id || '',
  );
  const [projectId, setProjectId] = useState<string>(note.projectId || '');
  const [review, setReview] = useState<Review | null>(null);
  const [run, setRun] = useState<CaptureRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const control = useRef<AbortController | null>(null);
  const saveKey = useRef(requestId());
  useEffect(() => () => control.current?.abort(), []);

  async function process() {
    setError('');
    setPhase({ step: 'processing' });
    const abort = new AbortController();
    control.current = abort;
    try {
      const next = await api.processNote(
        note.id,
        { workspaceId, projectId: projectId || null },
        abort.signal,
      );
      if (abort.signal.aborted) return;
      setRun(next);
      const started = startReview(next, {
        workspaceId,
        projectId: projectId || null,
      });
      if (started) {
        setReview(started);
        saveKey.current = requestId();
        setPhase({ step: 'review' });
      } else
        setPhase({
          step: 'later',
          run: next,
          reason:
            next.status === 'pending'
              ? 'AI isn’t available right now.'
              : 'Ordo couldn’t turn this capture into suggestions.',
        });
      void onSaved().catch(() => {});
    } catch (cause) {
      if (abort.signal.aborted) {
        setPhase({ step: 'choose' });
        return;
      }
      setPhase({
        step: 'later',
        run: null,
        reason:
          cause instanceof RequestError
            ? cause.message
            : 'Couldn’t reach Ordo.',
      });
    }
  }
  async function save(mode: 'selected' | 'all') {
    if (!review || !run) return;
    const problem = saveProblem(review, mode);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.saveCaptureRun(
        run.id,
        saveBody(review, mode),
        saveKey.current,
      );
      await onSaved().catch(() => {});
      setPhase({ step: 'saved', result });
    } catch (cause) {
      setError(
        `${(cause as Error).message} Nothing was created; your review is still here.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const close = () => {
    if (phase.step === 'processing') control.current?.abort();
    if (
      phase.step === 'review' &&
      !window.confirm(
        'Close without saving? The capture stays as it is; these suggestions are not kept.',
      )
    )
      return;
    onClose();
  };
  const projects = data.projects.filter((p) => p.workspaceId === workspaceId);
  return (
    <Dialog
      title={
        phase.step === 'review'
          ? 'Review what Ordo found.'
          : phase.step === 'saved'
            ? 'Saved.'
            : 'Process with AI.'
      }
      eyebrow="AI CAPTURE"
      drawer
      onClose={close}
    >
      <p className="detail-context">
        <FileText size={12} aria-hidden="true" /> {note.title}
      </p>
      {phase.step === 'choose' && (
        <div className="capture-choose">
          <p className="muted">
            Ordo reads this capture and suggests tasks, follow-ups and drafts
            for you to review. Nothing is created until you save. Only this
            workspace’s project names go with it.
          </p>
          {data.workspaces.length ? (
            <div className="field-grid">
              <label>
                Workspace
                <select
                  value={workspaceId}
                  onChange={(event) => {
                    setWorkspaceId(event.target.value);
                    setProjectId('');
                  }}
                >
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
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">Let Ordo suggest</option>
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <p className="error">Create a workspace first, then process.</p>
          )}
          <div className="form-actions">
            <button
              className="primary"
              disabled={!workspaceId || !note.body.trim()}
              onClick={() => void process()}
            >
              <Sparkles size={14} aria-hidden="true" /> Process with AI
            </button>
            {!note.body.trim() && (
              <span className="muted small">This note has no text yet.</span>
            )}
          </div>
        </div>
      )}
      {phase.step === 'processing' && (
        <div className="capture-progress" role="status" aria-live="polite">
          <LoaderCircle size={22} className="spin" aria-hidden="true" />
          <p>
            <strong>Reading your capture…</strong>
            <br />
            <span className="muted">
              This can take a little while for a long transcript.
            </span>
          </p>
          <button
            className="secondary"
            onClick={() => control.current?.abort()}
          >
            Cancel
          </button>
        </div>
      )}
      {phase.step === 'later' && (
        <div className="capture-later" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <div>
            <strong>{phase.reason}</strong>
            <p className="muted">
              Your capture is saved exactly as it was. It stays marked{' '}
              <em>Not processed</em> so you can come back to it.
            </p>
            <div className="form-actions">
              <button className="primary" onClick={onClose}>
                <Clock3 size={14} aria-hidden="true" /> Process later
              </button>
              <button className="secondary" onClick={() => void process()}>
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
      {phase.step === 'review' && review && (
        <ReviewScreen
          data={data}
          review={review}
          onChange={setReview}
          busy={busy}
          error={error}
          onSave={(mode) => void save(mode)}
        />
      )}
      {phase.step === 'saved' && (
        <div className="capture-saved">
          <p role="status">
            <CheckCircle2 size={16} aria-hidden="true" /> Created{' '}
            {phase.result.tasks.length}{' '}
            {phase.result.tasks.length === 1 ? 'task' : 'tasks'} and{' '}
            {phase.result.drafts.length}{' '}
            {phase.result.drafts.length === 1 ? 'draft' : 'drafts'}, linked to
            this capture.
          </p>
          {phase.result.tasks.length > 0 && (
            <ul className="created-list">
              {phase.result.tasks.map((task) => (
                <li key={task.id}>
                  <button
                    className="text-button"
                    onClick={() => onOpenTask(task.id)}
                  >
                    {task.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {phase.result.drafts.length > 0 && (
            <ul className="created-list">
              {phase.result.drafts.map((draft) => (
                <li key={draft.id}>
                  <button
                    className="text-button"
                    onClick={() =>
                      onOpenDrafts(
                        review?.destination.projectId ?? null,
                        review?.destination.workspaceId || workspaceId,
                      )
                    }
                  >
                    <Mail size={12} aria-hidden="true" />{' '}
                    {draft.subject || 'Draft message'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </Dialog>
  );
}

function ReviewScreen({
  data,
  review,
  onChange,
  busy,
  error,
  onSave,
}: {
  data: HomeSnapshot;
  review: Review;
  onChange: (review: Review) => void;
  busy: boolean;
  error: string;
  onSave: (mode: 'selected' | 'all') => void;
}) {
  const groups = taskGroups(review);
  const selectedCount = [...review.tasks, ...review.drafts].filter(
    (item) => item.selected,
  ).length;
  const total = review.tasks.length + review.drafts.length;
  const task = (item: ReviewTask) => (
    <TaskSuggestion
      key={item.key}
      data={data}
      item={item}
      batch={review.destination}
      others={review.tasks.filter((other) => other.key !== item.key)}
      onChange={(changes) => onChange(editTask(review, item.key, changes))}
      onRemove={() => onChange(removeItem(review, item.key))}
      onMerge={(other) => onChange(mergeTasks(review, item.key, other))}
    />
  );
  return (
    <div className="capture-review">
      <Group title="Summary">
        <p className="capture-summary">{review.summary || 'No summary.'}</p>
      </Group>
      <Group title="Suggested destination">
        <DestinationPicker
          data={data}
          value={review.destination}
          lockWorkspace
          onChange={(destination) => onChange({ ...review, destination })}
        />
        <p
          className={`field-hint ${review.confidence === 'low' ? 'warm-text' : ''}`}
        >
          {review.confidence === 'low'
            ? `Ordo isn’t sure where this belongs, so it is unassigned until you choose. ${review.reason}`
            : review.reason}
        </p>
      </Group>
      <Group title="Tasks" count={groups.tasks.length}>
        {groups.tasks.length ? (
          groups.tasks.map(task)
        ) : (
          <p className="section-empty">No tasks suggested.</p>
        )}
      </Group>
      <Group title="Follow-ups" count={groups.followUps.length}>
        {groups.followUps.length ? (
          groups.followUps.map(task)
        ) : (
          <p className="section-empty">No follow-ups suggested.</p>
        )}
      </Group>
      <Group title="Drafts" count={review.drafts.length}>
        {review.drafts.length ? (
          review.drafts.map((draft) => (
            <fieldset
              key={draft.key}
              className={`suggestion ${draft.selected ? '' : 'is-off'}`}
            >
              <legend className="suggestion-head">
                <label className="suggestion-pick">
                  <input
                    type="checkbox"
                    checked={draft.selected}
                    onChange={(event) =>
                      onChange(
                        editDraft(review, draft.key, {
                          selected: event.target.checked,
                        }),
                      )
                    }
                  />
                  {draft.kind === 'email' ? 'Email draft' : 'Message draft'}
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove draft ${draft.subject || ''}`.trim()}
                  onClick={() => onChange(removeItem(review, draft.key))}
                >
                  <Trash2 size={14} />
                </button>
              </legend>
              <div className="field-grid">
                <label>
                  To
                  <input
                    value={draft.to || ''}
                    maxLength={200}
                    onChange={(event) =>
                      onChange(
                        editDraft(review, draft.key, {
                          to: event.target.value || null,
                        }),
                      )
                    }
                  />
                </label>
                <label>
                  Subject
                  <input
                    value={draft.subject || ''}
                    maxLength={200}
                    onChange={(event) =>
                      onChange(
                        editDraft(review, draft.key, {
                          subject: event.target.value || null,
                        }),
                      )
                    }
                  />
                </label>
              </div>
              <label>
                Text
                <textarea
                  rows={5}
                  value={draft.body}
                  maxLength={20000}
                  onChange={(event) =>
                    onChange(
                      editDraft(review, draft.key, {
                        body: event.target.value,
                      }),
                    )
                  }
                />
              </label>
              <ItemDestination
                data={data}
                value={draft.destination}
                batch={review.destination}
                onChange={(destination) =>
                  onChange(editDraft(review, draft.key, { destination }))
                }
              />
            </fieldset>
          ))
        ) : (
          <p className="section-empty">No drafts suggested.</p>
        )}
        <p className="field-hint">
          Drafts are saved for you to copy. Ordo never sends them.
        </p>
      </Group>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="capture-actions">
        <button
          className="primary"
          disabled={busy || !selectedCount}
          onClick={() => onSave('selected')}
        >
          {busy ? 'Saving…' : `Save selected (${selectedCount})`}
        </button>
        <button
          className="secondary"
          disabled={busy || !total}
          onClick={() => onSave('all')}
        >
          Save all ({total})
        </button>
      </div>
    </div>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="capture-group" aria-label={title}>
      <h3>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function TaskSuggestion({
  data,
  item,
  batch,
  others,
  onChange,
  onRemove,
  onMerge,
}: {
  data: HomeSnapshot;
  item: ReviewTask;
  batch: Destination;
  others: ReviewTask[];
  onChange: (changes: Partial<ReviewTask>) => void;
  onRemove: () => void;
  onMerge: (other: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = `suggestion-${item.key}`;
  return (
    <fieldset className={`suggestion ${item.selected ? '' : 'is-off'}`}>
      <legend className="suggestion-head">
        <label className="suggestion-pick">
          <input
            type="checkbox"
            checked={item.selected}
            aria-label={`Keep ${item.title || 'this task'}`}
            onChange={(event) => onChange({ selected: event.target.checked })}
          />
          <span className="sr-only">Keep</span>
        </label>
        <input
          className="suggestion-title"
          aria-label="Task title"
          value={item.title}
          maxLength={200}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove ${item.title}`}
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </button>
      </legend>
      <p className="suggestion-meta">
        {[
          item.dueDate &&
            `Due ${item.dueDate}${item.dueTime ? ` ${item.dueTime}` : ''}`,
          item.followUpDate &&
            `Follow up ${item.followUpDate}${item.followUpTime ? ` ${item.followUpTime}` : ''}`,
          item.waitingOn && `Waiting on ${item.waitingOn}`,
          item.responsiblePerson && `Responsible: ${item.responsiblePerson}`,
          item.priority &&
            `${item.priority[0].toUpperCase()}${item.priority.slice(1)} priority`,
        ]
          .filter(Boolean)
          .join(' · ') || 'No dates or people'}
        <button
          type="button"
          className="text-button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Done editing' : 'Edit'}
        </button>
      </p>
      {open && (
        <div id={id} className="suggestion-fields">
          <div className="field-grid">
            <label>
              Due
              <input
                type="date"
                value={item.dueDate || ''}
                onChange={(event) =>
                  onChange({
                    dueDate: event.target.value || null,
                    dueTime: event.target.value ? item.dueTime : null,
                  })
                }
              />
            </label>
            <label>
              Due time
              <input
                type="time"
                value={item.dueTime || ''}
                disabled={!item.dueDate}
                onChange={(event) =>
                  onChange({ dueTime: event.target.value || null })
                }
              />
            </label>
            <label>
              Follow up
              <input
                type="date"
                value={item.followUpDate || ''}
                onChange={(event) =>
                  onChange({
                    followUpDate: event.target.value || null,
                    followUpTime: event.target.value ? item.followUpTime : null,
                  })
                }
              />
            </label>
            <label>
              Follow-up time
              <input
                type="time"
                value={item.followUpTime || ''}
                disabled={!item.followUpDate}
                onChange={(event) =>
                  onChange({ followUpTime: event.target.value || null })
                }
              />
            </label>
            <label>
              Responsible
              <input
                value={item.responsiblePerson || ''}
                maxLength={80}
                onChange={(event) =>
                  onChange({ responsiblePerson: event.target.value || null })
                }
              />
            </label>
            <label>
              Waiting on
              <input
                value={item.waitingOn || ''}
                maxLength={80}
                onChange={(event) =>
                  onChange({ waitingOn: event.target.value || null })
                }
              />
            </label>
            <label>
              Priority
              <select
                value={item.priority || ''}
                onChange={(event) =>
                  onChange({
                    priority: (event.target.value ||
                      null) as ReviewTask['priority'],
                  })
                }
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={item.isFollowUp}
                onChange={(event) =>
                  onChange({ isFollowUp: event.target.checked })
                }
              />
              Follow-up
            </label>
          </div>
          {others.length > 0 && (
            <label>
              Merge with
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) onMerge(event.target.value);
                }}
              >
                <option value="">Choose a task to merge into this one…</option>
                {others.map((other) => (
                  <option key={other.key} value={other.key}>
                    {other.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ItemDestination
            data={data}
            value={item.destination}
            batch={batch}
            onChange={(destination) => onChange({ destination })}
          />
        </div>
      )}
    </fieldset>
  );
}

/** Per-item reassign: follows the suggested destination unless changed. */
function ItemDestination({
  data,
  value,
  batch,
  onChange,
}: {
  data: HomeSnapshot;
  value: Destination | null;
  batch: Destination;
  onChange: (value: Destination | null) => void;
}) {
  if (!value)
    return (
      <button
        type="button"
        className="text-button reassign"
        onClick={() =>
          onChange({
            workspaceId: batch.workspaceId,
            projectId: batch.projectId ?? null,
          })
        }
      >
        <GitMerge size={12} aria-hidden="true" /> Put this one somewhere else
      </button>
    );
  return (
    <div className="item-destination">
      <DestinationPicker data={data} value={value} onChange={onChange} />
      <button
        type="button"
        className="text-button"
        onClick={() => onChange(null)}
      >
        Use the suggested destination
      </button>
    </div>
  );
}

function DestinationPicker({
  data,
  value,
  onChange,
  lockWorkspace,
}: {
  data: HomeSnapshot;
  value: Destination;
  onChange: (value: Destination) => void;
  lockWorkspace?: boolean;
}) {
  return (
    <div className="field-grid">
      <label>
        Workspace
        <select
          value={value.workspaceId}
          disabled={lockWorkspace}
          onChange={(event) =>
            onChange({ workspaceId: event.target.value, projectId: null })
          }
        >
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
          value={
            value.projectId === undefined
              ? '__unassigned'
              : value.projectId || ''
          }
          aria-invalid={!destinationReady(value) || undefined}
          onChange={(event) =>
            onChange({
              ...value,
              projectId:
                event.target.value === '__unassigned'
                  ? undefined
                  : event.target.value || null,
            })
          }
        >
          {value.projectId === undefined && (
            <option value="__unassigned">Choose…</option>
          )}
          <option value="">Workspace Inbox</option>
          {data.projects
            .filter((item) => item.workspaceId === value.workspaceId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
