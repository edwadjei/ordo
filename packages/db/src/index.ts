import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.js';
export * from './schema.js';

/** Drizzle on a D1 binding or a D1 Sessions API session. */
export type Database = DrizzleD1Database<typeof schema>;

/** Anything that answers `prepare()` and `batch()`: a D1 binding or session. */
export type D1Client = D1Database | D1DatabaseSession;

interface PreparedBatchQuery {
  getQuery(): { sql: string; params: unknown[] };
  mapResult(result: unknown, isFromBatch: boolean): unknown;
}

/**
 * Wraps a D1 binding (or a session opened from one) with the shared schema.
 * Cheap: call it per request. Migrations are applied separately with
 * `wrangler d1 migrations apply`; this never changes the schema.
 *
 * `batch()` is replaced with an equivalent that prepares every statement on
 * the client itself: drizzle-orm 0.45.4 cannot bind parameters of raw `sql`
 * statements (`db.run`/`db.all`) inside a D1 batch. Results are mapped by
 * Drizzle exactly as before, and the batch is still one D1 call (one
 * implicit transaction).
 */
export function createDatabase(client: D1Client): Database {
  const db = drizzle(client as D1Database, { schema });
  db.batch = (async (queries: readonly unknown[]) => {
    const prepared = queries.map((query) =>
      (query as { _prepare(): PreparedBatchQuery })._prepare(),
    );
    const results = await client.batch(
      prepared.map((query) => {
        const { sql, params } = query.getQuery();
        return client.prepare(sql).bind(...params);
      }),
    );
    return results.map((result, index) =>
      prepared[index].mapResult(result, true),
    );
  }) as Database['batch'];
  return db;
}
