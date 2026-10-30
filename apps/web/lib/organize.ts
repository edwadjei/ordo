import type { DeletePreview, HomeSnapshot } from '@ordo/client';

/**
 * Archiving hides a workspace or project (and everything in it) from My Day,
 * Inbox, lists and pickers without losing anything; the sidebar's Archived
 * filter shows them again to restore or delete.
 */
type Archivable = { archived?: boolean; archivedAt?: string | null };
export const isArchived = (item: object) =>
  (item as Archivable).archived ?? !!(item as Archivable).archivedAt;

/** The snapshot everyday views use: archived workspaces and projects, and their items, left out. */
export function withoutArchived(data: HomeSnapshot): HomeSnapshot {
  const hiddenWorkspaces = new Set(
    data.workspaces.filter(isArchived).map((w) => w.id),
  );
  const hiddenProjects = new Set(
    data.projects
      .filter((p) => isArchived(p) || hiddenWorkspaces.has(p.workspaceId))
      .map((p) => p.id),
  );
  const visible = (item: {
    workspaceId: string | null;
    projectId: string | null;
  }) =>
    !(item.workspaceId && hiddenWorkspaces.has(item.workspaceId)) &&
    !(item.projectId && hiddenProjects.has(item.projectId));
  return {
    ...data,
    workspaces: data.workspaces.filter((w) => !hiddenWorkspaces.has(w.id)),
    projects: data.projects.filter((p) => !hiddenProjects.has(p.id)),
    tasks: data.tasks.filter(visible),
    notes: data.notes.filter(visible),
  };
}

/** What the Archived filter lists: archived workspaces, and archived projects in active ones. */
export function archivedItems(data: HomeSnapshot) {
  const workspaces = data.workspaces.filter(isArchived);
  const archivedIds = new Set(workspaces.map((w) => w.id));
  return {
    workspaces,
    projects: data.projects.filter(
      (p) => isArchived(p) && !archivedIds.has(p.workspaceId),
    ),
  };
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;
/** "Deletes 2 projects, 14 tasks, 6 notes and 1 draft." */
export function deleteSummary(preview: Omit<DeletePreview, 'name'>) {
  const parts = [
    preview.projects && plural(preview.projects, 'project'),
    preview.tasks && plural(preview.tasks, 'task'),
    preview.notes && plural(preview.notes, 'note'),
    preview.drafts && plural(preview.drafts, 'draft'),
    preview.captureRuns && plural(preview.captureRuns, 'AI capture run'),
  ].filter(Boolean) as string[];
  if (!parts.length) return 'Nothing else is inside; only the name goes.';
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
      : parts[0];
  return `Deletes ${list}.`;
}

/** The typed name must match exactly, as the API requires. */
export const confirmsName = (typed: string, name: string) => typed === name;

/** The last workspace (archived or not) can't be deleted. */
export const isLastWorkspace = (data: HomeSnapshot) =>
  data.workspaces.length <= 1;

/**
 * The archived workspace or project a search result sits in (or is), or
 * null. Archived items aren't loaded, so they open their scope's settings to
 * be restored rather than opening directly.
 */
export function archivedScope(
  result: {
    type: 'task' | 'note' | 'project';
    id: string;
    workspaceId: string | null;
    projectId?: string | null;
  },
  everything: HomeSnapshot,
): { kind: 'workspaces' | 'projects'; id: string; name: string } | null {
  const workspace = everything.workspaces.find(
    (w) => w.id === result.workspaceId,
  );
  if (workspace && isArchived(workspace))
    return { kind: 'workspaces', id: workspace.id, name: workspace.name };
  const projectId = result.type === 'project' ? result.id : result.projectId;
  const project = everything.projects.find((p) => p.id === projectId);
  if (project && isArchived(project))
    return { kind: 'projects', id: project.id, name: project.name };
  return null;
}

export type PlaceAction = 'settings' | 'archive' | 'restore' | 'delete';
/**
 * The options menu on a workspace or project (sidebar rows, the header,
 * Settings): settings, Archive or Restore, and Delete permanently…, each
 * saying when it needs a connection.
 */
export function placeMenuItems(
  kind: 'workspaces' | 'projects',
  item: object,
  offline: boolean,
): { action: PlaceAction; label: string; hint?: string }[] {
  const noun = kind === 'workspaces' ? 'workspace' : 'project';
  const hint = offline ? 'Needs a connection' : undefined;
  return [
    { action: 'settings', label: `Open ${noun} settings`, hint },
    isArchived(item)
      ? { action: 'restore', label: `Restore ${noun}`, hint }
      : { action: 'archive', label: `Archive ${noun}`, hint },
    { action: 'delete', label: 'Delete permanently…', hint },
  ];
}

/** Arrow keys, Home and End move through a menu, wrapping at the ends. */
export function menuFocusAfter(key: string, index: number, count: number) {
  if (key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** "Archived “Work”." with where to find it again. */
export const archivedMessage = (name: string, nowArchived: boolean) =>
  nowArchived
    ? `Archived “${name}”. Find it under Archived in the sidebar to restore it.`
    : `Restored “${name}”.`;
