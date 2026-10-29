import type {
  CaptureRun,
  CaptureSave,
  SuggestedDraft,
  SuggestedTask,
} from '@ordo/client/capture';

/**
 * The review screen's state: every suggestion starts selected and editable.
 * Nothing exists until the person saves. Each item follows the batch
 * destination unless it is reassigned.
 */
export interface Destination {
  workspaceId: string;
  /** undefined: not chosen yet (a low-confidence suggestion is never assumed). */
  projectId: string | null | undefined;
}
export type ReviewTask = SuggestedTask & {
  selected: boolean;
  /** A different destination for this item only; null follows the batch. */
  destination: Destination | null;
};
export type ReviewDraft = SuggestedDraft & {
  selected: boolean;
  destination: Destination | null;
};
export interface Review {
  summary: string;
  tasks: ReviewTask[];
  drafts: ReviewDraft[];
  destination: Destination;
  confidence: 'high' | 'low';
  reason: string;
}

export function startReview(
  run: CaptureRun,
  chosen: { workspaceId: string; projectId?: string | null },
): Review | null {
  const s = run.suggestions;
  if (run.status !== 'ready' || !s) return null;
  const suggested = s.destination;
  const sameWorkspace = suggested.workspaceId === chosen.workspaceId;
  // A project chosen before processing wins; otherwise use the model's guess
  // only when it is confident and inside the chosen workspace.
  const projectId =
    chosen.projectId !== undefined && chosen.projectId !== null
      ? chosen.projectId
      : suggested.confidence === 'high' && sameWorkspace
        ? suggested.projectId
        : undefined;
  return {
    summary: s.summary,
    tasks: s.tasks.map((task) => ({
      ...task,
      selected: true,
      destination: null,
    })),
    drafts: s.drafts.map((draft) => ({
      ...draft,
      selected: true,
      destination: null,
    })),
    destination: { workspaceId: chosen.workspaceId, projectId },
    confidence: suggested.confidence,
    reason: suggested.reason,
  };
}

export const taskGroups = (review: Review) => ({
  tasks: review.tasks.filter((task) => !task.isFollowUp),
  followUps: review.tasks.filter((task) => task.isFollowUp),
});

export function editTask(
  review: Review,
  key: string,
  changes: Partial<ReviewTask>,
): Review {
  return {
    ...review,
    tasks: review.tasks.map((task) =>
      task.key === key ? { ...task, ...changes } : task,
    ),
  };
}
export function editDraft(
  review: Review,
  key: string,
  changes: Partial<ReviewDraft>,
): Review {
  return {
    ...review,
    drafts: review.drafts.map((draft) =>
      draft.key === key ? { ...draft, ...changes } : draft,
    ),
  };
}
export function removeItem(review: Review, key: string): Review {
  return {
    ...review,
    tasks: review.tasks.filter((task) => task.key !== key),
    drafts: review.drafts.filter((draft) => draft.key !== key),
  };
}

const earliest = (a?: string | null, b?: string | null) =>
  !a ? b || null : !b ? a : a <= b ? a : b;
/**
 * Merges `other` into `into`: titles are joined, the earlier dates (with
 * their times) are kept, people and priority fall back to the other task's,
 * and the merged task stays selected.
 */
export function mergeTasks(
  review: Review,
  into: string,
  other: string,
): Review {
  const a = review.tasks.find((task) => task.key === into),
    b = review.tasks.find((task) => task.key === other);
  if (!a || !b || a === b) return review;
  const dueDate = earliest(a.dueDate, b.dueDate),
    followUpDate = earliest(a.followUpDate, b.followUpDate);
  const merged: ReviewTask = {
    ...a,
    title: `${a.title}; ${b.title}`.slice(0, 200),
    dueDate,
    dueTime: dueDate === a.dueDate ? a.dueTime || null : b.dueTime || null,
    followUpDate,
    followUpTime:
      followUpDate === a.followUpDate
        ? a.followUpTime || null
        : b.followUpTime || null,
    priority: a.priority || b.priority || null,
    responsiblePerson: a.responsiblePerson || b.responsiblePerson || null,
    waitingOn: a.waitingOn || b.waitingOn || null,
    isFollowUp: a.isFollowUp || b.isFollowUp,
    selected: true,
  };
  return {
    ...review,
    tasks: review.tasks
      .filter((task) => task.key !== other)
      .map((task) => (task.key === into ? merged : task)),
  };
}

export const destinationReady = (destination: Destination | null) =>
  !!destination && destination.projectId !== undefined;

/** Why saving is blocked, in plain words, or '' when it can save. */
export function saveProblem(review: Review, mode: 'selected' | 'all') {
  const chosen = <T extends { selected: boolean }>(items: T[]) =>
    items.filter((item) => mode === 'all' || item.selected);
  const tasks = chosen(review.tasks),
    drafts = chosen(review.drafts),
    items = [...tasks, ...drafts];
  if (!items.length)
    return mode === 'all'
      ? 'Nothing left to save.'
      : 'Select at least one suggestion to save.';
  if (tasks.some((task) => !task.title.trim()))
    return 'Every task needs a title.';
  if (drafts.some((draft) => !draft.body.trim()))
    return 'Every draft needs some text.';
  if (
    items.some(
      (item) => !destinationReady(item.destination ?? review.destination),
    )
  )
    return 'Choose a project (or the workspace Inbox) before saving.';
  return '';
}

/** The save request: the chosen items, each naming a destination only when reassigned. */
export function saveBody(
  review: Review,
  mode: 'selected' | 'all',
): CaptureSave {
  const batch = review.destination;
  const own = (item: { destination: Destination | null }) =>
    item.destination &&
    (item.destination.workspaceId !== batch.workspaceId ||
      item.destination.projectId !== batch.projectId)
      ? {
          workspaceId: item.destination.workspaceId,
          projectId: item.destination.projectId ?? null,
        }
      : {};
  const pick = <T extends { selected: boolean }>(items: T[]) =>
    items.filter((item) => mode === 'all' || item.selected);
  return {
    workspaceId: batch.workspaceId,
    projectId: batch.projectId ?? null,
    tasks: pick(review.tasks).map(({ selected: _s, destination, ...task }) => ({
      ...task,
      title: task.title.trim(),
      ...own({ destination }),
    })),
    drafts: pick(review.drafts).map(
      ({ selected: _s, destination, ...draft }) => ({
        ...draft,
        ...own({ destination }),
      }),
    ),
  };
}
