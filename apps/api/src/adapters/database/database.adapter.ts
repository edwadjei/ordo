import { AsyncLocalStorage } from 'node:async_hooks';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  isNull,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  users,
  sessions,
  workspaces,
  projects,
  tasks,
  notes,
  idempotencyKeys,
  otpChallenges,
  audioSettings,
  authThrottle,
  drafts,
  captureRuns,
  aiSettings,
  taskNoteLinks,
  agentTokens,
  agentActivity,
  type Database,
} from '@ordo/db';

export { and, asc, desc, eq, getTableColumns, gt, isNull, ne, sql, type SQL };
export const tables = {
  users,
  sessions,
  workspaces,
  projects,
  tasks,
  notes,
  idempotencyKeys,
  otpChallenges,
  audioSettings,
  authThrottle,
  drafts,
  captureRuns,
  aiSettings,
  taskNoteLinks,
  agentTokens,
  agentActivity,
};
export type { Database };
export type UserRecord = typeof users.$inferSelect;
export type WorkspaceRecord = typeof workspaces.$inferSelect;
export type ProjectRecord = typeof projects.$inferSelect;
export type TaskRecord = typeof tasks.$inferSelect;
export type NoteRecord = typeof notes.$inferSelect;
export type DraftRecord = typeof drafts.$inferSelect;
export type AgentTokenRecord = typeof agentTokens.$inferSelect;
export type CaptureRunRecord = typeof captureRuns.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
export type NewCaptureRun = typeof captureRuns.$inferInsert;
export type NewUser = typeof users.$inferInsert;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type NewProject = typeof projects.$inferInsert;
export type NewTask = typeof tasks.$inferInsert;
export type NewNote = typeof notes.$inferInsert;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
export type OtpChallengeRecord = typeof otpChallenges.$inferSelect;

/**
 * Each note with the status of its newest capture run (or null): one
 * correlated lookup per note on `capture_runs_note_idx`
 * (owner_user_id, note_id, created_at), inside the same query. The outer
 * columns are written out in full: Drizzle leaves column names unqualified
 * in a one-table select, which would bind them to `capture_runs` instead.
 */
const latestCaptureStatus = sql<
  'ready' | 'failed' | 'pending' | 'saved' | null
>`(SELECT r.status FROM ${captureRuns} AS r WHERE r.owner_user_id = "notes"."owner_user_id" AND r.note_id = "notes"."id" ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1)`;

/**
 * A list entry: every column but the body, which can be 100,000 characters,
 * plus its first 280 characters and its length. SQLite's `substr` and
 * `length` count code points, so the preview never splits a character and
 * the full body never leaves D1 (no transfer, no parsing, no JSON).
 */
const { body: _body, ...summaryColumns } = getTableColumns(notes);
const noteSummary = {
  ...summaryColumns,
  preview: sql<string>`substr("notes"."body", 1, 280)`,
  bodyLength: sql<number>`length("notes"."body")`,
  latestCaptureStatus,
};

/** Note selections shared by the notes and related-items repositories. */
export const noteColumns = {
  withCaptureStatus: { ...getTableColumns(notes), latestCaptureStatus },
  summary: noteSummary,
};

/**
 * Rows of `table` whose workspace or project is archived are left out of
 * default lists, Home and search; `?includeArchived=1` brings them back.
 * Both lookups are primary-key probes. The table name is written out in
 * full, so the subqueries never bind its columns to their own tables.
 */
export function notInArchivedScope(table: 'tasks' | 'notes' | 'drafts') {
  return sql.raw(
    `NOT EXISTS (SELECT 1 FROM workspaces AS archived_w WHERE archived_w.id = "${table}"."workspace_id" AND archived_w.archived_at IS NOT NULL)` +
      ` AND NOT EXISTS (SELECT 1 FROM projects AS archived_p WHERE archived_p.id = "${table}"."project_id" AND archived_p.archived_at IS NOT NULL)`,
  );
}

/** One D1 statement that can go into `batch()`. */
export type BatchStatement = Parameters<Database['batch']>[0][number];

/**
 * The request's database. On the Worker each request runs inside `run()` with
 * Drizzle on its own D1 Sessions API session (opened from the client's
 * bookmark); repositories always call `use()`, so they read and write through
 * that session. Outside a request scope it falls back to the database given
 * at construction (tests and tooling).
 *
 * There are no interactive transactions on D1: multi-row writes go through one
 * `batch()` (an implicit transaction) and races are decided by conditional
 * statements (check-on-save), never by locks.
 */
export class DatabaseAdapter {
  private readonly scope = new AsyncLocalStorage<Database>();

  constructor(private readonly fallback?: Database) {}

  run<T>(database: Database, work: () => Promise<T>): Promise<T> {
    return this.scope.run(database, work);
  }

  use(): Database {
    const database = this.scope.getStore() ?? this.fallback;
    if (!database) throw new Error('No database is bound to this request.');
    return database;
  }
}

/**
 * `INSERT INTO table (…) SELECT … FROM json_each(?) WHERE guard`: inserts the
 * given rows only when `guard` holds when the statement runs. The rows travel
 * as one JSON parameter (D1 allows at most 100 bound parameters per
 * statement). Every row must name the same columns; booleans become 0/1.
 */
export function insertWhere(
  table: SQLiteTable,
  rows: Record<string, unknown>[],
  guard: SQL,
): SQL {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const keys = Object.keys(rows[0]);
  const names = keys.map((key) => {
    const column = columns[key];
    if (!column) throw new Error(`Unknown column ${key}`);
    return column.name;
  });
  const payload = rows.map((row) =>
    Object.fromEntries(
      keys.map((key, index) => {
        if (!(key in row)) throw new Error(`Row is missing ${key}`);
        const value = row[key];
        return [
          names[index],
          typeof value === 'boolean' ? Number(value) : value,
        ];
      }),
    ),
  );
  const target = sql.join(
    names.map((name) => sql.identifier(name)),
    sql`, `,
  );
  const values = sql.join(
    names.map((name) => sql`json_extract(value, ${`$."${name}"`})`),
    sql`, `,
  );
  return sql`INSERT INTO ${table} (${target}) SELECT ${values} FROM json_each(${JSON.stringify(payload)}) WHERE ${guard}`;
}
