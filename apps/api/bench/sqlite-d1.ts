import { DatabaseSync, type StatementSync } from 'node:sqlite';

/**
 * A small in-process stand-in for the D1 binding on Node's `node:sqlite`, for
 * the CPU benchmark only. Every call runs synchronously, so the benchmark can
 * time SQLite exactly and leave it out: on Cloudflare, query execution
 * happens in D1, not in the Worker's CPU time. It implements what Drizzle's
 * D1 driver and Ordo use: `prepare().bind().all() / run() / raw() / first()`
 * and `batch()` (one transaction), with foreign keys on, as D1 has them.
 */
export class SqliteD1 {
  readonly db: DatabaseSync;
  /** Microseconds of CPU spent inside SQLite since the last reset. */
  sqliteMicros = 0;
  calls = 0;
  readonly statements = new Map<string, StatementSync>();
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON');
  }
  timed<T>(work: () => T): T {
    this.calls++;
    const before = process.threadCpuUsage();
    try {
      return work();
    } finally {
      const used = process.threadCpuUsage(before);
      this.sqliteMicros += used.user + used.system;
    }
  }
  prepare(sql: string) {
    return new SqliteStatement(this, sql, []);
  }
  async batch(statements: SqliteStatement[]) {
    return this.timed(() => {
      this.db.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        this.db.exec('COMMIT');
        return results;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    });
  }
  async exec(sql: string) {
    this.timed(() => this.db.exec(sql));
    return { count: 1, duration: 0 };
  }
  /** D1 Sessions API: one local database, so every session is this one. */
  withSession() {
    return this;
  }
  getBookmark() {
    return null;
  }
}

type Value = string | number | bigint | null | Uint8Array;

class SqliteStatement {
  constructor(
    private readonly owner: SqliteD1,
    private readonly sql: string,
    private readonly values: Value[],
  ) {}
  bind(...values: unknown[]) {
    return new SqliteStatement(
      this.owner,
      this.sql,
      values.map((value) =>
        value === undefined
          ? null
          : typeof value === 'boolean'
            ? Number(value)
            : (value as Value),
      ),
    );
  }
  private statement() {
    let statement = this.owner.statements.get(this.sql);
    if (!statement) {
      statement = this.owner.db.prepare(this.sql);
      this.owner.statements.set(this.sql, statement);
    }
    return statement;
  }
  /** One D1 result: rows as objects and the write metadata. */
  execute() {
    const statement = this.statement();
    statement.setReturnArrays(false);
    if (statement.columns().length === 0) {
      const info = statement.run(...this.values);
      return {
        success: true,
        results: [],
        meta: {
          changes: Number(info.changes),
          last_row_id: Number(info.lastInsertRowid),
        },
      };
    }
    const results = statement.all(...this.values);
    return { success: true, results, meta: { changes: 0, last_row_id: 0 } };
  }
  async all() {
    return this.owner.timed(() => this.execute());
  }
  async run() {
    return this.owner.timed(() => this.execute());
  }
  async raw(options?: { columnNames?: boolean }) {
    return this.owner.timed(() => {
      const statement = this.statement();
      if (statement.columns().length === 0) {
        statement.run(...this.values);
        return [];
      }
      statement.setReturnArrays(true);
      try {
        const rows = statement.all(...this.values) as unknown as Value[][];
        return options?.columnNames
          ? [statement.columns().map((column) => column.name), ...rows]
          : rows;
      } finally {
        statement.setReturnArrays(false);
      }
    });
  }
  async first(column?: string) {
    return this.owner.timed(() => {
      const row = this.execute().results[0] as
        Record<string, unknown> | undefined;
      return row === undefined ? null : column ? row[column] : row;
    });
  }
}
