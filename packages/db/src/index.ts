import { PGlite } from '@electric-sql/pglite';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { drizzle as postgresDrizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as schema from './schema.js';
export * from './schema.js';
// Both drivers implement the same PostgreSQL query surface used by domain services.
export type Database = PgDatabase<any, typeof schema>;
export interface DatabaseConnection {
  db: Database;
  close: () => Promise<void>;
}
export async function openDatabase(
  options: { url?: string; dataDir?: string } = {},
): Promise<DatabaseConnection> {
  const directory = new URL('../migrations/', import.meta.url);
  const filenames = (await readdir(directory))
    .filter((name) => /^\d+_[\w-]+\.sql$/.test(name))
    .sort();
  const migrations = await Promise.all(
    filenames.map(async (name) => {
      const statement = await readFile(new URL(name, directory), 'utf8');
      return {
        version: Number(name.split('_')[0]),
        statement,
        checksum: createHash('sha256').update(statement).digest('hex'),
      };
    }),
  );
  if (new Set(migrations.map((m) => m.version)).size !== migrations.length)
    throw new Error('Duplicate migration versions.');
  const migrate = async (
    execute: (statement: string) => Promise<unknown>,
    getVersions: () => Promise<{ version: number; checksum: string }[]>,
  ) => {
    await execute(
      'CREATE TABLE IF NOT EXISTS ordo_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const versions = await getVersions();
    for (const applied of versions) {
      if (
        !migrations.some(
          (m) =>
            m.version === applied.version && m.checksum === applied.checksum,
        )
      )
        throw new Error(
          'Applied migration checksum mismatch; preserve migration history and add a new numbered migration.',
        );
    }
    for (const migration of migrations) {
      if (versions.some((applied) => applied.version === migration.version))
        continue;
      await execute(
        `BEGIN; ${migration.statement} INSERT INTO ordo_migrations(version, checksum) VALUES (${migration.version}, '${migration.checksum}'); COMMIT;`,
      );
    }
  };
  if (options.url) {
    const client = postgres(options.url, { max: 1 });
    try {
      await migrate(
        (statement) => client.unsafe(statement),
        async () =>
          Array.from(
            await client<
              { version: number; checksum: string }[]
            >`SELECT version, checksum FROM ordo_migrations ORDER BY version`,
          ),
      );
      return {
        db: postgresDrizzle(client, { schema }) as unknown as Database,
        close: () => client.end(),
      };
    } catch (error) {
      await client.end();
      throw error;
    }
  }
  if (options.dataDir) await mkdir(options.dataDir, { recursive: true });
  const client = new PGlite(options.dataDir);
  try {
    await migrate(
      (statement) => client.exec(statement),
      async () =>
        (
          await client.query<{ version: number; checksum: string }>(
            'SELECT version, checksum FROM ordo_migrations ORDER BY version',
          )
        ).rows,
    );
    return {
      db: pgliteDrizzle(client, { schema }) as unknown as Database,
      close: () => client.close(),
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
