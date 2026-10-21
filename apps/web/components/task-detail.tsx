'use client';
import { useState, type FormEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { HomeSnapshot, Task } from '@ordo/client';
import type { TaskChanges } from '@ordo/client';
import { api } from '../lib/workspace';
import { Dialog } from './dialog';
import { knownNames, statusLabels } from '../lib/views';
const editable = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'dueTime',
  'followUpDate',
  'followUpTime',
  'responsiblePerson',
  'waitingOn',
] as const;
const nameOrNull = (value: string | null) => value?.trim() || null;
export function TaskDetail({
  task,
  data,
  onClose,
  onChange,
  onSelect,
}: {
  task: Task;
  data: HomeSnapshot;
  onClose: () => void;
  onChange: () => Promise<unknown>;
  onSelect: (id: string) => void;
}) {
  const [baseline, setBaseline] = useState(task);
  const [draft, setDraft] = useState({ ...task }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [subtask, setSubtask] = useState('');
  const children = data.tasks.filter((item) => item.parentId === task.id);
  const names = knownNames(data.tasks);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const next = {
        ...draft,
        dueTime: draft.dueDate ? draft.dueTime : null,
        followUpTime: draft.followUpDate ? draft.followUpTime : null,
        responsiblePerson: nameOrNull(draft.responsiblePerson),
        waitingOn: nameOrNull(draft.waitingOn),
      };
      // Send only what changed: omitted fields stay as they are on the server.
      const changes: TaskChanges = { expectedRevision: draft.revision };
      for (const key of editable)
        if (next[key] !== baseline[key])
          Object.assign(changes, { [key]: next[key] });
      const updated = await api.updateTask(task.id, changes);
      setDraft(updated);
      setBaseline(updated);
      await onChange();
      setSaved(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addChild(event: FormEvent) {
    event.preventDefault();
    if (!subtask.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.createTask({
        title: subtask.trim(),
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        parentId: task.id,
      });
      setSubtask('');
      await onChange();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (
      !window.confirm(
        'Archive this task? Tasks with active subtasks must have those subtasks archived first.',
      )
    )
      return;
    setBusy(true);
    try {
      await api.archiveTask(task.id, draft.revision);
      await onChange();
      onClose();
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  function field<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }
  function confirmLeave() {
    return (
      !editable.some(
        (key) => (draft[key] || null) !== (baseline[key] || null),
      ) ||
      window.confirm('You have unsaved task edits. Discard them and close?')
    );
  }
  const close = () => {
    if (confirmLeave()) onClose();
  };
  const workspace = data.workspaces.find(
      (item) => item.id === task.workspaceId,
    ),
    project = data.projects.find((item) => item.id === task.projectId);
  return (
    <Dialog title="Task details" drawer onClose={close}>
      <p className="detail-context">
        {workspace?.name || 'Personal Inbox'} {project && ` / ${project.name}`}
      </p>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            Task
            <input
              autoFocus
              value={draft.title}
              onChange={(event) => field('title', event.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            Description
            <textarea
              value={draft.description}
              onChange={(event) => field('description', event.target.value)}
              rows={5}
              placeholder="A little context, if you need it…"
            />
          </label>
          <div className="field-grid">
            <label>
              Status
              <select
                value={draft.status}
                onChange={(event) =>
                  field('status', event.target.value as Task['status'])
                }
              >
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={draft.priority || ''}
                onChange={(event) =>
                  field(
                    'priority',
                    (event.target.value || null) as Task['priority'],
                  )
                }
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <div className="when-grid">
            <div className="when-field">
              <label htmlFor="detail-due-date">Due</label>
              <div className="date-time">
                <input
                  id="detail-due-date"
                  type="date"
                  value={draft.dueDate || ''}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setDraft((prev) => ({
                      ...prev,
                      dueDate: value,
                      dueTime: value ? prev.dueTime : null,
                    }));
                    setSaved(false);
                  }}
                />
                <input
                  type="time"
                  aria-label="Due time (optional)"
                  value={draft.dueTime || ''}
                  disabled={!draft.dueDate}
                  title={draft.dueDate ? undefined : 'Pick a due date first'}
                  onChange={(event) =>
                    field('dueTime', event.target.value || null)
                  }
                />
              </div>
            </div>
            <div className="when-field">
              <label htmlFor="detail-follow-date">Follow up</label>
              <div className="date-time">
                <input
                  id="detail-follow-date"
                  type="date"
                  value={draft.followUpDate || ''}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setDraft((prev) => ({
                      ...prev,
                      followUpDate: value,
                      followUpTime: value ? prev.followUpTime : null,
                    }));
                    setSaved(false);
                  }}
                />
                <input
                  type="time"
                  aria-label="Follow-up time (optional)"
                  value={draft.followUpTime || ''}
                  disabled={!draft.followUpDate}
                  title={
                    draft.followUpDate
                      ? undefined
                      : 'Pick a follow-up date first'
                  }
                  onChange={(event) =>
                    field('followUpTime', event.target.value || null)
                  }
                />
              </div>
            </div>
            <p className="field-hint">
              Times are optional. When a time passes, the task shows under Due
              now on My Day.
            </p>
          </div>
          <div className="field-grid">
            <label>
              Responsible
              <input
                list="known-people"
                value={draft.responsiblePerson || ''}
                onChange={(event) =>
                  field('responsiblePerson', event.target.value || null)
                }
                placeholder="Who owns it?"
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <label>
              Waiting on
              <input
                list="known-people"
                value={draft.waitingOn || ''}
                onChange={(event) =>
                  field('waitingOn', event.target.value || null)
                }
                placeholder="Who are you waiting for?"
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <datalist id="known-people">
              {names.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          {error && (
            <p role="alert" className="error">
              {error} Your edits are still here. Copy them before reloading if
              another version was saved.
            </p>
          )}
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            {saved && (
              <span className="saved">
                <Check size={13} /> Saved
              </span>
            )}
          </div>
        </fieldset>
      </form>
      <section className="subtasks">
        <h3>
          Subtasks <span className="count">{children.length}</span>
        </h3>
        {children.map((child) => (
          <button
            className="subtask"
            key={child.id}
            onClick={() => {
              if (confirmLeave()) onSelect(child.id);
            }}
          >
            <span
              className={
                child.status === 'done' ? 'tiny-check done' : 'tiny-check'
              }
            />
            <span>{child.title}</span>
          </button>
        ))}
        <form onSubmit={addChild} className="inline-add">
          <Plus size={15} />
          <input
            disabled={busy}
            value={subtask}
            onChange={(event) => setSubtask(event.target.value)}
            placeholder="Add a subtask and press Enter"
            aria-label="Subtask title"
            maxLength={200}
          />
          <button disabled={busy || !subtask.trim()}>Add</button>
        </form>
      </section>
      <div className="provenance">
        Created manually · {new Date(task.createdAt).toLocaleDateString()}
        <br />
        Completing a parent does not complete its subtasks.
      </div>
      <button className="danger-link" disabled={busy} onClick={archive}>
        <Trash2 size={14} /> Archive task
      </button>
    </Dialog>
  );
}
