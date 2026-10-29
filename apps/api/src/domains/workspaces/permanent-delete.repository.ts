import type { DeletedCounts } from '@ordo/core';
import {
  DatabaseAdapter,
  sql,
  type SQL,
} from '../../adapters/database/database.adapter.js';

export type DeleteTarget =
  { kind: 'workspace'; id: string } | { kind: 'project'; id: string };

/**
 * Permanent deletion of a workspace or a project and everything inside it:
 * projects, tasks at every level (archived ones too), notes, drafts, capture
 * runs, retry keys and task links. Workers and D1 have no interactive
 * transactions, so it is one `batch()` (one implicit transaction) in which
 * every statement carries the same guard: the row still has the name and
 * revision the person confirmed and, for a workspace, it is not the owner's
 * last. Rows elsewhere that only point at a deleted note (a task or draft
 * saved from it but filed in another workspace) are kept and lose the
 * pointer. FTS rows go with their rows through the delete triggers, and task
 * links through `ON DELETE CASCADE`.
 */
export class PermanentDeleteRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  /** Counts of what deleting the target would remove, archived items included. */
  async preview(owner: string, target: DeleteTarget): Promise<DeletedCounts> {
    const [row] = await this.database
      .use()
      .all<DeletedCounts>(counts(owner, target, sql`1`));
    return row;
  }

  /**
   * Deletes the target if the guard holds when the batch runs. Returns the
   * counts removed, or `undefined` when the guard refused (nothing changed).
   */
  async delete(
    owner: string,
    target: DeleteTarget,
    confirmed: { name: string; revision: number },
    now: string,
  ): Promise<DeletedCounts | undefined> {
    const db = this.database.use();
    const self =
      target.kind === 'workspace'
        ? sql`workspaces WHERE id = ${target.id} AND owner_user_id = ${owner} AND name = ${confirmed.name} AND revision = ${confirmed.revision}`
        : sql`projects WHERE id = ${target.id} AND owner_user_id = ${owner} AND name = ${confirmed.name} AND revision = ${confirmed.revision}`;
    const guard =
      target.kind === 'workspace'
        ? sql`EXISTS (SELECT 1 FROM ${self}) AND (SELECT COUNT(*) FROM workspaces WHERE owner_user_id = ${owner}) > 1`
        : sql`EXISTS (SELECT 1 FROM ${self})`;
    const scope = inScope(target);
    const notes = sql`(SELECT id FROM notes WHERE owner_user_id = ${owner} AND ${scope})`;
    const tasks = sql`(SELECT id FROM tasks WHERE owner_user_id = ${owner} AND ${scope})`;
    const statements: SQL[] = [
      counts(owner, target, guard),
      // Kept elsewhere, but no longer pointing at a deleted note.
      sql`UPDATE tasks SET source_note_id = NULL, revision = revision + 1, updated_at = ${now}
           WHERE owner_user_id = ${owner} AND NOT (${scope}) AND source_note_id IN ${notes} AND ${guard}`,
      sql`UPDATE drafts SET source_note_id = NULL, revision = revision + 1, updated_at = ${now}
           WHERE owner_user_id = ${owner} AND NOT (${scope}) AND source_note_id IN ${notes} AND ${guard}`,
      sql`DELETE FROM idempotency_keys WHERE owner_user_id = ${owner} AND task_id IN ${tasks} AND ${guard}`,
      sql`DELETE FROM tasks WHERE owner_user_id = ${owner} AND ${scope} AND ${guard}`,
      sql`DELETE FROM capture_runs WHERE owner_user_id = ${owner} AND (${scope} OR note_id IN ${notes}) AND ${guard}`,
      sql`DELETE FROM drafts WHERE owner_user_id = ${owner} AND ${scope} AND ${guard}`,
      sql`DELETE FROM notes WHERE owner_user_id = ${owner} AND ${scope} AND ${guard}`,
      ...(target.kind === 'workspace'
        ? [
            sql`DELETE FROM projects WHERE owner_user_id = ${owner} AND workspace_id = ${target.id} AND ${guard}`,
          ]
        : []),
      // Last, so every statement above still sees the row its guard needs.
      sql`DELETE FROM ${self} AND ${
        target.kind === 'workspace'
          ? sql`(SELECT COUNT(*) FROM workspaces WHERE owner_user_id = ${owner}) > 1`
          : sql`1`
      } RETURNING id`,
    ];
    const results = (await db.batch(
      statements.map((statement) => db.all(statement)) as unknown as Parameters<
        typeof db.batch
      >[0],
    )) as unknown as unknown[][];
    const [removed] = results[0] as DeletedCounts[];
    return (results.at(-1) as { id: string }[]).length ? removed : undefined;
  }
}

/**
 * Inside the target: its column in every table that has one. `IS`, not `=`,
 * so `NOT (scope)` is also true for Inbox rows, whose workspace and project
 * are NULL.
 */
function inScope(target: DeleteTarget) {
  return target.kind === 'workspace'
    ? sql`workspace_id IS ${target.id}`
    : sql`project_id IS ${target.id}`;
}

function counts(owner: string, target: DeleteTarget, guard: SQL) {
  const scope = inScope(target);
  const projects =
    target.kind === 'workspace'
      ? sql`(SELECT COUNT(*) FROM projects WHERE owner_user_id = ${owner} AND workspace_id = ${target.id})`
      : sql`(SELECT COUNT(*) FROM projects WHERE owner_user_id = ${owner} AND id = ${target.id})`;
  return sql`SELECT ${projects} AS projects,
      (SELECT COUNT(*) FROM tasks WHERE owner_user_id = ${owner} AND ${scope}) AS tasks,
      (SELECT COUNT(*) FROM notes WHERE owner_user_id = ${owner} AND ${scope}) AS notes,
      (SELECT COUNT(*) FROM drafts WHERE owner_user_id = ${owner} AND ${scope}) AS drafts,
      (SELECT COUNT(*) FROM capture_runs WHERE owner_user_id = ${owner}
         AND (${scope} OR note_id IN (SELECT id FROM notes WHERE owner_user_id = ${owner} AND ${scope}))) AS captureRuns
    WHERE ${guard}`;
}
