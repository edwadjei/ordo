import { isoNow } from '../../platform/time/iso-now.js';
import type { z } from 'zod';
import type { NoteInput, notePatch } from '@ordo/core';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import {
  assertRevision,
  revisionConflict,
} from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import { NotesRepository } from './notes.repository.js';

export class NotesService {
  constructor(
    private readonly repository: NotesRepository,
    private readonly workspaces: WorkspacesService,
  ) {}

  async list(owner: string) {
    return (await this.repository.list(owner)).map(publicRecord);
  }
  async get(owner: string, id: string) {
    return publicRecord(await this.requireNote(owner, id));
  }

  async create(owner: string, input: NoteInput) {
    await this.workspaces.validateScope(owner, input);
    return publicRecord(
      await this.repository.insert({
        id: newId(),
        ownerUserId: owner,
        ...input,
      }),
    );
  }

  async update(owner: string, id: string, input: z.infer<typeof notePatch>) {
    const row = await this.requireNote(owner, id);
    assertRevision(row.revision, input.expectedRevision);
    const { expectedRevision: _revision, ...patch } = input;
    await this.workspaces.validateScope(owner, { ...row, ...patch });
    const saved = await this.repository.updateGuarded(owner, id, row.revision, {
      ...patch,
      updatedAt: isoNow(),
    });
    return publicRecord(saved ?? revisionConflict());
  }

  async archive(owner: string, id: string, expectedRevision: number) {
    const row = await this.requireNote(owner, id);
    assertRevision(row.revision, expectedRevision);
    const now = isoNow();
    const saved = await this.repository.updateGuarded(owner, id, row.revision, {
      deletedAt: now,
      updatedAt: now,
    });
    return publicRecord(saved ?? revisionConflict());
  }

  private async requireNote(owner: string, id: string) {
    return (
      (await this.repository.find(owner, id)) ??
      fail(404, 'NOT_FOUND', 'Note not found.')
    );
  }
}
