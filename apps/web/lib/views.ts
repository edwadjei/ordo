import type { HomeSnapshot, Task } from '@ordo/client';
export type View =
  'day' | 'inbox' | 'upcoming' | 'waiting' | 'workspace' | 'project';
export function localDate(timezone = 'Africa/Accra', date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function visibleTasks(
  data: HomeSnapshot,
  view: View,
  workspaceId: string | null,
  projectId: string | null,
  showDone: boolean,
) {
  const today = localDate(data.user.timezone),
    later = new Date(`${today}T12:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 7);
  const end = later.toISOString().slice(0, 10);
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
