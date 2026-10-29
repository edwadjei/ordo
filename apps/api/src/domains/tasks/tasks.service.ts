import { isoNow } from '../../platform/time/iso-now.js';
import type { z } from 'zod';
import type { TaskInput, taskPatch } from '@ordo/core';
import { type TaskRecord } from '../../adapters/database/database.adapter.js';
import { ContentHasher } from '../../capabilities/content-hasher.contract.js';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import {
  assertRevision,
  revisionConflict,
} from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import {
  TasksRepository,
  type Ancestor,
  type TaskSaveGuard,
} from './tasks.repository.js';

/** Longest parent chain read for a hierarchy check. */
const HIERARCHY_LIMIT = 500;

// A time is a wall-clock refinement of its date: checked after a patch is merged, so clearing
// a date without also clearing its time is rejected rather than leaving an orphaned time.
function assertTimesHaveDates(task: {
  dueDate: string | null;
  dueTime: string | null;
  followUpDate: string | null;
  followUpTime: string | null;
}) {
  if (task.dueTime !== null && task.dueDate === null)
    fail(400, 'INVALID_INPUT', 'A due time needs a due date.');
  if (task.followUpTime !== null && task.followUpDate === null)
    fail(400, 'INVALID_INPUT', 'A follow-up time needs a follow-up date.');
}

function isUniqueViolation(error: unknown) {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause)
    if (/UNIQUE constraint failed/i.test(String((cause as Error).message)))
      return true;
  return false;
}

export class TasksService {
  constructor(
    private readonly repository: TasksRepository,
    private readonly workspaces: WorkspacesService,
    private readonly hasher: ContentHasher,
  ) {}

  async list(owner: string, includeArchived = false) {
    return (await this.repository.list(owner, includeArchived)).map(
      publicRecord,
    );
  }
  async get(owner: string, id: string) {
    return publicRecord(await this.requireTask(owner, id));
  }

  async create(owner: string, input: TaskInput, key: string) {
    const fingerprint = await this.hasher.digest(JSON.stringify(input));
    const previous = await this.retried(owner, key, fingerprint);
    if (previous) return previous;
    assertTimesHaveDates(input);
    await this.workspaces.validateScope(owner, input);
    if (
      input.sourceNoteId &&
      !(await this.repository.noteExists(owner, input.sourceNoteId))
    )
      fail(404, 'NOT_FOUND', 'Source note not found.');
    const id = newId();
    const ancestors = await this.validateParent(owner, { ...input, id });
    let saved: TaskRecord | undefined;
    try {
      saved = await this.repository.insertWithKey(
        {
          id,
          ownerUserId: owner,
          ...input,
          completedAt: input.status === 'done' ? isoNow() : null,
        },
        { id: newId(), key, fingerprint },
        ancestors[0],
      );
    } catch (error) {
      // A concurrent create with the same key won the unique constraint.
      if (!isUniqueViolation(error)) throw error;
      const original = await this.retried(owner, key, fingerprint);
      if (original) return original;
      throw error;
    }
    if (!saved) {
      // The parent changed between the check and the save: report why.
      await this.validateParent(owner, { ...input, id });
      revisionConflict();
    }
    return { task: publicRecord(saved), created: true };
  }

  async update(owner: string, id: string, input: z.infer<typeof taskPatch>) {
    const row = await this.requireTask(owner, id);
    assertRevision(row.revision, input.expectedRevision);
    const { expectedRevision: _revision, ...patch } = input;
    const merged = { ...row, ...patch };
    assertTimesHaveDates(merged);
    await this.workspaces.validateScope(owner, merged);
    const ancestors = await this.validateParent(owner, merged);
    // A destination change carries the task's subtasks with it.
    const moves =
      row.workspaceId !== merged.workspaceId ||
      row.projectId !== merged.projectId;
    const guard: TaskSaveGuard = { revision: row.revision, ancestors };
    const changes = {
      ...patch,
      updatedAt: isoNow(),
      completedAt:
        merged.status === 'done' ? (row.completedAt ?? isoNow()) : null,
    };
    const saved = moves
      ? await this.repository.moveGuarded(owner, id, changes, guard)
      : await this.repository.updateGuarded(owner, id, changes, guard);
    if (saved) return publicRecord(saved);
    await this.requireTask(owner, id);
    return revisionConflict();
  }

  async archive(owner: string, id: string, expectedRevision: number) {
    const row = await this.requireTask(owner, id);
    assertRevision(row.revision, expectedRevision);
    const hasSubtasks = () =>
      fail(
        409,
        'HAS_SUBTASKS',
        'Archive or move subtasks before archiving the parent.',
      );
    if (await this.repository.hasActiveChildren(owner, id)) hasSubtasks();
    const now = isoNow();
    const saved = await this.repository.updateGuarded(
      owner,
      id,
      { deletedAt: now, updatedAt: now },
      { revision: row.revision, noActiveChildren: true },
    );
    if (saved) return publicRecord(saved);
    await this.requireTask(owner, id);
    if (await this.repository.hasActiveChildren(owner, id)) hasSubtasks();
    return revisionConflict();
  }

  /** The original task for a retried create, or `undefined` for a new key. */
  private async retried(owner: string, key: string, fingerprint: string) {
    const previous = await this.repository.findIdempotencyKey(owner, key);
    if (!previous) return undefined;
    if (previous.fingerprint !== fingerprint)
      fail(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This retry key was already used for a different task.',
      );
    const original = await this.repository.find(owner, previous.taskId, true);
    if (!original || original.deletedAt)
      fail(410, 'TASK_ARCHIVED', 'This task was already archived.');
    return { task: publicRecord(original), created: false };
  }

  private async requireTask(owner: string, id: string) {
    return (
      (await this.repository.find(owner, id)) ??
      fail(404, 'NOT_FOUND', 'Task not found.')
    );
  }

  /**
   * Checks cycle, scope and archived parent against the ancestry read in one
   * query, and returns that ancestry: the save is conditional on each
   * ancestor's revision, so a concurrent move anywhere in the chain makes one
   * of the two saves fail.
   */
  private async validateParent(
    owner: string,
    task: {
      id: string;
      workspaceId: string | null;
      projectId: string | null;
      parentId: string | null;
    },
  ): Promise<Ancestor[]> {
    if (!task.parentId) return [];
    if (task.parentId === task.id)
      fail(400, 'TASK_CYCLE', 'A task cannot be its own ancestor.');
    const chain = await this.repository.ancestors(
      owner,
      task.parentId,
      HIERARCHY_LIMIT,
    );
    const visited = new Set([task.id]);
    let expected: string | null = task.parentId;
    for (const ancestor of chain) {
      if (ancestor.id !== expected || ancestor.deletedAt) break;
      if (visited.has(ancestor.id))
        fail(400, 'TASK_CYCLE', 'A task cannot be its own ancestor.');
      visited.add(ancestor.id);
      if (visited.size > HIERARCHY_LIMIT)
        fail(400, 'HIERARCHY_LIMIT', 'The task hierarchy is too deep.');
      if (
        ancestor.workspaceId !== task.workspaceId ||
        ancestor.projectId !== task.projectId
      )
        fail(
          400,
          'SCOPE_MISMATCH',
          'Subtasks must share their parent’s workspace and project.',
        );
      expected = ancestor.parentId;
      if (!expected) return chain.slice(0, visited.size - 1);
    }
    // The chain ended at a missing, archived or foreign task.
    return fail(404, 'NOT_FOUND', 'Task not found.');
  }
}
