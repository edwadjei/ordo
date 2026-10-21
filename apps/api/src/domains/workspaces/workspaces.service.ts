import type { z } from 'zod';
import type {
  workspaceInput,
  workspacePatch,
  projectInput,
  projectPatch,
} from '@ordo/core';
import type {
  DatabaseAdapter,
  TransactionContext,
} from '../../adapters/database/database.adapter.js';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import { assertRevision } from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import { WorkspacesRepository } from './workspaces.repository.js';

export interface WorkspaceScope {
  workspaceId: string | null;
  projectId: string | null;
}

export class WorkspacesService {
  constructor(
    private readonly repository: WorkspacesRepository,
    private readonly transactions: DatabaseAdapter,
  ) {}

  async listWorkspaces(owner: string) {
    return (await this.repository.listWorkspaces(owner)).map(publicRecord);
  }
  async getWorkspace(owner: string, id: string) {
    return publicRecord(await this.requireWorkspace(owner, id));
  }
  async createWorkspace(owner: string, input: z.infer<typeof workspaceInput>) {
    return publicRecord(
      await this.repository.insertWorkspace({
        id: newId(),
        ownerUserId: owner,
        ...input,
      }),
    );
  }

  async updateWorkspace(
    owner: string,
    id: string,
    input: z.infer<typeof workspacePatch>,
  ) {
    return this.transactions.forOwner(owner, async (transaction) => {
      const row = await this.requireWorkspace(owner, id, transaction);
      assertRevision(row.revision, input.expectedRevision);
      const { expectedRevision: _revision, ...patch } = input;
      return publicRecord(
        await this.repository.updateWorkspace(
          owner,
          id,
          {
            ...patch,
            revision: row.revision + 1,
            updatedAt: new Date().toISOString(),
          },
          transaction,
        ),
      );
    });
  }

  async listProjects(owner: string, workspaceId?: string) {
    if (workspaceId) await this.requireWorkspace(owner, workspaceId);
    return (await this.repository.listProjects(owner, workspaceId)).map(
      publicRecord,
    );
  }

  async getProject(owner: string, id: string) {
    return publicRecord(await this.requireProject(owner, id));
  }
  async createProject(owner: string, input: z.infer<typeof projectInput>) {
    await this.requireWorkspace(owner, input.workspaceId);
    return publicRecord(
      await this.repository.insertProject({
        id: newId(),
        ownerUserId: owner,
        ...input,
      }),
    );
  }

  async updateProject(
    owner: string,
    id: string,
    input: z.infer<typeof projectPatch>,
  ) {
    return this.transactions.forOwner(owner, async (transaction) => {
      const row = await this.requireProject(owner, id, transaction);
      assertRevision(row.revision, input.expectedRevision);
      const { expectedRevision: _revision, ...patch } = input;
      return publicRecord(
        await this.repository.updateProject(
          owner,
          id,
          {
            ...patch,
            revision: row.revision + 1,
            updatedAt: new Date().toISOString(),
          },
          transaction,
        ),
      );
    });
  }

  async validateScope(
    owner: string,
    scope: WorkspaceScope,
    transaction?: TransactionContext,
  ) {
    if (scope.workspaceId)
      await this.requireWorkspace(owner, scope.workspaceId, transaction);
    if (scope.projectId) {
      const project = await this.requireProject(
        owner,
        scope.projectId,
        transaction,
      );
      if (project.workspaceId !== scope.workspaceId)
        fail(
          400,
          'SCOPE_MISMATCH',
          'The project must belong to the selected workspace.',
        );
    }
  }

  private async requireWorkspace(
    owner: string,
    id: string,
    transaction?: TransactionContext,
  ) {
    return (
      (await this.repository.findWorkspace(owner, id, transaction)) ??
      fail(404, 'NOT_FOUND', 'Workspace not found.')
    );
  }

  private async requireProject(
    owner: string,
    id: string,
    transaction?: TransactionContext,
  ) {
    return (
      (await this.repository.findProject(owner, id, transaction)) ??
      fail(404, 'NOT_FOUND', 'Project not found.')
    );
  }
}
