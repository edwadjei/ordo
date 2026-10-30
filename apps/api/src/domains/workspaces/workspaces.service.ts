import { isoNow } from '../../platform/time/iso-now.js';
import type { z } from 'zod';
import {
  PROJECT_LIMIT,
  WORKSPACE_LIMIT,
  type DeletePreview,
  type DeleteResult,
  type permanentDeleteInput,
  type workspaceInput,
  type workspacePatch,
  type projectInput,
  type projectPatch,
} from '@ordo/core';
import type { ContentHasher } from '../../capabilities/content-hasher.contract.js';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import {
  assertRevision,
  revisionConflict,
} from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import { WorkspacesRepository } from './workspaces.repository.js';
import { PermanentDeleteRepository } from './permanent-delete.repository.js';

/** `archived: true` stamps the time once; `false` clears it; omitted keeps it. */
function archiving(
  archived: boolean | undefined,
  current: string | null,
  now: string,
) {
  return archived === undefined
    ? {}
    : { archivedAt: archived ? (current ?? now) : null };
}

/** Who is creating, and the retry key they sent. */
export interface CreateOptions {
  createdByTokenId?: string | null;
  idempotencyKey?: string | null;
}

interface StoredRow {
  ownerUserId: string;
  createdByTokenId: string | null;
  idempotencyKey: string | null;
  idempotencyFingerprint: string | null;
}

/** A workspace or project as returned: no owner or retry key; its origin. */
function record<T extends StoredRow>(row: T) {
  const {
    idempotencyKey: _key,
    idempotencyFingerprint: _fingerprint,
    ...rest
  } = publicRecord(row);
  return {
    ...rest,
    origin: (row.createdByTokenId ? 'agent' : 'manual') as 'agent' | 'manual',
  };
}

/** Names match ignoring case and surrounding spaces. */
const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function isUniqueViolation(error: unknown) {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause)
    if (/UNIQUE constraint failed/i.test(String((cause as Error).message)))
      return true;
  return false;
}

export interface WorkspaceScope {
  workspaceId: string | null;
  projectId: string | null;
}

export class WorkspacesService {
  constructor(
    private readonly repository: WorkspacesRepository,
    private readonly deleting: PermanentDeleteRepository,
    private readonly hasher: ContentHasher,
  ) {}

  async listWorkspaces(owner: string) {
    return (await this.repository.listWorkspaces(owner)).map(record);
  }
  async getWorkspace(owner: string, id: string) {
    return record(await this.requireWorkspace(owner, id));
  }

  /**
   * Creates a workspace, or returns the owner's active workspace of the same
   * name (`existing: true`) rather than making a second one. A retried key
   * returns what it first made. At most `WORKSPACE_LIMIT` active ones.
   */
  async createWorkspace(
    owner: string,
    input: z.infer<typeof workspaceInput>,
    options: CreateOptions = {},
  ) {
    const key = options.idempotencyKey ?? null;
    const fingerprint = key
      ? await this.hasher.digest(JSON.stringify(input))
      : null;
    const check = async () => {
      const state = await this.repository.workspaceCreateState(owner, key);
      const previous =
        state.byKey && this.retried(state.byKey, fingerprint, 'workspace');
      const same = state.active.find((row) => sameName(row.name, input.name));
      if (previous ?? same)
        return { workspace: record((previous ?? same)!), existing: true };
      if (state.active.length >= WORKSPACE_LIMIT)
        fail(
          409,
          'LIMIT_REACHED',
          `An account can have at most ${WORKSPACE_LIMIT} workspaces. Archive one first.`,
        );
      return undefined;
    };
    const found = await check();
    if (found) return found;
    let saved;
    try {
      saved = await this.repository.insertWorkspace({
        id: newId(),
        ownerUserId: owner,
        ...input,
        createdByTokenId: options.createdByTokenId ?? null,
        idempotencyKey: key,
        idempotencyFingerprint: fingerprint,
      });
    } catch (error) {
      // A concurrent create with the same key won the unique index.
      if (!isUniqueViolation(error)) throw error;
    }
    if (saved) return { workspace: record(saved), existing: false };
    // Refused or raced: a same-named one, the key's row, or the limit.
    return (await check()) ?? revisionConflict();
  }
  async updateWorkspace(
    owner: string,
    id: string,
    input: z.infer<typeof workspacePatch>,
  ) {
    const row = await this.requireWorkspace(owner, id);
    assertRevision(row.revision, input.expectedRevision);
    const { expectedRevision: _revision, archived, ...patch } = input;
    const now = isoNow();
    const saved = await this.repository.updateWorkspace(
      owner,
      id,
      row.revision,
      { ...patch, ...archiving(archived, row.archivedAt, now), updatedAt: now },
    );
    // Zero rows: another save won between the read and this write.
    return record(saved ?? revisionConflict());
  }

  async listProjects(owner: string, workspaceId?: string) {
    if (workspaceId) await this.requireWorkspace(owner, workspaceId);
    return (await this.repository.listProjects(owner, workspaceId)).map(record);
  }

  async getProject(owner: string, id: string) {
    return record(await this.requireProject(owner, id));
  }

  /**
   * Creates a project, or returns the workspace's active project of the same
   * name (`existing: true`). A retried key returns what it first made. At
   * most `PROJECT_LIMIT` active ones per owner.
   */
  async createProject(
    owner: string,
    input: z.infer<typeof projectInput>,
    options: CreateOptions = {},
  ) {
    const key = options.idempotencyKey ?? null;
    const fingerprint = key
      ? await this.hasher.digest(JSON.stringify(input))
      : null;
    const check = async () => {
      const state = await this.repository.projectCreateState(
        owner,
        input.workspaceId,
        key,
      );
      const previous =
        state.byKey && this.retried(state.byKey, fingerprint, 'project');
      if (previous) return { project: record(previous), existing: true };
      if (!state.workspace) fail(404, 'NOT_FOUND', 'Workspace not found.');
      const same = state.siblings.find((row) => sameName(row.name, input.name));
      if (same) return { project: record(same), existing: true };
      if (state.active >= PROJECT_LIMIT)
        fail(
          409,
          'LIMIT_REACHED',
          `An account can have at most ${PROJECT_LIMIT} projects. Archive one first.`,
        );
      return undefined;
    };
    const found = await check();
    if (found) return found;
    let saved;
    try {
      saved = await this.repository.insertProject({
        id: newId(),
        ownerUserId: owner,
        ...input,
        createdByTokenId: options.createdByTokenId ?? null,
        idempotencyKey: key,
        idempotencyFingerprint: fingerprint,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    if (saved) return { project: record(saved), existing: false };
    return (await check()) ?? revisionConflict();
  }

  async updateProject(
    owner: string,
    id: string,
    input: z.infer<typeof projectPatch>,
  ) {
    const row = await this.requireProject(owner, id);
    assertRevision(row.revision, input.expectedRevision);
    const { expectedRevision: _revision, archived, ...patch } = input;
    const now = isoNow();
    const saved = await this.repository.updateProject(owner, id, row.revision, {
      ...patch,
      ...archiving(archived, row.archivedAt, now),
      updatedAt: now,
    });
    // Zero rows: another save won between the read and this write.
    return record(saved ?? revisionConflict());
  }

  /** What deleting a workspace or project permanently would remove. */
  async deletePreview(
    owner: string,
    kind: 'workspace' | 'project',
    id: string,
  ): Promise<DeletePreview> {
    const row =
      kind === 'workspace'
        ? await this.requireWorkspace(owner, id)
        : await this.requireProject(owner, id);
    return {
      name: row.name,
      ...(await this.deleting.preview(owner, { kind, id })),
    };
  }

  /**
   * Deletes a workspace or project and everything inside it, permanently,
   * in one batch. The typed name must match exactly; a stale revision is a
   * conflict; the owner's last workspace stays.
   */
  async deletePermanently(
    owner: string,
    kind: 'workspace' | 'project',
    id: string,
    input: z.infer<typeof permanentDeleteInput>,
  ): Promise<DeleteResult> {
    const check = async () => {
      const row =
        kind === 'workspace'
          ? await this.requireWorkspace(owner, id)
          : await this.requireProject(owner, id);
      if (input.confirmName !== row.name)
        fail(
          400,
          'CONFIRM_NAME_MISMATCH',
          'Type the name exactly as it is shown to delete it.',
        );
      assertRevision(row.revision, input.expectedRevision);
      if (
        kind === 'workspace' &&
        (await this.repository.listWorkspaces(owner)).length < 2
      )
        fail(
          409,
          'LAST_WORKSPACE',
          'Your last workspace cannot be deleted. Create another one first.',
        );
      return row;
    };
    const row = await check();
    const deleted = await this.deleting.delete(
      owner,
      { kind, id },
      { name: row.name, revision: row.revision },
      isoNow(),
    );
    if (deleted) return { deleted };
    // The guard refused: something changed since the check. Say what.
    await check();
    return revisionConflict();
  }

  /**
   * A project never changes workspace, so this read stays true until the
   * save unless the workspace or project is deleted permanently in between;
   * then the save fails on the composite foreign keys, which enforce the
   * same ownership in the database, and the client gets 409 SCOPE_DELETED.
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
      workspace: record(workspace),
      projects: projects.map(record),
    };
  }

  /** The row a retry key made, or 409 when the key asked for something else. */
  private retried<T extends StoredRow>(
    row: T,
    fingerprint: string | null,
    kind: 'workspace' | 'project',
  ) {
    if (row.idempotencyFingerprint !== fingerprint)
      fail(
        409,
        'IDEMPOTENCY_CONFLICT',
        `This retry key was already used for a different ${kind}.`,
      );
    return row;
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
