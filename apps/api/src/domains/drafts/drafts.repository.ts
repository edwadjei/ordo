import {
  DatabaseAdapter,
  and,
  desc,
  eq,
  isNull,
  notInArchivedScope,
  sql,
  tables,
  type NewDraft,
} from '../../adapters/database/database.adapter.js';

const { drafts } = tables;

export class DraftsRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  list(
    owner: string,
    filter: {
      workspaceId?: string;
      projectId?: string;
      includeArchived?: boolean;
    },
  ) {
    return this.database
      .use()
      .select()
      .from(drafts)
      .where(
        and(
          eq(drafts.ownerUserId, owner),
          isNull(drafts.deletedAt),
          filter.workspaceId
            ? eq(drafts.workspaceId, filter.workspaceId)
            : undefined,
          filter.projectId ? eq(drafts.projectId, filter.projectId) : undefined,
          filter.includeArchived ? undefined : notInArchivedScope('drafts'),
        ),
      )
      .orderBy(desc(drafts.createdAt), desc(drafts.id));
  }

  async find(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(drafts)
      .where(
        and(
          eq(drafts.id, id),
          eq(drafts.ownerUserId, owner),
          isNull(drafts.deletedAt),
        ),
      );
    return row;
  }

  async insert(input: NewDraft) {
    const [row] = await this.database
      .use()
      .insert(drafts)
      .values(input)
      .returning();
    return row;
  }

  /** Conditional on the revision the caller read; `undefined` if it changed. */
  async updateGuarded(
    owner: string,
    id: string,
    expectedRevision: number,
    patch: Partial<NewDraft>,
  ) {
    const [row] = await this.database
      .use()
      .update(drafts)
      .set({ ...patch, revision: sql`${drafts.revision} + 1` })
      .where(
        and(
          eq(drafts.id, id),
          eq(drafts.ownerUserId, owner),
          eq(drafts.revision, expectedRevision),
          isNull(drafts.deletedAt),
        ),
      )
      .returning();
    return row;
  }
}
