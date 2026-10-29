import { isoNow } from '../../platform/time/iso-now.js';
import type { z } from 'zod';
import type {
  workspaceInput,
  workspacePatch,
  projectInput,
  projectPatch,
} from '@ordo/core';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import {
  assertRevision,
  revisionConflict,
} from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import { WorkspacesRepository } from './workspaces.repository.js';

export interface WorkspaceScope {
  workspaceId: string | null;
  projectId: string | null;
}

export class WorkspacesService {
  constructor(private readonly repository: WorkspacesRepository) {}

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
    const row = await this.requireWorkspace(owner, id);
    assertRevision(row.revision, input.expectedRevision);
    const { expectedRevision: _revision, ...patch } = input;
    const saved = await this.repository.updateWorkspace(
      owner,
      id,
      row.revision,
      {
        ...patch,
        updatedAt: isoNow(),
      },
    );
    // Zero rows: another save won between the read and this write.
    return publicRecord(saved ?? revisionConflict());
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
    const row = await this.requireProject(owner, id);
    assertRevision(row.revision, input.expectedRevision);
    const { expectedRevision: _revision, ...patch } = input;
    const saved = await this.repository.updateProject(owner, id, row.revision, {
      ...patch,
      updatedAt: isoNow(),
    });
    // Zero rows: another save won between the read and this write.
    return publicRecord(saved ?? revisionConflict());
  }

  /**
   * Workspaces and projects are never deleted and a project never changes
   * workspace, so this read stays true until the save; composite foreign keys
   * enforce the same ownership in the database.
   */
  async validateScope(owner: string, scope: WorkspaceScope) {
    if (scope.workspaceId && scope.projectId) {
      // Both in one D1 batch: one round trip, the same checks in order.
      const { workspace, project } = await this.repository.findScope(
        owner,
        scope.workspaceId,
        scope.projectId,
      );
      if (!workspace) fail(404, 'NOT_FOUND', 'Workspace not found.');
      if (!project) fail(404, 'NOT_FOUND', 'Project not found.');
      if (project.workspaceId !== scope.workspaceId)
        fail(
          400,
          'SCOPE_MISMATCH',
          'The project must belong to the selected workspace.',
        );
      return;
    }
    if (scope.workspaceId)
      await this.requireWorkspace(owner, scope.workspaceId);
    if (scope.projectId) {
      const project = await this.requireProject(owner, scope.projectId);
      if (project.workspaceId !== scope.workspaceId)
        fail(
          400,
          'SCOPE_MISMATCH',
          'The project must belong to the selected workspace.',
        );
    }
  }

  /**
   * `validateScope` for a workspace-and-project destination, returning the
   * workspace and all its projects from one batched read. Same errors:
   * 404 for a workspace or project that is not the owner's, 400
   * SCOPE_MISMATCH for a project of another workspace.
   */
  async scopeWithProjects(
    owner: string,
    scope: { workspaceId: string; projectId: string | null },
  ) {
    const { workspace, projects } = await this.repository.workspaceWithProjects(
      owner,
      scope.workspaceId,
    );
    if (!workspace) fail(404, 'NOT_FOUND', 'Workspace not found.');
    // Only a project outside this workspace needs a second look, to say why.
    if (
      scope.projectId &&
      !projects.some((project) => project.id === scope.projectId)
    )
      await this.validateScope(owner, scope);
    return {
      workspace: publicRecord(workspace),
      projects: projects.map(publicRecord),
    };
  }

  private async requireWorkspace(owner: string, id: string) {
    return (
      (await this.repository.findWorkspace(owner, id)) ??
      fail(404, 'NOT_FOUND', 'Workspace not found.')
    );
  }

  private async requireProject(owner: string, id: string) {
    return (
      (await this.repository.findProject(owner, id)) ??
      fail(404, 'NOT_FOUND', 'Project not found.')
    );
  }
}
