import type { NoteSummary, Task } from '@ordo/client';
import { listPreview } from './notes';

/**
 * Notes the Link a note picker offers: not already linked, not the task's own
 * source note, matching the words typed (title or preview), with notes from
 * the task's project and then its workspace first.
 */
export function linkCandidates(
  notes: NoteSummary[],
  linked: Pick<NoteSummary, 'id'>[],
  query: string,
  task: Pick<Task, 'projectId' | 'workspaceId'> & {
    sourceNoteId?: string | null;
  },
  limit = 8,
) {
  const taken = new Set([...linked.map((note) => note.id), task.sourceNoteId]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rank = (note: NoteSummary) =>
    task.projectId && note.projectId === task.projectId
      ? 0
      : task.workspaceId && note.workspaceId === task.workspaceId
        ? 1
        : 2;
  return notes
    .filter((note) => !taken.has(note.id))
    .filter((note) => {
      const text = `${note.title} ${listPreview(note)}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
