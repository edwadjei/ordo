import { AsyncLocalStorage } from 'node:async_hooks';
import {
  and,
  asc,
  eq,
  getTableColumns,
  gt,
  isNull,
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
  type Database,
} from '@ordo/db';

export { and, asc, eq, gt, isNull, sql, type SQL };
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
};
export type { Database };
export type UserRecord = typeof users.$inferSelect;
export type WorkspaceRecord = typeof workspaces.$inferSelect;
export type ProjectRecord = typeof projects.$inferSelect;
export type TaskRecord = typeof tasks.$inferSelect;
export type NoteRecord = typeof notes.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type NewProject = typeof projects.$inferInsert;
export type NewTask = typeof tasks.$inferInsert;
export type NewNote = typeof notes.$inferInsert;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
export type OtpChallengeRecord = typeof otpChallenges.$inferSelect;

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
