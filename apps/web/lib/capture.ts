import type { Note, Task } from '@ordo/client';
import type { CaptureRunStatus, TaskOrigin } from '@ordo/client/capture';

/** Notes made from a recording, an email or a transcript: Ordo's conversations. */
export const conversationSources = ['recording', 'email', 'transcript'];

export const taskOrigin = (task: Task): TaskOrigin => task.origin ?? 'manual';
export const taskSourceNote = (task: Task): string | null =>
  task.sourceNoteId ?? null;
/** The latest capture run's status for a note, when the API reports it. */
export const noteCaptureStatus = (note: Note): CaptureRunStatus | null =>
  note.latestCaptureStatus ?? null;

/** A capture whose AI processing didn't finish: pending (AI unavailable) or failed. */
export const notProcessed = (note: Note) => {
  const status = noteCaptureStatus(note);
  return status === 'pending' || status === 'failed';
};

/**
 * Conversations in scope, newest first. A capture belongs to a project when
 * it was filed there or when tasks saved from it went there.
 */
export function conversations(
  notes: Note[],
  scope: { workspaceId?: string | null; projectId?: string | null } = {},
  tasks: Task[] = [],
) {
  const fedProject = (note: Note) =>
    tasks.some(
      (task) =>
        taskSourceNote(task) === note.id && task.projectId === scope.projectId,
    );
  return notes
    .filter((note) => conversationSources.includes(note.source))
    .filter((note) =>
      scope.projectId
        ? note.projectId === scope.projectId || fedProject(note)
        : !scope.workspaceId || note.workspaceId === scope.workspaceId,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Tasks created from a capture note, for its conversation card. */
export const tasksFromNote = (tasks: Task[], noteId: string) =>
  tasks.filter((task) => taskSourceNote(task) === noteId);

/** The text put on the clipboard for a draft. */
export function draftText(draft: {
  kind: 'email' | 'message';
  to: string | null;
  subject: string | null;
  body: string;
}) {
  const head = [
    draft.to && `To: ${draft.to}`,
    draft.kind === 'email' && draft.subject && `Subject: ${draft.subject}`,
  ].filter(Boolean);
  return head.length ? `${head.join('\n')}\n\n${draft.body}` : draft.body;
}

export const projectAliases = (project: { aliases?: string[] | null }) =>
  project.aliases ?? [];
/** Comma-separated other names: trimmed, de-duplicated, at most 10 of 1–60 characters. */
export function parseAliases(value: string) {
  const seen = new Set<string>();
  const aliases = value
    .split(',')
    .map((name) => name.trim().replace(/\s+/g, ' '))
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const problem =
    aliases.length > 10
      ? 'Keep it to 10 other names.'
      : aliases.some((name) => name.length > 60)
        ? 'Each other name can be up to 60 characters.'
        : '';
  return { aliases, problem };
}
