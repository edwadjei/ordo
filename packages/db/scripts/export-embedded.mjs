// One-time export of the former embedded PostgreSQL (PGlite) database to JSON,
// one file per table, for `import-local.ts`. PGlite is no longer a dependency
// of this repository, so run this from a checkout that still has it (any
// commit before Phase 2, for example `main` before the D1 merge), from that
// checkout's root:
//
//   node <this repo>/packages/db/scripts/export-embedded.mjs <data dir> <out dir>
//
// It opens the database read-only in spirit (SELECTs only) but PGlite still
// needs write access to its folder, so point it at a COPY of the data
// directory, never the live one, and stop the old API first.
//
// Exported: users (without password hashes), workspaces, projects, tasks,
// idempotency_keys, notes, audio_settings. Never exported: sessions, OTP
// challenges, password hashes, migration bookkeeping.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [dataDir, outDir] = process.argv.slice(2);
if (!dataDir || !outDir) {
  console.error('Usage: node export-embedded.mjs <data dir copy> <out dir>');
  process.exit(2);
}
const require = createRequire(join(process.cwd(), 'package.json'));
const { PGlite } = await import(
  require.resolve('@electric-sql/pglite', { paths: [process.cwd()] })
);

const tables = {
  users: [
    'id',
    'email',
    'display_name',
    'timezone',
    'phone',
    'email_verified_at',
    'phone_verified_at',
    'demo_loaded',
    'created_at',
    'updated_at',
  ],
  workspaces: '*',
  projects: '*',
  tasks: '*',
  idempotency_keys: '*',
  notes: '*',
  audio_settings: '*',
};

const client = new PGlite(resolve(dataDir));
try {
  await mkdir(outDir, { recursive: true });
  for (const [table, columns] of Object.entries(tables)) {
    const select = Array.isArray(columns)
      ? columns.map((name) => `t.${name}`).join(', ')
      : 't.*';
    // row_to_json keeps dates as YYYY-MM-DD and timestamps as ISO text.
    const result = await client.query(
      `SELECT row_to_json(r) AS row FROM (SELECT ${select} FROM ${table} t ORDER BY 1) r`,
    );
    const rows = result.rows.map((entry) => entry.row);
    await writeFile(
      join(outDir, `${table}.json`),
      JSON.stringify(rows, null, 1) + '\n',
      { mode: 0o600 },
    );
    console.log(`${table}: ${rows.length}`);
  }
} finally {
  await client.close();
}
