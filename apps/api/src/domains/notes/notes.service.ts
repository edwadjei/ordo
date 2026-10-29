import { isoNow } from '../../platform/time/iso-now.js';
import type { z } from 'zod';
import {
  noteBodyLength,
  notePreview,
  type NoteInput,
  type notePatch,
} from '@ordo/core';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import {
  assertRevision,
  revisionConflict,
} from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import { NotesRepository } from './notes.repository.js';

/** A whole note: its body plus the same `preview` and `bodyLength` lists carry. */
function publicNote<T extends { ownerUserId: string; body: string }>(row: T) {
  return {
    ...publicRecord(row),
    preview: notePreview(row.body),
    bodyLength: noteBodyLength(row.body),
  };
}

export class NotesService {
  constructor(
    private readonly repository: NotesRepository,
    private readonly workspaces: WorkspacesService,
  ) {}

  async list(owner: string, includeArchived = false) {
    return (await this.repository.list(owner, includeArchived)).map(
      publicRecord,
    );
  }
  async get(owner: string, id: string) {
    return publicNote(await this.requireNote(owner, id));
  }

  /** A note's text for processing, without building its preview. */
  async text(owner: string, id: string) {
    const { title, body, source, revision } = await this.requireNote(owner, id);
    return { title, body, source, revision };
  }

  /** With an agent's token id, the note's origin is `agent` (server-set). */
  async create(
    owner: string,
    input: NoteInput,
    createdByTokenId: string | null = null,
  ) {
    await this.workspaces.validateScope(owner, input);
    return publicNote(
      await this.repository.insert({
        id: newId(),
        ownerUserId: owner,
        ...input,
        ...(createdByTokenId
          ? { origin: 'agent' as const, createdByTokenId }
          : {}),
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
    return publicNote(saved ?? revisionConflict());
  }

  async archive(owner: string, id: string, expectedRevision: number) {
    const row = await this.requireNote(owner, id);
    assertRevision(row.revision, expectedRevision);
    const now = isoNow();
    const saved = await this.repository.updateGuarded(owner, id, row.revision, {
      deletedAt: now,
      updatedAt: now,
    });
    return publicNote(saved ?? revisionConflict());
  }

  private async requireNote(owner: string, id: string) {
    return (
      (await this.repository.find(owner, id)) ??
      fail(404, 'NOT_FOUND', 'Note not found.')
    );
  }
}
