'use client';
import { ThemeSelector } from './theme-selector';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  Settings,
  Star,
  Archive,
  UserRound,
} from 'lucide-react';
import type {
  AudioSettings,
  HomeSnapshot,
  Project,
  Task,
  TaskInput,
  SearchResult,
} from '@ordo/client';
import { api, useWorkspace } from '../lib/workspace';
import {
  addDays,
  dayCounts,
  daySections,
  daySummary,
  defaultTimezone,
  favoritesFirst,
  noteSourceLabel,
  notePreview,
  followUpOverdue,
  greeting,
  initials,
  profileName,
  upcomingGroups,
  visibleTasks,
  waitingTasks,
  whenLabel,
  type DayCounts,
  type View,
} from '../lib/views';
import {
  CountChips,
  DayHeader,
  Empty,
  InlineComposer,
  ScopeSelect,
  Section,
  TaskRow,
  ViewHeader,
  WaitingPreview,
  useLocalClock,
} from './task-views';
import { Auth } from './auth';
import { Dialog } from './dialog';
import { TaskDetail } from './task-detail';
import { NoteLoader } from './note-loader';
import { listPreview, previewIsPartial } from '../lib/notes';
import { Recorder } from './recorder';
import { defaultProvider, unavailableReason } from '../lib/transcription';
import { registerServiceWorker } from '../lib/service-worker';
import { ImportDialog } from './import-dialog';
import { NameSettings } from './name-settings';
import { CaptureFlow } from './capture-flow';
import {
  ConversationsList,
  DraftsList,
  RecentConversations,
} from './conversations-drafts';
import { AiSettingsSection } from './ai-settings';
import { ProjectSettingsDialog } from './project-settings';
import { WorkspaceSettingsDialog } from './workspace-settings';
import {
  archivedItems,
  archivedScope,
  isLastWorkspace,
  withoutArchived,
} from '../lib/organize';
import { notProcessed } from '../lib/capture';
import type { AiSettings } from '@ordo/client/capture';
import { AudioSettingsDialog } from './audio-settings';
import {
  FavoriteToggle,
  ProjectActions,
  ProjectOverview,
  ProjectTabs,
  panelId,
  tabId,
  type ProjectTab,
} from './project-view';
const viewNames: Record<View, string> = {
  day: 'My Day',
  inbox: 'Inbox',
  upcoming: 'Upcoming',
  waiting: 'Waiting On',
  workspace: 'Workspace',
  project: 'Project',
};
const everydayViews: View[] = ['day', 'inbox', 'upcoming', 'waiting'];
export function WorkspaceApp() {
  const work = useWorkspace(),
    { snapshot: everything } = work;
  // Everyday views leave archived workspaces and projects (and their items)
  // out; the sidebar's Archived list uses everything.
  const data = useMemo(
    () => everything && withoutArchived(everything),
    [everything],
  );
  const [audioConfig, setAudioConfig] = useState<{
    ownerId: string;
    settings: AudioSettings;
  } | null>(null);
  useEffect(() => {
    const ownerId = data?.user.id;
    const control = new AbortController();
    let active = true;
    setAudioConfig(null);
    if (ownerId)
      api
        .audioSettings(control.signal)
        .then((settings) => {
          if (active) setAudioConfig({ ownerId, settings });
        })
        .catch(() => {});
    return () => {
      active = false;
      control.abort();
    };
  }, [data?.user.id]);
  const [aiConfig, setAiConfig] = useState<{
    ownerId: string;
    settings: AiSettings;
  } | null>(null);
  useEffect(() => {
    const ownerId = data?.user.id;
    const control = new AbortController();
    setAiConfig(null);
    if (ownerId)
      api
        .aiSettings(control.signal)
        .then((settings) => {
          if (!control.signal.aborted) setAiConfig({ ownerId, settings });
        })
        .catch(() => {});
    return () => control.abort();
  }, [data?.user.id]);
  // The capture being processed with AI, and whether an import should go
  // straight to processing once saved (the AI Capture tile).
  const [captureNote, setCaptureNote] = useState<string | null>(null),
    [processAfterImport, setProcessAfterImport] = useState(false);
  const [view, setView] = useState<View>('day'),
    [workspaceId, setWorkspaceId] = useState<string | null>(null),
    [projectId, setProjectId] = useState<string | null>(null),
    // Workspace filter for the everyday views; kept for the session as views change.
    [scopeId, setScopeId] = useState<string | null>(null),
    [mobileMenu, setMobileMenu] = useState(false),
    [projectFilter, setProjectFilter] = useState(''),
    // Everyday and workspace views use Tasks and Notes; projects add Overview,
    // Conversations and Drafts.
    [tab, setTab] = useState<ProjectTab>('tasks'),
    [showDone, setShowDone] = useState(false),
    [selectedTask, setSelectedTask] = useState<string | null>(null),
    [selectedNote, setSelectedNote] = useState<string | null>(null),
    [modal, setModal] = useState<
      | 'task'
      | 'workspace'
      | 'project'
      | 'search'
      | 'record'
      | 'settings'
      | 'email'
      | 'upload'
      | 'manage'
      | null
    >(null),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [taskBusy, setTaskBusy] = useState<string[]>([]),
    [favoriteBusy, setFavoriteBusy] = useState<string[]>([]),
    [showArchived, setShowArchived] = useState(false),
    [managed, setManaged] = useState<{
      kind: 'workspaces' | 'projects';
      id: string;
    } | null>(null),
    [upcomingDate, setUpcomingDate] = useState('');
  const composerRef = useRef<HTMLInputElement>(null);
  const timezone = data?.user.timezone || defaultTimezone;
  const now = useLocalClock(timezone);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setModal((current) =>
          current === 'search'
            ? null
            : readOnlyRef.current
              ? current
              : 'search',
        );
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => registerServiceWorker(() => import('./rich-note')), []);
  const readOnlyRef = useRef(work.readOnly);
  readOnlyRef.current = work.readOnly;
  const online: Record<string, string> = {
    manage: 'Archiving and deleting',
    workspace: 'A new workspace',
    project: 'A new project',
    record: 'Recording',
    upload: 'Uploading a transcript',
    email: 'Saving an email',
    settings: 'Settings',
    search: 'Search',
  };
  function openModal(next: NonNullable<typeof modal>) {
    if (online[next] && needsConnection(online[next])) return;
    setModal(next);
  }
  /** Shows why an action can't run offline; true when it must stop. */
  function needsConnection(what: string) {
    if (!work.readOnly) return false;
    work.setMessage(
      `${what} needs a connection. Quick task capture still works offline.`,
    );
    return true;
  }
  const isEveryday = everydayViews.includes(view);
  const activeWorkspace = isEveryday ? scopeId : workspaceId;
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
    setTab(next === 'project' ? 'overview' : 'tasks');
    window.scrollTo({ top: 0 });
  }
  function setScope(id: string | null) {
    if (isEveryday) setScopeId(id);
    else navigate(id ? 'workspace' : 'day', id);
  }
  function focusComposer() {
    setTab('tasks');
    window.setTimeout(() => {
      composerRef.current?.focus();
      composerRef.current?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }, 0);
  }
  function openCount(key: keyof DayCounts) {
    if (key === 'upcoming' || key === 'waiting' || key === 'inbox') {
      navigate(key);
      return;
    }
    const target =
      document.getElementById(key === 'overdue' ? 'day-overdue' : 'day-now') ||
      document.getElementById('day-today');
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  }
  async function mutate(action: () => Promise<unknown>) {
    if (needsConnection('This')) return;
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
    if (needsConnection('Completing a task')) return;
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
  /** Opens a workspace's or project's settings (archive, delete). */
  function manageItem(kind: 'workspaces' | 'projects', id: string) {
    if (needsConnection('Archiving and deleting')) return;
    setMobileMenu(false);
    setManaged({ kind, id });
    setModal('manage');
  }
  async function afterArchive(nowArchived: boolean, id: string) {
    await work.refresh().catch(() => {});
    setModal(null);
    // An archived workspace or project leaves the everyday views.
    if (nowArchived && (workspaceId === id || projectId === id))
      navigate('day');
  }
  async function afterDelete() {
    setModal(null);
    setManaged(null);
    setSelectedTask(null);
    setSelectedNote(null);
    navigate('day');
    await work.refresh().catch(() => {});
  }
  async function toggleFavorite(item: Project) {
    if (needsConnection('Changing favourites')) return;
    setFavoriteBusy((ids) => [...ids, item.id]);
    try {
      await api.updateProject(item.id, {
        favorite: !item.favorite,
        expectedRevision: item.revision,
      });
      await work.refresh();
    } catch (error) {
      work.setMessage((error as Error).message);
    } finally {
      setFavoriteBusy((ids) => ids.filter((id) => id !== item.id));
    }
  }
  async function quickNote() {
    if (needsConnection('A new note')) return;
    setBusy(true);
    try {
      const note = await api.createNote({
        title: 'Untitled note',
        workspaceId: activeWorkspace,
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
  const workspace = data?.workspaces.find(
      (item) => item.id === activeWorkspace,
    ),
    project = data?.projects.find((item) => item.id === projectId);
  const tasks = useMemo(
    () =>
      data
        ? visibleTasks(data, view, activeWorkspace, projectId, showDone)
        : [],
    [data, view, activeWorkspace, projectId, showDone],
  );
  const notes =
    data?.notes.filter(
      (item) =>
        (!activeWorkspace || item.workspaceId === activeWorkspace) &&
        (!projectId || item.projectId === projectId) &&
        (view !== 'inbox' || !item.projectId),
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
  const undated = data.tasks.filter(
    (task) =>
      task.status !== 'done' &&
      !task.dueDate &&
      !task.followUpDate &&
      task.status !== 'waiting' &&
      (!activeWorkspace || task.workspaceId === activeWorkspace),
  );
  const counts = dayCounts(data.tasks, now, activeWorkspace),
    sections = daySections(data.tasks, now, activeWorkspace),
    groups = upcomingGroups(data.tasks, now.date, activeWorkspace, projectId),
    upcomingTotal = new Set(
      groups.flatMap((group) => group.items.map((item) => item.task.id)),
    ).size,
    waitingList = waitingTasks(data.tasks, activeWorkspace, projectId),
    waitingAll = waitingTasks(data.tasks).length;
  const title =
    view === 'project'
      ? project?.name || 'Project'
      : view === 'workspace'
        ? workspace?.name || 'Workspace'
        : viewNames[view];
  const scopeName = workspace?.name || 'All workspaces';
  const header =
    view === 'inbox'
      ? {
          icon: Inbox,
          context: scopeName,
          count: tasks.filter((task) => task.status !== 'done').length,
          countLabel: 'to sort',
          purpose:
            'Unsorted tasks and notes. Decide what each one needs: a date, a person, or done.',
        }
      : view === 'upcoming'
        ? {
            icon: CalendarDays,
            context: scopeName,
            count: upcomingTotal,
            countLabel: 'tasks in the next seven days',
            purpose:
              'Your next seven days. Every due date and follow-up, by day.',
          }
        : view === 'waiting'
          ? {
              icon: Clock3,
              context: scopeName,
              count: waitingList.length,
              countLabel: 'waiting',
              purpose:
                'Hand-offs that need someone else’s next step, and when you’ll follow up.',
            }
          : {
              icon: Folder,
              context:
                view === 'project'
                  ? workspace?.name || 'Workspace'
                  : 'Workspace',
              count: tasks.filter((task) => task.status !== 'done').length,
              countLabel: 'open tasks',
              purpose:
                (view === 'project' && project?.description) ||
                'One place for your notes, commitments, and next steps.',
            };
  const tomorrow = addDays(now.date, 1);
  const plannedDate =
    upcomingDate > now.date && upcomingDate <= addDays(now.date, 7)
      ? upcomingDate
      : tomorrow;
  const composer =
    view === 'day'
      ? {
          placeholder: 'Add a task for today…',
          hint: `Lands on Today${workspace ? ` in ${workspace.name}` : ''} · Enter to add`,
        }
      : view === 'inbox'
        ? {
            placeholder: 'Capture something to sort later…',
            hint: `Lands in your ${workspace ? `${workspace.name} ` : ''}Inbox · Enter to add`,
          }
        : view === 'upcoming'
          ? { placeholder: 'Plan something ahead…', hint: 'Due' }
          : view === 'waiting'
            ? {
                placeholder: 'What are you waiting on?',
                hint: 'Added as Waiting · open it to add who and when',
              }
            : {
                placeholder: `Add a task to ${title}…`,
                hint: `Adds to ${title} · Enter to add`,
              };
  async function addFromComposer(value: string) {
    const input: Partial<TaskInput> & { title: string } = {
      title: value,
      workspaceId: activeWorkspace,
      projectId: view === 'inbox' ? null : projectId,
    };
    if (view === 'day') input.dueDate = now.date;
    if (view === 'upcoming') input.dueDate = plannedDate;
    if (view === 'waiting') input.status = 'waiting';
    await work.capture(input);
  }
  const hasNotesTab = view !== 'upcoming' && view !== 'waiting';
  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      data={data}
      now={now}
      variant={view === 'day' ? 'flat' : 'default'}
      busy={taskBusy.includes(task.id)}
      onComplete={() => void complete(task)}
      onOpen={() => setSelectedTask(task.id)}
    />
  );
  const shortDate = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`));
  const scopeSelect = (
    <ScopeSelect
      data={data}
      workspaceId={activeWorkspace}
      onChange={setScope}
    />
  );
  const audioSettings =
    audioConfig?.ownerId === data.user.id ? audioConfig.settings : null;
  const audioReady = !!audioSettings?.configured;
  const archived = archivedItems(everything!);
  const managedProject =
      managed?.kind === 'projects'
        ? everything!.projects.find((item) => item.id === managed.id)
        : undefined,
    managedWorkspace =
      managed?.kind === 'workspaces'
        ? everything!.workspaces.find((item) => item.id === managed.id)
        : undefined;
  const aiSettings =
    aiConfig?.ownerId === data.user.id ? aiConfig.settings : null;
  const aiReady = !!aiSettings?.configured;
  /** Process with AI, or Settings when no AI provider is ready. */
  function processCapture(id: string) {
    if (needsConnection('Processing with AI')) return;
    setSelectedNote(null);
    if (aiReady) setCaptureNote(id);
    else {
      work.setMessage(
        aiSettings
          ? 'Choose how Ordo processes captures in Settings first.'
          : 'AI capture isn’t available right now.',
      );
      if (aiSettings) setModal('settings');
    }
  }
  const activeTask = data.tasks.find((task) => task.id === selectedTask),
    activeNote = data.notes.find((note) => note.id === selectedNote);
  const pending = work.pending.filter(
    (item) =>
      (!activeWorkspace || item.input.workspaceId === activeWorkspace) &&
      (!projectId || item.input.projectId === projectId),
  );
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${now.date}T12:00:00Z`));
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
              {item.key === 'waiting' && waitingAll > 0 && (
                <small>{waitingAll}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-section-label">
          <span>Workspaces</span>
          <button
            className="icon-button"
            aria-label="Create workspace"
            onClick={() => openModal('workspace')}
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
                  {favoritesFirst(
                    data.projects.filter(
                      (p) =>
                        p.workspaceId === item.id &&
                        p.name
                          .toLowerCase()
                          .includes(projectFilter.toLowerCase()),
                    ),
                  ).map((p) => (
                    <div
                      key={p.id}
                      className={`project-nav-row ${projectId === p.id ? 'active' : ''}`}
                    >
                      <button
                        className={`project-nav-item ${projectId === p.id ? 'active' : ''}`}
                        aria-current={projectId === p.id ? 'page' : undefined}
                        onClick={() => navigate('project', item.id, p.id)}
                      >
                        <span className="project-bullet" />
                        {p.name}
                      </button>
                      <FavoriteToggle
                        name={p.name}
                        favorite={!!p.favorite}
                        busy={favoriteBusy.includes(p.id)}
                        onToggle={() => void toggleFavorite(p)}
                      />
                    </div>
                  ))}
                  <button
                    className="project-nav-item add-project"
                    onClick={() => openModal('project')}
                  >
                    <Plus size={12} />
                    New project
                  </button>
                </div>
              )}
            </div>
          ))}
          {archived.workspaces.length + archived.projects.length > 0 && (
            <div className="archived-nav">
              <button
                className="nav-item archived-toggle"
                aria-expanded={showArchived}
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive size={14} aria-hidden="true" />
                <span>Archived</span>
                <small>
                  {archived.workspaces.length + archived.projects.length}
                </small>
              </button>
              {showArchived && (
                <ul aria-label="Archived workspaces and projects">
                  {archived.workspaces.map((item) => (
                    <li key={item.id}>
                      <button
                        className="project-nav-item"
                        onClick={() => manageItem('workspaces', item.id)}
                      >
                        <span
                          className="workspace-dot"
                          style={{ background: item.color }}
                        />
                        {item.name}
                        <small>workspace</small>
                      </button>
                    </li>
                  ))}
                  {archived.projects.map((item) => (
                    <li key={item.id}>
                      <button
                        className="project-nav-item"
                        onClick={() => manageItem('projects', item.id)}
                      >
                        <span className="project-bullet" />
                        {item.name}
                        <small>
                          {
                            everything!.workspaces.find(
                              (w) => w.id === item.workspaceId,
                            )?.name
                          }
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {data.workspaces.length === 0 && (
            <p className="nav-empty">
              A space for every part of your life.
              <button onClick={() => openModal('workspace')}>
                Create your first workspace <Plus size={11} />
              </button>
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item settings-nav"
            onClick={() => {
              setMobileMenu(false);
              openModal('settings');
            }}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
          <div className="profile">
            <span className="avatar" aria-hidden="true">
              {initials(data.user.displayName) || (
                <UserRound size={15} strokeWidth={1.7} />
              )}
            </span>
            <div>
              <strong>{profileName(data.user.displayName)}</strong>
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
            <ThemeSelector />
            <button
              className="search-trigger"
              onClick={() => {
                setQuery('');
                openModal('search');
              }}
            >
              <Search size={15} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="quick-capture"
              aria-label="Quick Capture"
              onClick={() => setModal('task')}
            >
              <Plus size={15} />
              <span>Quick Capture</span>
            </button>
          </div>
        </header>
        <main id="main-content" className="content">
          {view === 'day' ? (
            <DayHeader
              date={date}
              title={greeting(now.hour, data.user.displayName)}
              summary={daySummary(counts, sections.dueNow.length)}
              aside={scopeSelect}
            />
          ) : (
            <ViewHeader
              icon={header.icon}
              context={header.context}
              title={title}
              count={header.count}
              countLabel={header.countLabel}
              purpose={header.purpose}
              aside={
                view === 'project' && project ? (
                  <span className="project-aside">
                    <FavoriteToggle
                      name={project.name}
                      favorite={!!project.favorite}
                      busy={favoriteBusy.includes(project.id)}
                      onToggle={() => void toggleFavorite(project)}
                    />
                    <button
                      type="button"
                      className="favorite-toggle"
                      aria-label={`Project settings for ${project.name}`}
                      title="Description and other names"
                      onClick={() => manageItem('projects', project.id)}
                    >
                      <Settings
                        size={13}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </button>
                    {scopeSelect}
                  </span>
                ) : view === 'workspace' && workspace ? (
                  <span className="project-aside">
                    <button
                      type="button"
                      className="favorite-toggle"
                      aria-label={`Workspace settings for ${workspace.name}`}
                      title="Archive or delete"
                      onClick={() => manageItem('workspaces', workspace.id)}
                    >
                      <Settings
                        size={13}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </button>
                    {scopeSelect}
                  </span>
                ) : (
                  scopeSelect
                )
              }
            />
          )}
          {view === 'day' && <CountChips counts={counts} onOpen={openCount} />}
          {work.readOnly && (
            <div className="offline-banner" role="status">
              <CloudOff size={15} aria-hidden="true" />
              <span>
                <strong>
                  {work.online ? 'Can’t reach Ordo.' : 'You’re offline.'}
                </strong>{' '}
                Showing what this device last loaded. New tasks are kept here
                and sync when you reconnect; editing and notes need a
                connection.
              </span>
              {work.online && (
                <button
                  className="text-button"
                  onClick={() => void work.sync()}
                  disabled={work.syncing}
                >
                  Retry
                </button>
              )}
            </div>
          )}
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
          {view === 'day' &&
            audioSettings &&
            !audioReady &&
            !data.workspaces.length &&
            !data.tasks.length &&
            !data.notes.length && (
              <div className="voice-onboarding">
                <span>
                  Want to capture a thought by voice? Turn it on in Settings.
                </span>
                <button
                  className="text-button"
                  onClick={() => openModal('settings')}
                >
                  Set up voice
                </button>
              </div>
            )}
          {view === 'day' && (
            <div className="quick-actions">
              {[
                {
                  title: 'Add Task',
                  hint: 'One thing at a time',
                  icon: Plus,
                  action: focusComposer,
                },
                {
                  title: 'Record',
                  // Settings not loaded yet (or failed): nothing to offer.
                  // Loaded but not ready: the recorder explains what to set up.
                  hint: audioReady
                    ? 'A thought, out loud'
                    : audioSettings
                      ? 'Set up in Settings'
                      : 'Coming soon',
                  unavailable: !audioSettings,
                  icon: Mic,
                  action: () => openModal('record'),
                },
                {
                  title: 'Quick Note',
                  hint: 'Get it out of your head',
                  icon: NotebookPen,
                  action: quickNote,
                },
                {
                  title: 'Upload Transcript',
                  hint: 'Or paste an email',
                  icon: Upload,
                  action: () => openModal('upload'),
                },
                {
                  title: 'AI Capture',
                  // No vendor or price wording here: Settings explains providers.
                  hint: aiReady
                    ? 'Turn a capture into tasks'
                    : aiSettings
                      ? 'Set up in Settings'
                      : 'Coming soon',
                  unavailable: !aiSettings,
                  icon: Sparkles,
                  action: () => {
                    if (!aiReady) {
                      openModal('settings');
                      return;
                    }
                    setProcessAfterImport(true);
                    openModal('upload');
                  },
                },
              ].map((action) => (
                <button
                  className="action-card"
                  key={action.title}
                  onClick={action.action}
                  disabled={
                    action.unavailable ||
                    (busy && action.title === 'Quick Note')
                  }
                  aria-label={
                    action.unavailable
                      ? `${action.title} — Coming soon`
                      : undefined
                  }
                >
                  <action.icon size={23} strokeWidth={1.4} />
                  <strong>{action.title}</strong>
                  <small>{action.hint}</small>
                </button>
              ))}
            </div>
          )}
          <div className="workspace-layout">
            <section className="primary-column">
              {view === 'project' && project ? (
                <>
                  <ProjectActions
                    busy={busy}
                    onTask={focusComposer}
                    onNote={() => void quickNote()}
                    onRecord={() => openModal('record')}
                    onUpload={() => openModal('upload')}
                    recordHint={
                      audioReady
                        ? undefined
                        : audioSettings
                          ? 'Set up in Settings'
                          : 'Coming soon'
                    }
                  />
                  <div className="section-heading">
                    <ProjectTabs
                      tab={tab}
                      onChange={setTab}
                      counts={{
                        tasks: tasks.filter((task) => task.status !== 'done')
                          .length,
                        notes: notes.length,
                      }}
                    />
                    {tab === 'tasks' && (
                      <label className="completed-toggle">
                        <input
                          type="checkbox"
                          checked={showDone}
                          onChange={(event) =>
                            setShowDone(event.target.checked)
                          }
                        />
                        Show done
                      </label>
                    )}
                  </div>
                </>
              ) : hasNotesTab ? (
                <div className="section-heading">
                  <div className="section-tabs" role="tablist">
                    <button
                      role="tab"
                      aria-selected={tab === 'tasks'}
                      className={tab === 'tasks' ? 'selected' : ''}
                      onClick={() => setTab('tasks')}
                    >
                      {view === 'day' ? 'Your focus' : 'Tasks'}
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === 'notes'}
                      className={tab === 'notes' ? 'selected' : ''}
                      onClick={() => setTab('notes')}
                    >
                      Notes<span className="count">{notes.length}</span>
                    </button>
                  </div>
                  {tab === 'tasks' && view !== 'day' && (
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
              ) : null}
              <div
                className="tab-panel"
                {...(view === 'project'
                  ? {
                      role: 'tabpanel',
                      id: panelId,
                      'aria-labelledby': tabId(tab),
                    }
                  : {})}
              >
                {view === 'project' && project && tab === 'overview' ? (
                  <ProjectOverview
                    data={data}
                    projectId={project.id}
                    now={now}
                    row={row}
                    onNote={setSelectedNote}
                    onTab={setTab}
                  />
                ) : view === 'project' && project && tab === 'conversations' ? (
                  <ConversationsList
                    data={data}
                    workspaceId={project.workspaceId}
                    projectId={project.id}
                    online={!work.readOnly}
                    onNote={setSelectedNote}
                    onTask={setSelectedTask}
                    onProcess={processCapture}
                  />
                ) : view === 'project' && project && tab === 'drafts' ? (
                  <DraftsList
                    key={project.id}
                    projectId={project.id}
                    workspaceId={project.workspaceId}
                    online={!work.readOnly}
                    onNote={setSelectedNote}
                  />
                ) : tab === 'tasks' || !hasNotesTab ? (
                  <>
                    <InlineComposer
                      key={`${view}:${projectId || activeWorkspace || ''}`}
                      inputRef={composerRef}
                      placeholder={composer.placeholder}
                      hint={composer.hint}
                      onAdd={addFromComposer}
                    >
                      {view === 'upcoming' && (
                        <label className="composer-day">
                          <span className="sr-only">Due on</span>
                          <select
                            value={upcomingDate}
                            onChange={(event) =>
                              setUpcomingDate(event.target.value)
                            }
                          >
                            {groups.map((group) => (
                              <option key={group.date} value={group.date}>
                                {group.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={11} />
                        </label>
                      )}
                    </InlineComposer>
                    {pending.map((item) => (
                      <div className="task-row pending" key={item.key}>
                        <Clock3 size={15} />
                        <div className="task-main">
                          <span className="task-title">{item.input.title}</span>
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
                    {view === 'day' ? (
                      <>
                        {sections.dueNow.length > 0 && (
                          <Section
                            id="day-now"
                            title="Due now"
                            count={sections.dueNow.length}
                            tone="now"
                          >
                            {sections.dueNow.map(row)}
                          </Section>
                        )}
                        {sections.overdue.length > 0 && (
                          <Section
                            id="day-overdue"
                            title="Overdue"
                            count={sections.overdue.length}
                            tone="warm"
                          >
                            {sections.overdue.map(row)}
                          </Section>
                        )}
                        <Section
                          id="day-today"
                          title="Today"
                          count={sections.today.length}
                        >
                          {sections.today.length ? (
                            sections.today.map(row)
                          ) : sections.dueNow.length ||
                            sections.overdue.length ? (
                            <p className="section-empty">
                              Nothing else is due today.
                            </p>
                          ) : (
                            <Empty
                              icon={Sun}
                              title="A little breathing room."
                              text="Nothing is due today. Add the one thing you want to move forward and it will land here."
                            />
                          )}
                        </Section>
                        <WaitingPreview
                          tasks={waitingList.slice(0, 3)}
                          total={waitingList.length}
                          now={now}
                          onOpen={setSelectedTask}
                          onSeeAll={() => navigate('waiting')}
                        />
                        {undated.length > 0 && (
                          <Section
                            title="Without a date"
                            count={undated.length}
                            action={
                              <span className="muted small">
                                Ready when you are
                              </span>
                            }
                          >
                            {undated.slice(0, 8).map(row)}
                          </Section>
                        )}
                      </>
                    ) : view === 'upcoming' ? (
                      <div className="day-groups">
                        {upcomingTotal === 0 && (
                          <Empty
                            icon={CalendarDays}
                            title="A clear week ahead."
                            text="Nothing is due or waiting for follow-up in the next seven days. Plan something above and pick its day."
                          />
                        )}
                        {groups.map((group) => (
                          <section
                            className={`day-group ${group.items.length ? '' : 'is-empty'}`}
                            key={group.date}
                            aria-label={group.label}
                          >
                            <h2 className="day-group-title">
                              <span>{group.label}</span>
                              {group.label === 'Tomorrow' && (
                                <small>{shortDate(group.date)}</small>
                              )}
                              {group.items.length > 0 && (
                                <span className="count">
                                  {group.items.length}
                                </span>
                              )}
                            </h2>
                            {group.items.length ? (
                              group.items.map((moment) => (
                                <TaskRow
                                  key={`${moment.task.id}:${moment.kind}`}
                                  task={moment.task}
                                  data={data}
                                  now={now}
                                  moment={moment}
                                  variant="flat"
                                  busy={taskBusy.includes(moment.task.id)}
                                  onComplete={() => void complete(moment.task)}
                                  onOpen={() => setSelectedTask(moment.task.id)}
                                />
                              ))
                            ) : (
                              <button
                                className="day-group-add"
                                onClick={() => {
                                  setUpcomingDate(group.date);
                                  focusComposer();
                                }}
                              >
                                <Plus size={12} /> Nothing yet · Plan something
                              </button>
                            )}
                          </section>
                        ))}
                      </div>
                    ) : view === 'waiting' ? (
                      waitingList.length ? (
                        waitingList.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            data={data}
                            now={now}
                            variant="waiting"
                            busy={taskBusy.includes(task.id)}
                            onComplete={() => void complete(task)}
                            onOpen={() => setSelectedTask(task.id)}
                          />
                        ))
                      ) : (
                        <Empty
                          icon={Clock3}
                          title="No loose ends."
                          text="When you hand something off, add it here. Open it to note who you are waiting on and when to follow up."
                        />
                      )
                    ) : tasks.length ? (
                      tasks.map(row)
                    ) : view === 'inbox' ? (
                      <Empty
                        icon={Inbox}
                        title="Inbox clear."
                        text="Anything you capture without a project lands here, ready to sort when you have a minute."
                      />
                    ) : (
                      <Empty
                        icon={Folder}
                        title="A fresh start."
                        text="Capture a next step above, or keep a thought as a note."
                      />
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
                            {notePreview(listPreview(note)) ||
                              'A little space for your thoughts…'}
                            {previewIsPartial(note) && '…'}
                          </p>
                          <small>
                            {new Date(note.updatedAt).toLocaleDateString(
                              'en-GB',
                            )}
                            {noteSourceLabel(note.source) &&
                              ` · ${noteSourceLabel(note.source)}`}
                            {notProcessed(note) && (
                              <span className="not-processed">
                                {' '}
                                · Not processed
                              </span>
                            )}
                          </small>
                        </button>
                      ))
                    ) : (
                      <Empty
                        icon={NotebookPen}
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
              </div>
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
                      onClick={() => openModal('workspace')}
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
              {view === 'day' && (
                <RecentConversations
                  data={data}
                  workspaceId={activeWorkspace}
                  onNote={setSelectedNote}
                />
              )}
              {view !== 'day' && view !== 'waiting' && (
                <section className="waiting-card">
                  <h2>
                    <Clock3 size={14} />
                    Waiting on<span>{waitingList.length}</span>
                  </h2>
                  {waitingList.length ? (
                    waitingList.slice(0, 3).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTask(task.id)}
                      >
                        <strong>{task.title}</strong>
                        <small>
                          {task.waitingOn ||
                            data.workspaces.find(
                              (item) => item.id === task.workspaceId,
                            )?.name ||
                            'Inbox'}
                          {task.followUpDate && (
                            <span
                              className={
                                followUpOverdue(task, now) ? 'overdue-text' : ''
                              }
                            >
                              {' · Follow up '}
                              {whenLabel(
                                task.followUpDate,
                                task.followUpTime,
                                now.date,
                              )}
                            </span>
                          )}
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
              )}
              <div className="section-heading">
                <h2>Pick up where you left off</h2>
              </div>
              {favoritesFirst(
                data.projects.filter(
                  (item) =>
                    !activeWorkspace || item.workspaceId === activeWorkspace,
                ),
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
                      {item.favorite ? (
                        <Star
                          size={15}
                          fill="currentColor"
                          className="favorite-mark"
                          aria-label="Favourite"
                        />
                      ) : (
                        <Folder size={15} />
                      )}
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
          workspaceId={activeWorkspace}
          projectId={projectId}
          onClose={() => setModal(null)}
          onSave={work.capture}
        />
      )}
      {(modal === 'workspace' || modal === 'project') && (
        <CreateContainer
          kind={modal}
          workspaceId={activeWorkspace}
          data={data}
          onClose={() => setModal(null)}
          onSave={work.refresh}
        />
      )}
      {modal === 'settings' && (
        <AudioSettingsDialog
          key={data.user.id}
          initial={audioSettings}
          profile={
            <>
              <NameSettings user={data.user} onSaved={work.refresh} />
              <AiSettingsSection
                initial={aiSettings}
                onChange={(settings) =>
                  setAiConfig({ ownerId: data.user.id, settings })
                }
              />
            </>
          }
          onClose={() => setModal(null)}
          onChange={(settings) =>
            setAudioConfig({ ownerId: data.user.id, settings })
          }
        />
      )}
      {modal === 'record' && (
        <Recorder
          key={data.user.id}
          transcription={audioReady}
          unavailableReason={unavailableReason(audioSettings)}
          provider={audioSettings?.provider || defaultProvider}
          workspaceId={activeWorkspace}
          projectId={projectId}
          onClose={() => setModal(null)}
          onSettings={() => openModal('settings')}
          onNote={async (id) => {
            await work.refresh();
            setModal(null);
            setSelectedNote(id);
          }}
        />
      )}
      {(modal === 'upload' || modal === 'email') && (
        <ImportDialog
          key={data.user.id}
          data={data}
          initialKind={modal === 'email' ? 'email' : 'transcript'}
          workspaceId={activeWorkspace}
          projectId={projectId}
          onClose={() => {
            setProcessAfterImport(false);
            setModal(null);
          }}
          onSaved={async (id) => {
            setModal(null);
            await work.refresh().catch(() => {});
            if (processAfterImport) {
              setProcessAfterImport(false);
              setCaptureNote(id);
            } else setSelectedNote(id);
          }}
        />
      )}
      {modal === 'search' && (
        <SearchDialog
          key={data.user.id}
          data={data}
          everything={everything!}
          archived={(kind, id) => {
            setModal(null);
            manageItem(kind, id);
          }}
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
          readOnly={work.readOnly}
          onClose={() => setSelectedTask(null)}
          onChange={work.refresh}
          onSelect={setSelectedTask}
          onOpenNote={(id) => {
            setSelectedTask(null);
            setSelectedNote(id);
          }}
          onOpenDrafts={(project, workspace) => {
            setSelectedTask(null);
            if (project) {
              navigate('project', workspace, project);
              setTab('drafts');
            }
          }}
        />
      )}
      {activeNote && (
        <NoteLoader
          listed={activeNote}
          ownerId={data.user.id}
          offline={work.readOnly}
          key={activeNote.id}
          readOnly={work.readOnly}
          onClose={() => setSelectedNote(null)}
          onSaved={work.refresh}
          onProcess={() => processCapture(activeNote.id)}
          processHint={aiReady ? undefined : 'Set up in Settings'}
        />
      )}
      {captureNote && data.notes.some((note) => note.id === captureNote) && (
        <CaptureFlow
          key={captureNote}
          data={data}
          note={data.notes.find((note) => note.id === captureNote)!}
          onClose={() => setCaptureNote(null)}
          onSaved={work.refresh}
          onOpenTask={(id) => {
            setCaptureNote(null);
            setSelectedTask(id);
          }}
          onOpenDrafts={(project, workspace) => {
            setCaptureNote(null);
            if (project) {
              navigate('project', workspace, project);
              setTab('drafts');
            }
          }}
        />
      )}
      {modal === 'manage' && managed?.kind === 'projects' && managedProject && (
        <ProjectSettingsDialog
          key={managedProject.id}
          project={managedProject}
          onClose={() => setModal(null)}
          onSaved={work.refresh}
          onArchived={(nowArchived) =>
            afterArchive(nowArchived, managedProject.id)
          }
          onDeleted={afterDelete}
        />
      )}
      {modal === 'manage' &&
        managed?.kind === 'workspaces' &&
        managedWorkspace && (
          <WorkspaceSettingsDialog
            key={managedWorkspace.id}
            workspace={managedWorkspace}
            lastWorkspace={isLastWorkspace(everything!)}
            onClose={() => setModal(null)}
            onArchived={(nowArchived) =>
              afterArchive(nowArchived, managedWorkspace.id)
            }
            onDeleted={afterDelete}
          />
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
  everything,
  query,
  setQuery,
  onClose,
  task,
  note,
  project,
  archived,
}: {
  data: HomeSnapshot;
  /** Includes archived workspaces and projects, to name and mark them. */
  everything: HomeSnapshot;
  /** Opens an archived scope's settings, to restore it. */
  archived: (kind: 'workspaces' | 'projects', id: string) => void;
  query: string;
  setQuery: (value: string) => void;
  onClose: () => void;
  task: (id: string) => void;
  note: (id: string) => void;
  project: (id: string) => void;
}) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  useEffect(() => {
    const control = new AbortController();
    let active = true;
    setResults([]);
    setError('');
    if (!query.trim()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .search(query.trim(), control.signal, { includeArchived })
        .then((value) => {
          if (active) setResults(value.results);
        })
        .catch((cause) => {
          if (active) setError((cause as Error).message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
      control.abort();
    };
  }, [query, includeArchived]);
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
          maxLength={200}
        />
      </div>
      <label className="completed-toggle search-archived">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.target.checked)}
        />
        Include archived
      </label>
      <div className="search-results">
        {results.map((item) => {
          const scope = archivedScope(item, everything);
          return (
            <button
              key={`${item.type}:${item.id}`}
              className={scope ? 'is-archived' : undefined}
              aria-label={
                scope
                  ? `${item.title}, archived in ${scope.name}. Opens its settings to restore it.`
                  : undefined
              }
              onClick={() => {
                if (scope) archived(scope.kind, scope.id);
                else if (item.type === 'task') task(item.id);
                else if (item.type === 'note') note(item.id);
                else project(item.id);
              }}
            >
              <span>
                {item.title}
                {item.excerpt && (
                  <small className="search-excerpt">{item.excerpt}</small>
                )}
                <small>
                  {everything.workspaces.find((w) => w.id === item.workspaceId)
                    ?.name || 'Personal Inbox'}
                  {scope && (
                    <span className="archived-badge">
                      {' '}
                      · Archived · restore to open
                    </span>
                  )}
                </small>
              </span>
              <em>{item.type}</em>
            </button>
          );
        })}
        {loading && (
          <p className="muted" role="status">
            Searching…
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && !results.length && (
          <p className="muted">
            {query.trim()
              ? 'No matches. Try a different word.'
              : 'Search task descriptions, notes, and projects.'}
          </p>
        )}
      </div>
    </Dialog>
  );
}
