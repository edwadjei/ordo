'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Sun,
  Inbox,
  CalendarDays,
  Clock3,
  Plus,
  Mic,
  FileText,
  Upload,
  Sparkles,
  Search,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  LogOut,
  Check,
  CloudOff,
  RefreshCw,
  ArrowUpRight,
  Folder,
  NotebookPen,
  LoaderCircle,
} from 'lucide-react';
import type { HomeSnapshot, Note, Task } from '@ordo/client';
import { api, useWorkspace } from '../lib/workspace';
import {
  localDate,
  statusLabels,
  taskDepth,
  visibleTasks,
  type View,
} from '../lib/views';
import { Auth } from './auth';
import { Dialog } from './dialog';
import { TaskDetail } from './task-detail';
import { NoteEditor } from './note-editor';
const viewNames: Record<View, string> = {
  day: 'My Day',
  inbox: 'Inbox',
  upcoming: 'Upcoming',
  waiting: 'Waiting On',
  workspace: 'Workspace',
  project: 'Project',
};
export function WorkspaceApp() {
  const work = useWorkspace(),
    { snapshot: data } = work;
  const [view, setView] = useState<View>('day'),
    [workspaceId, setWorkspaceId] = useState<string | null>(null),
    [projectId, setProjectId] = useState<string | null>(null),
    [mobileMenu, setMobileMenu] = useState(false),
    [projectFilter, setProjectFilter] = useState(''),
    [tab, setTab] = useState<'tasks' | 'notes'>('tasks'),
    [showDone, setShowDone] = useState(false),
    [selectedTask, setSelectedTask] = useState<string | null>(null),
    [selectedNote, setSelectedNote] = useState<string | null>(null),
    [modal, setModal] = useState<
      'task' | 'workspace' | 'project' | 'search' | 'planned' | null
    >(null),
    [planned, setPlanned] = useState(''),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [taskBusy, setTaskBusy] = useState<string[]>([]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setModal((current) => (current === 'search' ? null : 'search'));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  function navigate(
    next: View,
    workspace: string | null = null,
    project: string | null = null,
  ) {
    setView(next);
    setWorkspaceId(workspace);
    setProjectId(project);
    setMobileMenu(false);
    setProjectFilter('');
    setTab('tasks');
  }
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    work.setMessage('');
    try {
      await action();
      await work.refresh();
    } catch (error) {
      work.setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function complete(task: Task) {
    setTaskBusy((ids) => [...ids, task.id]);
    try {
      await api.updateTask(task.id, {
        status: task.status === 'done' ? 'todo' : 'done',
        expectedRevision: task.revision,
      });
      await work.refresh();
    } catch (error) {
      work.setMessage((error as Error).message);
    } finally {
      setTaskBusy((ids) => ids.filter((id) => id !== task.id));
    }
  }
  async function quickNote() {
    setBusy(true);
    try {
      const note = await api.createNote({
        title: 'Untitled note',
        workspaceId,
        projectId,
      });
      await work.refresh();
      setSelectedNote(note.id);
    } catch (error) {
      work.setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const workspace = data?.workspaces.find((item) => item.id === workspaceId),
    project = data?.projects.find((item) => item.id === projectId);
  const tasks = useMemo(
    () =>
      data ? visibleTasks(data, view, workspaceId, projectId, showDone) : [],
    [data, view, workspaceId, projectId, showDone],
  );
  const notes =
    data?.notes.filter(
      (item) =>
        (!workspaceId || item.workspaceId === workspaceId) &&
        (!projectId || item.projectId === projectId),
    ) || [];
  if (work.loading)
    return (
      <div className="loading-screen">
        <div className="brand">
          ordo<span>.</span>
        </div>
        <LoaderCircle className="spin" size={22} />
        <p>Making a little room…</p>
      </div>
    );
  if (!data)
    return <Auth onSuccess={work.refresh} initialError={work.message} />;
  const today = localDate(data.user.timezone),
    undated = data.tasks.filter(
      (task) =>
        task.status !== 'done' &&
        !task.dueDate &&
        !task.followUpDate &&
        (!workspaceId || task.workspaceId === workspaceId),
    );
  const waiting = data.tasks.filter(
    (task) =>
      task.status === 'waiting' &&
      (!workspaceId || task.workspaceId === workspaceId),
  );
  const title =
    view === 'project'
      ? project?.name || 'Project'
      : view === 'workspace'
        ? workspace?.name || 'Workspace'
        : viewNames[view];
  const activeTask = data.tasks.find((task) => task.id === selectedTask),
    activeNote = data.notes.find((note) => note.id === selectedNote);
  const pending = work.pending.filter(
    (item) =>
      (!workspaceId || item.input.workspaceId === workspaceId) &&
      (!projectId || item.input.projectId === projectId),
  );
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: data.user.timezone,
  }).format(new Date());
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobileMenu && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileMenu ? 'is-open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <div className="brand">
            ordo<span>.</span>
          </div>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav className="main-nav">
          {(
            [
              { key: 'day', icon: Sun },
              { key: 'inbox', icon: Inbox },
              { key: 'upcoming', icon: CalendarDays },
              { key: 'waiting', icon: Clock3 },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              className={`nav-item ${view === item.key ? 'active' : ''}`}
              onClick={() => navigate(item.key)}
            >
              <item.icon size={17} strokeWidth={1.7} />
              <span>{viewNames[item.key]}</span>
              {item.key === 'waiting' && waiting.length > 0 && (
                <small>{waiting.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-section-label">
          <span>Workspaces</span>
          <button
            className="icon-button"
            aria-label="Create workspace"
            onClick={() => setModal('workspace')}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="workspace-nav">
          {data.workspaces.map((item) => (
            <div key={item.id}>
              <button
                className={`nav-item ${workspaceId === item.id ? 'workspace-active' : ''}`}
                onClick={() => navigate('workspace', item.id)}
              >
                <span
                  className="workspace-dot"
                  style={{ background: item.color }}
                />
                <span>{item.name}</span>
                {workspaceId === item.id ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )}
              </button>
              {workspaceId === item.id && (
                <div className="project-nav">
                  <label className="project-search">
                    <Search size={12} />
                    <input
                      placeholder="Find a project…"
                      aria-label="Filter projects"
                      value={projectFilter}
                      onChange={(event) => setProjectFilter(event.target.value)}
                    />
                  </label>
                  {data.projects
                    .filter(
                      (p) =>
                        p.workspaceId === item.id &&
                        p.name
                          .toLowerCase()
                          .includes(projectFilter.toLowerCase()),
                    )
                    .map((p) => (
                      <button
                        key={p.id}
                        className={`project-nav-item ${projectId === p.id ? 'active' : ''}`}
                        onClick={() => navigate('project', item.id, p.id)}
                      >
                        <span className="project-bullet" />
                        {p.name}
                      </button>
                    ))}
                  <button
                    className="project-nav-item add-project"
                    onClick={() => setModal('project')}
                  >
                    <Plus size={12} />
                    New project
                  </button>
                </div>
              )}
            </div>
          ))}
          {data.workspaces.length === 0 && (
            <p className="nav-empty">
              A space for every part of your life.
              <button onClick={() => setModal('workspace')}>
                Create your first workspace <Plus size={11} />
              </button>
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">
              {data.user.displayName
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <div>
              <strong>{data.user.displayName}</strong>
              <small>Personal workspace</small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              onClick={() =>
                void work
                  .signOut()
                  .catch((error) => work.setMessage(error.message))
              }
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span className="desktop-only">Your workspace</span>
            <span className="crumb-separator desktop-only">/</span>
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <button
              className="search-trigger"
              onClick={() => {
                setQuery('');
                setModal('search');
              }}
            >
              <Search size={15} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <button className="quick-capture" onClick={() => setModal('task')}>
              <Plus size={15} />
              <span>Quick Capture</span>
            </button>
          </div>
        </header>
        <main id="main-content" className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === 'day'
                  ? '01 / MY DAY'
                  : workspace?.name || 'YOUR PERSONAL WORKSPACE'}
              </div>
              <h1>{view === 'day' ? 'Make room for what matters.' : title}</h1>
              <p className="page-description">
                {view === 'day'
                  ? 'Your thoughts, projects, and next steps. All in one calm place.'
                  : view === 'inbox'
                    ? 'A safe place for the things you haven’t sorted yet.'
                    : view === 'waiting'
                      ? 'Keep track of the things that need someone else’s next step.'
                      : view === 'upcoming'
                        ? 'A little space to see what’s ahead in the next seven days.'
                        : project?.description ||
                          'One place for your notes, commitments, and next steps.'}
              </p>
            </div>
            <div className="heading-meta">
              <span>{date}</span>
              <label className="scope-select">
                <select
                  aria-label="Filter workspace"
                  value={workspaceId || ''}
                  onChange={(event) =>
                    navigate(
                      event.target.value ? 'workspace' : 'day',
                      event.target.value || null,
                    )
                  }
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
            </div>
          </div>
          {work.message && (
            <div className="notice" role="status">
              <span>{work.message}</span>
              <button
                aria-label="Dismiss message"
                className="icon-button"
                onClick={() => work.setMessage('')}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="quick-actions">
            {[
              {
                title: 'Add Task',
                hint: 'One thing at a time',
                icon: Plus,
                action: () => setModal('task'),
              },
              {
                title: 'Record',
                hint: 'Planned · voice capture',
                icon: Mic,
                action: () => {
                  setPlanned('Record');
                  setModal('planned');
                },
              },
              {
                title: 'Quick Note',
                hint: 'Get it out of your head',
                icon: NotebookPen,
                action: quickNote,
              },
              {
                title: 'Upload Transcript',
                hint: 'Planned · import a source',
                icon: Upload,
                action: () => {
                  setPlanned('Upload Transcript');
                  setModal('planned');
                },
              },
              {
                title: 'AI Capture',
                hint: 'Planned · review suggestions',
                icon: Sparkles,
                action: () => {
                  setPlanned('AI Capture');
                  setModal('planned');
                },
              },
            ].map((action) => (
              <button
                className="action-card"
                key={action.title}
                onClick={action.action}
                disabled={busy && action.title === 'Quick Note'}
              >
                <action.icon size={23} strokeWidth={1.4} />
                <strong>{action.title}</strong>
                <small>{action.hint}</small>
              </button>
            ))}
          </div>
          <div className="workspace-layout">
            <section className="primary-column">
              <div className="section-heading">
                <div className="section-tabs">
                  <button
                    className={tab === 'tasks' ? 'selected' : ''}
                    onClick={() => setTab('tasks')}
                  >
                    {view === 'day' ? 'Your focus' : 'Tasks'}
                    <span className="count">{tasks.length}</span>
                  </button>
                  <button
                    className={tab === 'notes' ? 'selected' : ''}
                    onClick={() => setTab('notes')}
                  >
                    Notes<span className="count">{notes.length}</span>
                  </button>
                </div>
                {tab === 'tasks' && (
                  <label className="completed-toggle">
                    <input
                      type="checkbox"
                      checked={showDone}
                      onChange={(event) => setShowDone(event.target.checked)}
                    />
                    Show done
                  </label>
                )}
              </div>
              {tab === 'tasks' ? (
                <>
                  {pending.map((item) => (
                    <div className="task-row pending" key={item.key}>
                      <Clock3 size={15} />
                      <div className="task-main">
                        <span>{item.input.title}</span>
                        <small className={item.error ? 'error-text' : ''}>
                          {item.error || 'Saved on this device · Needs sync'}
                        </small>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => void work.sync()}
                      >
                        Retry
                      </button>
                    </div>
                  ))}
                  {tasks.length ? (
                    tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        data={data}
                        today={today}
                        busy={taskBusy.includes(task.id)}
                        onComplete={() => void complete(task)}
                        onOpen={() => setSelectedTask(task.id)}
                      />
                    ))
                  ) : (
                    <Empty
                      title={
                        view === 'day'
                          ? 'A little breathing room.'
                          : view === 'waiting'
                            ? 'Nothing waiting on someone else.'
                            : 'A fresh start.'
                      }
                      text={
                        view === 'day'
                          ? 'Tasks due today and overdue follow-ups will appear here. Add a task whenever you’re ready.'
                          : 'Capture a next step, or keep a thought as a note.'
                      }
                    />
                  )}
                  <button className="add-task" onClick={() => setModal('task')}>
                    <Plus size={15} />
                    Add a task
                  </button>
                  {view === 'day' && undated.length > 0 && (
                    <section className="undated">
                      <div className="section-heading">
                        <h2>
                          Without a date{' '}
                          <span className="count">{undated.length}</span>
                        </h2>
                        <span className="muted small">Ready when you are</span>
                      </div>
                      {undated.slice(0, 8).map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          data={data}
                          today={today}
                          busy={taskBusy.includes(task.id)}
                          onComplete={() => void complete(task)}
                          onOpen={() => setSelectedTask(task.id)}
                        />
                      ))}
                    </section>
                  )}
                </>
              ) : (
                <div className="notes-grid">
                  {notes.length ? (
                    notes.map((note) => (
                      <button
                        className="note-card"
                        key={note.id}
                        onClick={() => setSelectedNote(note.id)}
                      >
                        <FileText size={17} />
                        <h3>{note.title}</h3>
                        <p>
                          {note.body || 'A little space for your thoughts…'}
                        </p>
                        <small>
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </small>
                      </button>
                    ))
                  ) : (
                    <Empty
                      title="Leave yourself a thought."
                      text="Notes stay in the context you choose, ready when you need them."
                    />
                  )}
                  <button
                    className="new-note"
                    onClick={() => void quickNote()}
                    disabled={busy}
                  >
                    <Plus size={17} />
                    New note
                  </button>
                </div>
              )}
              {!data.workspaces.length && (
                <div className="onboarding">
                  <h3>Make it your own.</h3>
                  <p>
                    Create a workspace for work, a side project, or everyday
                    life.
                  </p>
                  <div>
                    <button
                      className="primary"
                      onClick={() => setModal('workspace')}
                    >
                      Create a workspace <Plus size={14} />
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void mutate(() => api.demo())}
                    >
                      {busy ? 'Loading…' : 'Explore fictional examples'}
                    </button>
                  </div>
                  <small>
                    Examples are clearly fictional and added only to your
                    account.
                  </small>
                </div>
              )}
              <footer className="content-footer">
                <span>Small steps. Meaningful progress.</span>
                <button
                  className={`sync-state ${!work.online || work.pending.length ? 'needs-sync' : ''}`}
                  onClick={() => void work.sync()}
                  disabled={work.syncing}
                >
                  {work.syncing ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : !work.online ? (
                    <CloudOff size={12} />
                  ) : work.pending.length ? (
                    <RefreshCw size={12} />
                  ) : (
                    <Check size={12} />
                  )}{' '}
                  {work.syncing
                    ? 'Syncing…'
                    : !work.online
                      ? 'Offline'
                      : work.pending.length
                        ? `${work.pending.length} need sync`
                        : 'Saved'}
                </button>
              </footer>
            </section>
            <aside className="context-column">
              <section className="waiting-card">
                <h2>
                  <Clock3 size={14} />
                  Waiting on<span>{waiting.length}</span>
                </h2>
                {waiting.length ? (
                  waiting.slice(0, 3).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task.id)}
                    >
                      <strong>{task.title}</strong>
                      <small>
                        {data.workspaces.find(
                          (item) => item.id === task.workspaceId,
                        )?.name || 'Inbox'}
                        {task.followUpDate
                          ? ` · Follow up ${task.followUpDate}`
                          : ''}
                      </small>
                    </button>
                  ))
                ) : (
                  <p>
                    No loose ends here.
                    <br />
                    Tasks marked Waiting will appear here.
                  </p>
                )}
              </section>
              <div className="section-heading">
                <h2>Pick up where you left off</h2>
              </div>
              {data.projects
                .filter(
                  (item) => !workspaceId || item.workspaceId === workspaceId,
                )
                .slice(0, 3)
                .map((item) => (
                  <button
                    className="recent-project"
                    key={item.id}
                    onClick={() =>
                      navigate('project', item.workspaceId, item.id)
                    }
                  >
                    <span>
                      <Folder size={15} />
                      {item.name}
                      <ArrowUpRight size={13} />
                    </span>
                    <small>
                      {
                        data.workspaces.find((w) => w.id === item.workspaceId)
                          ?.name
                      }{' '}
                      ·{' '}
                      {
                        data.tasks.filter(
                          (task) =>
                            task.projectId === item.id &&
                            task.status !== 'done',
                        ).length
                      }{' '}
                      open tasks
                    </small>
                  </button>
                ))}
              {data.projects.length === 0 && (
                <p className="context-empty">
                  Your projects will appear here.
                  <br />A little structure, on your terms.
                </p>
              )}
            </aside>
          </div>
        </main>
      </div>
      {modal === 'task' && (
        <CaptureTask
          data={data}
          workspaceId={workspaceId}
          projectId={projectId}
          onClose={() => setModal(null)}
          onSave={work.capture}
        />
      )}
      {(modal === 'workspace' || modal === 'project') && (
        <CreateContainer
          kind={modal}
          workspaceId={workspaceId}
          data={data}
          onClose={() => setModal(null)}
          onSave={work.refresh}
        />
      )}
      {modal === 'planned' && (
        <Dialog title={planned} onClose={() => setModal(null)}>
          <p className="muted">
            {planned === 'Record'
              ? 'Voice recording and transcription are planned for intelligent capture. Microphone access is not requested in this build.'
              : planned === 'Upload Transcript'
                ? 'Transcript import and source review are planned for intelligent capture. No file is uploaded in this build.'
                : 'AI extraction and editable suggestions are planned for a later slice. Your content is not sent to any AI provider.'}
          </p>
          <p className="muted">
            For now, capture it as a task or a note. Your everyday workspace
            works without AI.
          </p>
          <div className="form-actions">
            <button className="primary" onClick={() => setModal('task')}>
              Add a task
            </button>
            <button
              className="secondary"
              onClick={() => {
                setModal(null);
                void quickNote();
              }}
            >
              Quick Note
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'search' && (
        <SearchDialog
          data={data}
          query={query}
          setQuery={setQuery}
          onClose={() => setModal(null)}
          task={(id) => {
            setModal(null);
            setSelectedTask(id);
          }}
          note={(id) => {
            setModal(null);
            setSelectedNote(id);
          }}
          project={(id) => {
            const p = data.projects.find((p) => p.id === id);
            if (p) {
              setModal(null);
              navigate('project', p.workspaceId, p.id);
            }
          }}
        />
      )}
      {activeTask && (
        <TaskDetail
          key={activeTask.id}
          task={activeTask}
          data={data}
          onClose={() => setSelectedTask(null)}
          onChange={work.refresh}
          onSelect={setSelectedTask}
        />
      )}
      {activeNote && (
        <NoteEditor
          key={activeNote.id}
          note={activeNote}
          onClose={() => setSelectedNote(null)}
          onSaved={work.refresh}
        />
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <Sun size={24} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function TaskRow({
  task,
  data,
  today,
  busy,
  onComplete,
  onOpen,
}: {
  task: Task;
  data: HomeSnapshot;
  today: string;
  busy: boolean;
  onComplete: () => void;
  onOpen: () => void;
}) {
  const workspace = data.workspaces.find(
      (item) => item.id === task.workspaceId,
    ),
    project = data.projects.find((item) => item.id === task.projectId);
  return (
    <div
      className={`task-row ${task.status === 'done' ? 'is-done' : ''}`}
      style={{ paddingLeft: taskDepth(task, data.tasks) * 17 }}
    >
      <button
        className="task-check"
        role="checkbox"
        aria-checked={task.status === 'done'}
        aria-label={`${task.status === 'done' ? 'Reopen' : 'Complete'} ${task.title}`}
        disabled={busy}
        onClick={onComplete}
      >
        {busy ? (
          <LoaderCircle size={11} className="spin" />
        ) : task.status === 'done' ? (
          <Check size={11} />
        ) : null}
      </button>
      <button className="task-main" onClick={onOpen}>
        <span>{task.title}</span>
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
          {task.status === 'waiting' && (
            <span className="status-chip">Waiting</span>
          )}
          {task.priority === 'high' && (
            <span className="priority-dot" title="High priority" />
          )}
        </small>
      </button>
      {task.dueDate && (
        <span className={`task-date ${task.dueDate < today ? 'overdue' : ''}`}>
          {task.dueDate === today
            ? 'Today'
            : task.dueDate < today
              ? 'Overdue'
              : new Date(`${task.dueDate}T12:00:00Z`).toLocaleDateString(
                  'en-GB',
                  { day: 'numeric', month: 'short' },
                )}
        </span>
      )}
    </div>
  );
}
function CaptureTask({
  data,
  workspaceId,
  projectId,
  onClose,
  onSave,
}: {
  data: HomeSnapshot;
  workspaceId: string | null;
  projectId: string | null;
  onClose: () => void;
  onSave: (input: {
    title: string;
    workspaceId: string | null;
    projectId: string | null;
  }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(''),
    [workspace, setWorkspace] = useState(workspaceId || ''),
    [project, setProject] = useState(projectId || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({
        title: title.trim(),
        workspaceId: workspace || null,
        projectId: project || null,
      });
      onClose();
    } catch (error) {
      setError(`${(error as Error).message} Your task has not been discarded.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="One thing at a time." onClose={onClose}>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="capture-title">
          Task title
        </label>
        <input
          id="capture-title"
          className="capture-input"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What’s your next step?"
          maxLength={200}
          required
        />
        <details className="capture-options">
          <summary>Choose a destination</summary>
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
        </details>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="primary" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'Add task'}
            <Plus size={14} />
          </button>
          <span className="muted small">Enter to save · No AI needed</span>
        </div>
      </form>
    </Dialog>
  );
}
function CreateContainer({
  kind,
  data,
  workspaceId,
  onClose,
  onSave,
}: {
  kind: 'workspace' | 'project';
  data: HomeSnapshot;
  workspaceId: string | null;
  onClose: () => void;
  onSave: () => Promise<unknown>;
}) {
  const [name, setName] = useState(''),
    [workspace, setWorkspace] = useState(
      workspaceId || data.workspaces[0]?.id || '',
    ),
    [color, setColor] = useState('#7b8fa8'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (kind === 'workspace') await api.createWorkspace({ name, color });
      else await api.createProject({ name, workspaceId: workspace });
      await onSave();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        kind === 'workspace'
          ? 'A space for what matters.'
          : 'Give this project a home.'
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          {kind === 'workspace' ? 'Workspace' : 'Project'} name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={200}
            placeholder={
              kind === 'workspace'
                ? 'Work, personal, a new idea…'
                : 'What are you working on?'
            }
          />
        </label>
        {kind === 'workspace' ? (
          <label>
            Workspace color
            <input
              className="color-input"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
        ) : (
          <label>
            Workspace
            <select
              value={workspace}
              onChange={(event) => setWorkspace(event.target.value)}
              required
            >
              {data.workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={busy || !name.trim() || (kind === 'project' && !workspace)}
        >
          {busy ? 'Creating…' : `Create ${kind}`}
          <Plus size={14} />
        </button>
      </form>
    </Dialog>
  );
}
function SearchDialog({
  data,
  query,
  setQuery,
  onClose,
  task,
  note,
  project,
}: {
  data: HomeSnapshot;
  query: string;
  setQuery: (value: string) => void;
  onClose: () => void;
  task: (id: string) => void;
  note: (id: string) => void;
  project: (id: string) => void;
}) {
  const q = query.trim().toLowerCase(),
    results = [
      ...data.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        type: 'Task',
        scope: t.workspaceId,
        open: () => task(t.id),
      })),
      ...data.notes.map((n) => ({
        id: n.id,
        title: n.title,
        type: 'Note',
        scope: n.workspaceId,
        open: () => note(n.id),
      })),
      ...data.projects.map((p) => ({
        id: p.id,
        title: p.name,
        type: 'Project',
        scope: p.workspaceId,
        open: () => project(p.id),
      })),
    ]
      .filter((item) => !q || item.title.toLowerCase().includes(q))
      .slice(0, 20);
  return (
    <Dialog title="Find a little clarity." onClose={onClose}>
      <div className="search-input">
        <Search size={18} />
        <input
          autoFocus
          aria-label="Search tasks notes and projects"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tasks, notes, projects…"
        />
      </div>
      <div className="search-results">
        {results.map((item) => (
          <button key={`${item.type}:${item.id}`} onClick={item.open}>
            <span>
              {item.title}
              <small>
                {data.workspaces.find((w) => w.id === item.scope)?.name ||
                  'Personal Inbox'}
              </small>
            </span>
            <em>{item.type}</em>
          </button>
        ))}
        {!results.length && (
          <p className="muted">No matches yet. Try a different word.</p>
        )}
      </div>
    </Dialog>
  );
}
