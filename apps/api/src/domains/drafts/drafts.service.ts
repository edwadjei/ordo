import { isoNow } from '../../platform/time/iso-now.js';
import type { z } from 'zod';
import type { Draft, draftInput, draftPatch } from '@ordo/core';
import type { DraftRecord } from '../../adapters/database/database.adapter.js';
import { fail } from '../../platform/http/api-failure.js';
import {
  assertRevision,
  revisionConflict,
} from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { NotesService } from '../notes/notes.service.js';
import { DraftsRepository } from './drafts.repository.js';

/** The API shape: the `recipient` column is `to`; archived drafts are never returned. */
export function publicDraft(row: DraftRecord): Draft {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    sourceNoteId: row.sourceNoteId,
    kind: row.kind,
    to: row.recipient,
    subject: row.subject,
    body: row.body,
    usedAt: row.usedAt,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Email and message drafts. Ordo never sends them; people copy them. */
export class DraftsService {
  constructor(
    private readonly repository: DraftsRepository,
    private readonly workspaces: WorkspacesService,
    private readonly notes: NotesService,
  ) {}

  async list(owner: string) {
    return (await this.repository.list(owner)).map(publicDraft);
  }
  async get(owner: string, id: string) {
    return publicDraft(await this.requireDraft(owner, id));
  }

  async create(owner: string, input: z.infer<typeof draftInput>) {
    await this.workspaces.validateScope(owner, input);
    if (input.sourceNoteId) await this.notes.get(owner, input.sourceNoteId);
    const { to, ...rest } = input;
    return publicDraft(
      await this.repository.insert({
        id: newId(),
        ownerUserId: owner,
        ...rest,
        recipient: to,
      }),
    );
  }

  async update(owner: string, id: string, input: z.infer<typeof draftPatch>) {
    const row = await this.requireDraft(owner, id);
    assertRevision(row.revision, input.expectedRevision);
    const { expectedRevision: _revision, used, to, ...patch } = input;
    const scope = {
      workspaceId: patch.workspaceId ?? row.workspaceId,
      projectId:
        patch.projectId !== undefined
          ? patch.projectId
          : patch.workspaceId && patch.workspaceId !== row.workspaceId
            ? null
            : row.projectId,
    };
    await this.workspaces.validateScope(owner, scope);
    const now = isoNow();
    const saved = await this.repository.updateGuarded(owner, id, row.revision, {
      ...patch,
      ...scope,
      ...(to === undefined ? {} : { recipient: to }),
      ...(used === undefined
        ? {}
        : { usedAt: used ? (row.usedAt ?? now) : null }),
      updatedAt: now,
    });
    return publicDraft(saved ?? revisionConflict());
  }

  async archive(owner: string, id: string, expectedRevision: number) {
    const row = await this.requireDraft(owner, id);
    assertRevision(row.revision, expectedRevision);
    const now = isoNow();
    const saved = await this.repository.updateGuarded(owner, id, row.revision, {
      deletedAt: now,
      updatedAt: now,
    });
    return publicDraft(saved ?? revisionConflict());
  }

  private async requireDraft(owner: string, id: string) {
    return (
      (await this.repository.find(owner, id)) ??
      fail(404, 'NOT_FOUND', 'Draft not found.')
    );
  }
}
