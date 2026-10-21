import type { z } from 'zod';
import type { TaskInput, taskPatch } from '@ordo/core';
import type {
  DatabaseAdapter,
  TransactionContext,
} from '../../adapters/database/database.adapter.js';
import { ContentHasher } from '../../capabilities/content-hasher.contract.js';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import { assertRevision } from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import { TasksRepository } from './tasks.repository.js';

export class TasksService {
  constructor(
    private readonly repository: TasksRepository,
    private readonly transactions: DatabaseAdapter,
    private readonly workspaces: WorkspacesService,
    private readonly hasher: ContentHasher,
  ) {}

  async list(owner: string) {
    return (await this.repository.list(owner)).map(publicRecord);
  }
  async get(owner: string, id: string) {
    return publicRecord(await this.requireTask(owner, id));
  }

  async create(owner: string, input: TaskInput, key: string) {
    const fingerprint = this.hasher.digest(JSON.stringify(input));
    return this.transactions.forOwner(owner, async (transaction) => {
      const previous = await this.repository.findIdempotencyKey(
        owner,
        key,
        transaction,
      );
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          fail(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This retry key was already used for a different task.',
          );
        const original = await this.repository.find(
          owner,
          previous.taskId,
          transaction,
          true,
        );
        if (!original || original.deletedAt)
          fail(410, 'TASK_ARCHIVED', 'This task was already archived.');
        return { task: publicRecord(original), created: false };
      }
      await this.workspaces.validateScope(owner, input, transaction);
      const id = newId();
      await this.validateParent(owner, { ...input, id }, transaction);
      const task = await this.repository.insert(
        {
          id,
          ownerUserId: owner,
          ...input,
          completedAt:
            input.status === 'done' ? new Date().toISOString() : null,
        },
        transaction,
      );
      await this.repository.insertIdempotencyKey(
        { id: newId(), ownerUserId: owner, key, fingerprint, taskId: task.id },
        transaction,
      );
      return { task: publicRecord(task), created: true };
    });
  }

  async update(owner: string, id: string, input: z.infer<typeof taskPatch>) {
    return this.transactions.forOwner(owner, async (transaction) => {
      const row = await this.requireTask(owner, id, transaction);
      assertRevision(row.revision, input.expectedRevision);
      const { expectedRevision: _revision, ...patch } = input;
      const merged = { ...row, ...patch };
      await this.workspaces.validateScope(owner, merged, transaction);
      await this.validateParent(owner, merged, transaction);
      if (
        (row.workspaceId !== merged.workspaceId ||
          row.projectId !== merged.projectId) &&
        (await this.repository.hasActiveChildren(owner, id, transaction))
      )
        fail(
          409,
          'HAS_SUBTASKS',
          'Move or archive subtasks before changing this task’s destination.',
        );
      return publicRecord(
        await this.repository.update(
          owner,
          id,
          {
            ...patch,
            revision: row.revision + 1,
            updatedAt: new Date().toISOString(),
            completedAt:
              merged.status === 'done'
                ? (row.completedAt ?? new Date().toISOString())
                : null,
          },
          transaction,
        ),
      );
    });
  }

  async archive(owner: string, id: string, expectedRevision: number) {
    return this.transactions.forOwner(owner, async (transaction) => {
      const row = await this.requireTask(owner, id, transaction);
      assertRevision(row.revision, expectedRevision);
      if (await this.repository.hasActiveChildren(owner, id, transaction))
        fail(
          409,
          'HAS_SUBTASKS',
          'Archive or move subtasks before archiving the parent.',
        );
      return publicRecord(
        await this.repository.update(
          owner,
          id,
          {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            revision: row.revision + 1,
          },
          transaction,
        ),
      );
    });
  }

  private async requireTask(
    owner: string,
    id: string,
    transaction?: TransactionContext,
  ) {
    return (
      (await this.repository.find(owner, id, transaction)) ??
      fail(404, 'NOT_FOUND', 'Task not found.')
    );
  }

  private async validateParent(
    owner: string,
    task: {
      id: string;
      workspaceId: string | null;
      projectId: string | null;
      parentId: string | null;
    },
    transaction: TransactionContext,
  ) {
    let cursor = task.parentId;
    const visited = new Set([task.id]);
    while (cursor) {
      if (visited.has(cursor))
        fail(400, 'TASK_CYCLE', 'A task cannot be its own ancestor.');
      visited.add(cursor);
      if (visited.size > 500)
        fail(400, 'HIERARCHY_LIMIT', 'The task hierarchy is too deep.');
      const parent = await this.requireTask(owner, cursor, transaction);
      if (
        parent.workspaceId !== task.workspaceId ||
        parent.projectId !== task.projectId
      )
        fail(
          400,
          'SCOPE_MISMATCH',
          'Subtasks must share their parent’s workspace and project.',
        );
      cursor = parent.parentId;
    }
  }
}
