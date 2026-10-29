import type {
  NoteSummary,
  RelatedItems,
  TaskNoteLink,
  TaskSummary,
} from '@ordo/core';
import { fail } from '../../platform/http/api-failure.js';
import { publicRecord } from '../../platform/http/response.js';
import { isoNow } from '../../platform/time/iso-now.js';
import { publicDraft } from '../drafts/drafts.service.js';
import type { RelatedRepository } from './related.repository.js';

/**
 * What surrounds a task: the note it was saved from, the other tasks and
 * drafts saved from that note, and notes linked to it by hand.
 */
export class RelatedService {
  constructor(private readonly repository: RelatedRepository) {}

  async related(
    owner: string,
    taskId: string,
    includeArchived: boolean,
  ): Promise<RelatedItems> {
    const rows = await this.repository.related(owner, taskId, includeArchived);
    if (!rows.task) fail(404, 'NOT_FOUND', 'Task not found.');
    const note = (row: Record<string, unknown>) =>
      publicRecord(row as { ownerUserId: string }) as unknown as NoteSummary;
    return {
      sourceNote: rows.sourceNote ? note(rows.sourceNote) : null,
      linkedNotes: rows.linkedNotes.map(note),
      captureTasks: rows.captureTasks.map((task) => {
        const { description: _description, ...summary } = publicRecord(task);
        return summary as TaskSummary;
      }),
      drafts: rows.drafts.map(publicDraft),
    };
  }

  /** 201 for a new link, 200 when it already existed; 404 if either side is not the owner's. */
  async link(owner: string, taskId: string, noteId: string) {
    return ((await this.repository.link(owner, taskId, noteId, isoNow())) ??
      fail(404, 'NOT_FOUND', 'Task or note not found.')) as {
      link: TaskNoteLink;
      created: boolean;
    };
  }

  async unlink(owner: string, taskId: string, noteId: string) {
    if (!(await this.repository.unlink(owner, taskId, noteId)))
      fail(404, 'NOT_FOUND', 'Link not found.');
  }
}
