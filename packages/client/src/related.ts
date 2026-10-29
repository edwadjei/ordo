import type { Draft, NoteSummary, Task } from '@ordo/core';

/** What a permanent delete of a workspace or project would remove. */
export interface DeletePreview {
  name: string;
  projects: number;
  tasks: number;
  notes: number;
  drafts: number;
  captureRuns: number;
}
export interface DeleteResult {
  deleted: Omit<DeletePreview, 'name'>;
}
/** A task's related items: its source note, hand-linked notes, and what came from the same capture. */
export interface RelatedItems {
  sourceNote: NoteSummary | null;
  linkedNotes: NoteSummary[];
  captureTasks: Task[];
  drafts: Draft[];
}
