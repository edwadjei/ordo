import type { HomeSnapshot, Task } from '@ordo/client';
import { looksLikeContact as looksLikeContactForApi } from '@ordo/core';
export type View =
  'day' | 'inbox' | 'upcoming' | 'waiting' | 'workspace' | 'project';
export const defaultTimezone = 'Africa/Accra';

export type EverydayTask = Task;

export function localDate(timezone = defaultTimezone, date = new Date()) {
  return localNow(timezone, date).date;
}
/** Wall-clock date ("YYYY-MM-DD"), time ("HH:MM") and hour in a timezone. */
export function localNow(timezone = defaultTimezone, date = new Date()) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatter(timezone).formatToParts(date);
  } catch {
    parts = formatter(defaultTimezone).formatToParts(date);
  }
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || '00';
  // Some engines report midnight as "24" even with hourCycle h23.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}`,
    hour: Number(hour),
  };
}
function formatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}
export function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * True when a "name" is really a phone number or an email address. Accounts
 * can end up with one as their display name (typed or autofilled into the
 * optional name field), and a greeting must never show contact details.
 */
export function looksLikeContact(value: string) {
  const text = value.trim();
  return text.includes('@') || /^\+?[\d\s().-]{6,}$/.test(text);
}
/**
 * Why a name can't be saved, in plain words, or '' when it can. Matches the
 * API's rule (`cleanDisplayName`): up to 80 characters, never a phone number
 * or email. Empty is allowed and clears the name.
 */
export function nameProblem(value: string) {
  const text = value.trim();
  if (text.length > 80) return 'Keep your name to 80 characters or fewer.';
  if (looksLikeContactForApi(text))
    return 'Use a name, not a phone number or email address.';
  return '';
}
/** The API's default name for phone accounts that gave none; not a real name. */
const placeholderNames = new Set(['ordo member']);

/** The first word of a real display name, or '' when there isn't one to greet by. */
export function firstName(displayName: string | null | undefined) {
  const text = displayName?.trim() || '';
  if (
    !text ||
    looksLikeContact(text) ||
    placeholderNames.has(text.toLowerCase())
  )
    return '';
  return text.split(/\s+/)[0];
}
/** Up to two initials of a real name for the avatar, or '' to show no letters. */
export function initials(displayName: string | null | undefined) {
  if (!firstName(displayName)) return '';
  return displayName!
    .trim()
    .split(/\s+/)
    .map((word) => [...word][0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
/** The name shown beside the avatar, never contact details. */
export function profileName(displayName: string | null | undefined) {
  return firstName(displayName) ? displayName!.trim() : 'Your account';
}
export function greeting(hour: number, displayName?: string | null) {
  const part =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 17
        ? 'Good afternoon'
        : 'Good evening';
  const name = firstName(displayName);
  return name ? `${part}, ${name}` : part;
}

export type MomentKind = 'due' | 'follow-up';
export interface Moment {
  task: EverydayTask;
  kind: MomentKind;
  date: string;
  time: string | null;
}
export function moments(task: EverydayTask): Moment[] {
  const list: Moment[] = [];
  if (task.dueDate)
    list.push({
      task,
      kind: 'due',
      date: task.dueDate,
      time: task.dueTime || null,
    });
  if (task.followUpDate)
    list.push({
      task,
      kind: 'follow-up',
      date: task.followUpDate,
      time: task.followUpTime || null,
    });
  return list;
}
export interface Clock {
  date: string;
  time: string;
}
/** A moment has passed once its day is over, or its time today has arrived. */
export function hasPassed(moment: Pick<Moment, 'date' | 'time'>, now: Clock) {
  if (moment.date < now.date) return true;
  return moment.date === now.date && !!moment.time && moment.time <= now.time;
}
const open = (task: Task) => task.status !== 'done';
const inScope = (workspaceId: string | null) => (task: Task) =>
  !workspaceId || task.workspaceId === workspaceId;

export interface DaySections {
  dueNow: EverydayTask[];
  overdue: EverydayTask[];
  today: EverydayTask[];
}
/**
 * Splits open tasks for My Day. Each task appears once, in the first matching
 * section: Due now (a timed moment today has arrived), Overdue (a moment on an
 * earlier day), Today (anything else dated today).
 */
export function daySections(
  tasks: EverydayTask[],
  now: Clock,
  workspaceId: string | null = null,
): DaySections {
  const result: DaySections = { dueNow: [], overdue: [], today: [] };
  for (const task of tasks.filter(open).filter(inScope(workspaceId))) {
    const list = moments(task);
    if (list.some((m) => m.date === now.date && m.time && hasPassed(m, now)))
      result.dueNow.push(task);
    else if (list.some((m) => m.date < now.date)) result.overdue.push(task);
    else if (list.some((m) => m.date === now.date)) result.today.push(task);
  }
  const first = (task: EverydayTask) =>
    moments(task)
      .map((m) => `${m.date}T${m.time || '99:99'}`)
      .sort()[0] || '';
  for (const list of [result.dueNow, result.overdue, result.today])
    list.sort((a, b) => first(a).localeCompare(first(b)));
  return result;
}

export interface DayCounts {
  today: number;
  overdue: number;
  upcoming: number;
  waiting: number;
  inbox: number;
}
export function dayCounts(
  tasks: EverydayTask[],
  now: Clock,
  workspaceId: string | null = null,
): DayCounts {
  const active = tasks.filter(open).filter(inScope(workspaceId));
  const end = addDays(now.date, 7);
  const has = (task: EverydayTask, test: (date: string) => boolean) =>
    moments(task).some((m) => test(m.date));
  return {
    today: active.filter((t) => has(t, (d) => d === now.date)).length,
    overdue: active.filter((t) => has(t, (d) => d < now.date)).length,
    upcoming: active.filter((t) => has(t, (d) => d > now.date && d <= end))
      .length,
    waiting: active.filter((t) => t.status === 'waiting').length,
    inbox: active.filter((t) => !t.projectId).length,
  };
}
export function daySummary(counts: DayCounts, dueNow: number) {
  const parts: string[] = [];
  if (dueNow) parts.push(`${dueNow} due now`);
  // Due-now tasks are also today's; count the rest so nothing is said twice.
  const rest = Math.max(counts.today - dueNow, 0);
  if (rest)
    parts.push(
      `${rest} ${dueNow ? 'more' : rest === 1 ? 'thing' : 'things'} for today`,
    );
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (!parts.length)
    return counts.upcoming
      ? `Nothing due today. ${counts.upcoming} coming up this week.`
      : 'Nothing due today. A clear runway for what matters.';
  return `${sentence(parts)}.`;
}
function sentence(parts: string[]) {
  const text =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
      : parts[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface DayGroup {
  date: string;
  label: string;
  items: Moment[];
}
/** The next seven local days (tomorrow onwards), each with its due and follow-up moments. */
export function upcomingGroups(
  tasks: EverydayTask[],
  today: string,
  workspaceId: string | null = null,
  projectId: string | null = null,
): DayGroup[] {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
  const all = tasks
    .filter(open)
    .filter(inScope(workspaceId))
    .filter((task) => !projectId || task.projectId === projectId)
    .flatMap(moments);
  return days.map((date) => ({
    date,
    label: dayLabel(date, today),
    items: all
      .filter((m) => m.date === date)
      .sort(
        (a, b) =>
          (a.time || '99:99').localeCompare(b.time || '99:99') ||
          a.task.title.localeCompare(b.task.title),
      ),
  }));
}
export function dayLabel(date: string, today: string) {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  const value = new Date(`${date}T12:00:00Z`);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  };
  if (date.slice(0, 4) !== today.slice(0, 4)) options.year = 'numeric';
  return new Intl.DateTimeFormat('en-GB', options)
    .format(value)
    .replace(',', '');
}
/** Short date for rows: "Today", "Tomorrow", "Yesterday" or "23 Oct", plus the time when set. */
export function whenLabel(date: string, time: string | null, today: string) {
  const near = [addDays(today, -1), today, addDays(today, 1)].includes(date);
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  };
  if (date.slice(0, 4) !== today.slice(0, 4)) options.year = 'numeric';
  const day = near
    ? dayLabel(date, today)
    : new Intl.DateTimeFormat('en-GB', options).format(
        new Date(`${date}T12:00:00Z`),
      );
  return time ? `${day} · ${time}` : day;
}

/** Waiting On rows, soonest follow-up first; tasks with no follow-up last. */
export function waitingTasks(
  tasks: EverydayTask[],
  workspaceId: string | null = null,
  projectId: string | null = null,
) {
  return tasks
    .filter((task) => task.status === 'waiting')
    .filter(inScope(workspaceId))
    .filter((task) => !projectId || task.projectId === projectId)
    .sort(
      (a, b) =>
        `${a.followUpDate || '9999'}T${a.followUpTime || '99:99'}`.localeCompare(
          `${b.followUpDate || '9999'}T${b.followUpTime || '99:99'}`,
        ) || b.createdAt.localeCompare(a.createdAt),
    );
}
export function followUpOverdue(task: EverydayTask, now: Clock) {
  return (
    !!task.followUpDate &&
    hasPassed({ date: task.followUpDate, time: task.followUpTime || null }, now)
  );
}

/** Names already used on tasks, for suggestions; case-insensitively unique. */
export function knownNames(tasks: EverydayTask[]) {
  const names = new Map<string, string>();
  for (const task of tasks)
    for (const value of [task.responsiblePerson, task.waitingOn]) {
      const name = value?.trim();
      if (name && !names.has(name.toLowerCase()))
        names.set(name.toLowerCase(), name);
    }
  return [...names.values()].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' }),
  );
}

export function visibleTasks(
  data: HomeSnapshot,
  view: View,
  workspaceId: string | null,
  projectId: string | null,
  showDone: boolean,
) {
  const today = localDate(data.user.timezone || defaultTimezone),
    end = addDays(today, 7);
  return data.tasks
    .filter((task) => {
      if (!showDone && task.status === 'done') return false;
      if (workspaceId && task.workspaceId !== workspaceId) return false;
      if (projectId && task.projectId !== projectId) return false;
      if (view === 'inbox') return !task.projectId;
      if (view === 'waiting') return task.status === 'waiting';
      if (view === 'upcoming')
        return [task.dueDate, task.followUpDate].some(
          (date) => date && date > today && date <= end,
        );
      if (view === 'day')
        return [task.dueDate, task.followUpDate].some(
          (date) => date && date <= today,
        );
      return true;
    })
    .sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done') ||
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
        b.createdAt.localeCompare(a.createdAt),
    );
}
export function taskDepth(task: Task, tasks: Task[]) {
  let depth = 0,
    parent = task.parentId;
  const visited = new Set([task.id]);
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    depth++;
    parent = tasks.find((t) => t.id === parent)?.parentId || null;
  }
  return Math.min(depth, 4);
}
export const statusLabels = {
  todo: 'To Do',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  done: 'Done',
};

/**
 * When a note was last saved, for the editor's "Saved" line: the time for
 * today, otherwise the date.
 */
export function savedAtLabel(saved: Date, now = new Date(), locale?: string) {
  const sameDay = saved.toDateString() === now.toDateString();
  return sameDay
    ? saved.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : saved.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export interface ProjectOverview {
  open: EverydayTask[];
  /** The first open tasks to show on the Overview tab. */
  next: EverydayTask[];
  overdue: EverydayTask[];
  waiting: EverydayTask[];
  notes: HomeSnapshot['notes'];
  recentNotes: HomeSnapshot['notes'];
}
/**
 * A project's Overview tab: overdue tasks (its blockers), the next open tasks,
 * Waiting On with who, and the most recently updated notes. Overdue and
 * waiting tasks are not repeated in the open list.
 */
export function projectOverview(
  data: HomeSnapshot,
  projectId: string,
  now: Clock,
  limits = { next: 5, notes: 3 },
): ProjectOverview {
  const tasks = data.tasks.filter(
    (task) => task.projectId === projectId && open(task),
  );
  const overdue = tasks.filter((task) =>
    moments(task).some((m) => m.date < now.date),
  );
  const waiting = waitingTasks(tasks);
  const shown = new Set([...overdue, ...waiting].map((task) => task.id));
  const rest = visibleTasks(
    { ...data, tasks },
    'project',
    null,
    projectId,
    false,
  ).filter((task) => !shown.has(task.id));
  const notes = data.notes
    .filter((note) => note.projectId === projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    open: tasks,
    next: rest.slice(0, limits.next),
    overdue,
    waiting,
    notes,
    recentNotes: notes.slice(0, limits.notes),
  };
}

/** Favourite projects first; otherwise the order the API returned them in. */
export function favoritesFirst<T extends { favorite?: boolean }>(
  projects: T[],
) {
  return projects
    .map((project, index) => ({ project, index }))
    .sort(
      (a, b) =>
        Number(!!b.project.favorite) - Number(!!a.project.favorite) ||
        a.index - b.index,
    )
    .map((item) => item.project);
}

export const noteSourceLabels = {
  manual: 'Typed note',
  recording: 'From a recording',
  email: 'From an email',
  transcript: 'From a transcript',
} as const;
/** Where a note came from, for its card and editor; '' for an ordinary typed note. */
export function noteSourceLabel(source: string | null | undefined) {
  if (!source || source === 'manual') return '';
  return noteSourceLabels[source as keyof typeof noteSourceLabels] || '';
}
