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
