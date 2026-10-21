import type { z } from 'zod';
import type { NoteInput, notePatch } from '@ordo/core';
import type {
  DatabaseAdapter,
  TransactionContext,
} from '../../adapters/database/database.adapter.js';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import { assertRevision } from '../../platform/http/revision.js';
import { newId } from '../../platform/identifiers/new-id.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import { NotesRepository } from './notes.repository.js';

export class NotesService {
  constructor(
    private readonly repository: NotesRepository,
    private readonly transactions: DatabaseAdapter,
    private readonly workspaces: WorkspacesService,
  ) {}

  async list(owner: string) {
    return (await this.repository.list(owner)).map(publicRecord);
  }
  async get(owner: string, id: string) {
    return publicRecord(await this.requireNote(owner, id));
  }

  async create(owner: string, input: NoteInput) {
    return this.transactions.forOwner(owner, async (transaction) => {
      await this.workspaces.validateScope(owner, input, transaction);
      return publicRecord(
        await this.repository.insert(
          { id: newId(), ownerUserId: owner, ...input },
          transaction,
        ),
      );
    });
  }

  async update(owner: string, id: string, input: z.infer<typeof notePatch>) {
    return this.transactions.forOwner(owner, async (transaction) => {
      const row = await this.requireNote(owner, id, transaction);
      assertRevision(row.revision, input.expectedRevision);
      const { expectedRevision: _revision, ...patch } = input;
      await this.workspaces.validateScope(
        owner,
        { ...row, ...patch },
        transaction,
      );
      return publicRecord(
        await this.repository.update(
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

  async archive(owner: string, id: string, expectedRevision: number) {
    return this.transactions.forOwner(owner, async (transaction) => {
      const row = await this.requireNote(owner, id, transaction);
      assertRevision(row.revision, expectedRevision);
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

  private async requireNote(
    owner: string,
    id: string,
    transaction?: TransactionContext,
  ) {
    return (
      (await this.repository.find(owner, id, transaction)) ??
      fail(404, 'NOT_FOUND', 'Note not found.')
    );
  }
}
