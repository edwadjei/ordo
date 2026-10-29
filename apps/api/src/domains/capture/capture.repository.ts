import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  insertWhere,
  sql,
  tables,
  type CaptureRunRecord,
  type NewCaptureRun,
} from '../../adapters/database/database.adapter.js';

const { captureRuns, tasks, drafts } = tables;

/** A task or draft row written by a save; every row names the same columns. */
export type SavedRow = Record<string, unknown> & { id: string };

export class CaptureRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  async insert(run: NewCaptureRun) {
    const [row] = await this.database
      .use()
      .insert(captureRuns)
      .values(run)
      .returning();
    return row;
  }

  async find(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(captureRuns)
      .where(and(eq(captureRuns.id, id), eq(captureRuns.ownerUserId, owner)));
    return row;
  }

  listForNote(owner: string, noteId: string) {
    return (
      this.database
        .use()
        .select()
        .from(captureRuns)
        .where(
          and(
            eq(captureRuns.ownerUserId, owner),
            eq(captureRuns.noteId, noteId),
          ),
        )
        // rowid breaks ties between runs made in the same millisecond.
        .orderBy(asc(captureRuns.createdAt), sql`${captureRuns}.rowid`)
    );
  }

  /**
   * Saves a ready run in one batch (an implicit transaction): the run moves
   * from `ready` to `saved` under this request's random claim, and the tasks
   * and drafts are inserted only if that claim is the one stored. A run that
   * was already saved, or a concurrent save that won, leaves everything as it
   * was. Returns the run as it stands after the batch.
   */
  async save(
    owner: string,
    id: string,
    claim: {
      key: string;
      fingerprint: string;
      claim: string;
      result: { taskIds: string[]; draftIds: string[] };
      now: string;
    },
    taskRows: SavedRow[],
    draftRows: SavedRow[],
  ): Promise<CaptureRunRecord> {
    const db = this.database.use();
    const won = sql`EXISTS (SELECT 1 FROM ${captureRuns} WHERE id = ${id} AND save_claim = ${claim.claim})`;
    const statements = [
      db
        .update(captureRuns)
        .set({
          status: 'saved',
          saveKey: claim.key,
          saveFingerprint: claim.fingerprint,
          saveClaim: claim.claim,
          savedResult: claim.result,
          savedAt: claim.now,
          updatedAt: claim.now,
        })
        .where(
          and(
            eq(captureRuns.id, id),
            eq(captureRuns.ownerUserId, owner),
            eq(captureRuns.status, 'ready'),
          ),
        ),
      ...(taskRows.length ? [db.run(insertWhere(tasks, taskRows, won))] : []),
      ...(draftRows.length
        ? [db.run(insertWhere(drafts, draftRows, won))]
        : []),
      db.select().from(captureRuns).where(eq(captureRuns.id, id)),
    ] as const;
    const results = await db.batch(
      statements as unknown as Parameters<typeof db.batch>[0],
    );
    return (results.at(-1) as CaptureRunRecord[])[0];
  }

  tasksByIds(owner: string, ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.database
      .use()
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.ownerUserId, owner),
          sql`${tasks.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`,
        ),
      )
      .orderBy(asc(tasks.createdAt), asc(tasks.id));
  }

  draftsByIds(owner: string, ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.database
      .use()
      .select()
      .from(drafts)
      .where(
        and(
          eq(drafts.ownerUserId, owner),
          sql`${drafts.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`,
        ),
      )
      .orderBy(asc(drafts.createdAt), asc(drafts.id));
  }
}
