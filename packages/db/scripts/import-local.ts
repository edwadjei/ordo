/**
 * One-time load of an embedded-database export (`export-embedded.mjs`: one
 * JSON file per table) into a LOCAL D1 database through
 * `wrangler d1 execute --local`, in batches, then a per-table count check.
 * It never touches a remote database: every Wrangler call carries --local.
 *
 *   npx tsx packages/db/scripts/import-local.ts --from <export dir> \
 *     [--config apps/api/wrangler.jsonc] [--persist-to <state dir>] \
 *     [--keep-provider-keys]
 *
 * Transform (Cloudflare platform spec, "Data import"): timestamps to ISO UTC
 * text, booleans to 0/1, IDs and revisions kept. Sessions, OTP challenges and
 * password hashes are never read, so everyone signs in again with a code.
 * Encrypted provider keys are dropped unless --keep-provider-keys says the
 * Worker has the same ORDO_CREDENTIAL_KEY as the old local key; otherwise
 * owners re-enter their key in Settings. FTS triggers fill the search tables.
 * The target must have the migrations applied and contain no users.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

type Row = Record<string, unknown>;
type Value = string | number | null;
export type TableName =
  | 'users'
  | 'workspaces'
  | 'projects'
  | 'tasks'
  | 'idempotency_keys'
  | 'notes'
  | 'audio_settings';

/** Load order respects foreign keys. */
export const importOrder: TableName[] = [
  'users',
  'workspaces',
  'projects',
  'tasks',
  'idempotency_keys',
  'notes',
  'audio_settings',
];

const timestamp = (value: unknown, column: string): string | null => {
  if (value === null || value === undefined) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`Invalid timestamp in ${column}`);
  return parsed.toISOString();
};
const requiredTimestamp = (value: unknown, column: string) =>
  timestamp(value, column) ?? new Date(0).toISOString();
const date = (value: unknown, column: string): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
    throw new Error(`Invalid date in ${column}`);
  return text;
};
const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
const flag = (value: unknown) => (value === true || value === 1 ? 1 : 0);
const integer = (value: unknown, fallback = 1) =>
  Number.isInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : fallback;
const name = (value: unknown) => {
  const trimmed = String(value ?? '')
    .trim()
    .slice(0, 80);
  return trimmed || null;
};

/** One exported row → the D1 column values for that table. */
export function transform(
  table: TableName,
  row: Row,
  options: { keepProviderKeys: boolean },
): Record<string, Value> {
  switch (table) {
    case 'users':
      return {
        id: text(row.id),
        email: text(row.email),
        display_name:
          String(row.display_name ?? '')
            .trim()
            .slice(0, 80) || 'Ordo member',
        timezone: text(row.timezone) ?? 'Africa/Accra',
        phone: text(row.phone),
        email_verified_at: timestamp(
          row.email_verified_at,
          'email_verified_at',
        ),
        phone_verified_at: timestamp(
          row.phone_verified_at,
          'phone_verified_at',
        ),
        demo_loaded: flag(row.demo_loaded),
        created_at: requiredTimestamp(row.created_at, 'created_at'),
        updated_at: requiredTimestamp(row.updated_at, 'updated_at'),
      };
    case 'workspaces':
      return {
        id: text(row.id),
        owner_user_id: text(row.owner_user_id),
        name: text(row.name),
        color: text(row.color),
        revision: integer(row.revision),
        created_at: requiredTimestamp(row.created_at, 'created_at'),
        updated_at: requiredTimestamp(row.updated_at, 'updated_at'),
      };
    case 'projects':
      return {
        id: text(row.id),
        owner_user_id: text(row.owner_user_id),
        workspace_id: text(row.workspace_id),
        name: text(row.name),
        description: text(row.description) ?? '',
        revision: integer(row.revision),
        created_at: requiredTimestamp(row.created_at, 'created_at'),
        updated_at: requiredTimestamp(row.updated_at, 'updated_at'),
      };
    case 'tasks':
      return {
        id: text(row.id),
        owner_user_id: text(row.owner_user_id),
        workspace_id: text(row.workspace_id),
        project_id: text(row.project_id),
        parent_id: text(row.parent_id),
        title: text(row.title),
        description: text(row.description) ?? '',
        status: text(row.status) ?? 'todo',
        priority: text(row.priority),
        due_date: date(row.due_date, 'due_date'),
        due_time: text(row.due_time),
        follow_up_date: date(row.follow_up_date, 'follow_up_date'),
        follow_up_time: text(row.follow_up_time),
        responsible_person: name(row.responsible_person),
        waiting_on: name(row.waiting_on),
        completed_at: timestamp(row.completed_at, 'completed_at'),
        deleted_at: timestamp(row.deleted_at, 'deleted_at'),
        revision: integer(row.revision),
        created_at: requiredTimestamp(row.created_at, 'created_at'),
        updated_at: requiredTimestamp(row.updated_at, 'updated_at'),
      };
    case 'idempotency_keys':
      return {
        id: text(row.id),
        owner_user_id: text(row.owner_user_id),
        key: text(row.key),
        fingerprint: text(row.fingerprint),
        task_id: text(row.task_id),
        created_at: requiredTimestamp(row.created_at, 'created_at'),
      };
    case 'notes':
      return {
        id: text(row.id),
        owner_user_id: text(row.owner_user_id),
        workspace_id: text(row.workspace_id),
        project_id: text(row.project_id),
        title: text(row.title),
        body: text(row.body) ?? '',
        deleted_at: timestamp(row.deleted_at, 'deleted_at'),
        revision: integer(row.revision),
        created_at: requiredTimestamp(row.created_at, 'created_at'),
        updated_at: requiredTimestamp(row.updated_at, 'updated_at'),
      };
    case 'audio_settings':
      return {
        owner_user_id: text(row.owner_user_id),
        provider: text(row.provider) ?? 'local_whisper',
        encrypted_api_key: options.keepProviderKeys
          ? text(row.encrypted_api_key)
          : null,
        created_at: requiredTimestamp(row.created_at, 'created_at'),
        updated_at: requiredTimestamp(row.updated_at, 'updated_at'),
      };
  }
}

/** Parents before children, so the self-referencing foreign key holds. */
export function orderTasks(rows: Row[]) {
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const ordered: Row[] = [];
  const placed = new Set<string>();
  const place = (row: Row, trail: Set<string>) => {
    const id = String(row.id);
    if (placed.has(id)) return;
    if (trail.has(id)) throw new Error('The exported tasks contain a cycle.');
    trail.add(id);
    const parent = row.parent_id ? byId.get(String(row.parent_id)) : undefined;
    if (parent) place(parent, trail);
    placed.add(id);
    ordered.push(row);
  };
  for (const row of rows) place(row, new Set());
  return ordered;
}

const literal = (value: Value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`;

export function insertStatement(
  table: TableName,
  values: Record<string, Value>,
) {
  const columns = Object.keys(values);
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns
    .map((column) => literal(values[column]))
    .join(', ')});`;
}

export interface ImportPlan {
  counts: Record<TableName, number>;
  batches: string[][];
  droppedProviderKeys: number;
}

/** Reads the export and builds the statements in batches; no I/O to D1. */
export async function planImport(
  exportDir: string,
  options: { keepProviderKeys: boolean; batchSize?: number },
): Promise<ImportPlan> {
  const statements: string[] = [];
  const counts = {} as Record<TableName, number>;
  let droppedProviderKeys = 0;
  for (const table of importOrder) {
    let rows: Row[];
    try {
      rows = JSON.parse(
        await readFile(join(exportDir, `${table}.json`), 'utf8'),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') rows = [];
      else throw error;
    }
    if (!Array.isArray(rows)) throw new Error(`${table}.json is not a list.`);
    if (table === 'tasks') rows = orderTasks(rows);
    for (const row of rows) {
      if (
        table === 'audio_settings' &&
        row.encrypted_api_key &&
        !options.keepProviderKeys
      )
        droppedProviderKeys++;
      statements.push(insertStatement(table, transform(table, row, options)));
    }
    counts[table] = rows.length;
  }
  const size = options.batchSize ?? 250;
  const batches: string[][] = [];
  for (let index = 0; index < statements.length; index += size)
    batches.push(statements.slice(index, index + size));
  return { counts, batches, droppedProviderKeys };
}

interface WranglerTarget {
  config: string;
  persistTo?: string;
  wrangler?: string;
}

async function wrangler(target: WranglerTarget, args: string[]) {
  try {
    const { stdout } = await run(
      target.wrangler ?? 'npx',
      [
        ...(target.wrangler ? [] : ['wrangler']),
        'd1',
        'execute',
        'ordo',
        '--local',
        '--config',
        target.config,
        ...(target.persistTo ? ['--persist-to', target.persistTo] : []),
        ...args,
      ],
      {
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return stdout;
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    throw new Error(
      `wrangler d1 execute --local failed:\n${`${stderr ?? ''}\n${stdout ?? ''}`.trim().slice(-2000)}`,
    );
  }
}

export async function countRows(target: WranglerTarget) {
  // One row of scalar subqueries (D1 limits compound SELECTs).
  const query = `SELECT ${importOrder
    .map((table) => `(SELECT count(*) FROM ${table}) AS ${table}`)
    .join(', ')}`;
  const output = await wrangler(target, ['--json', '--command', query]);
  const [result] = JSON.parse(output) as {
    results: Record<TableName, number>[];
  }[];
  return result.results[0];
}

/** Runs the plan against local D1 and checks the counts afterwards. */
export async function importLocal(
  exportDir: string,
  target: WranglerTarget,
  options: { keepProviderKeys: boolean },
) {
  const plan = await planImport(exportDir, options);
  const before = await countRows(target);
  if (before.users > 0)
    throw new Error(
      'The local D1 database already has users. Import into an empty, migrated database.',
    );
  const work = await mkdtemp(join(tmpdir(), 'ordo-import-'));
  try {
    for (const [index, batch] of plan.batches.entries()) {
      const file = join(work, `batch-${index}.sql`);
      await writeFile(file, batch.join('\n') + '\n', { mode: 0o600 });
      await wrangler(target, ['--file', file, '--yes']);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  const after = await countRows(target);
  const mismatched = importOrder.filter(
    (table) => after[table] !== plan.counts[table],
  );
  return { plan, after, mismatched };
}

function argument(flag: string) {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const from = argument('--from');
  if (!from) {
    console.error(
      'Usage: tsx packages/db/scripts/import-local.ts --from <export dir> [--config <wrangler.jsonc>] [--persist-to <dir>] [--keep-provider-keys]',
    );
    process.exit(2);
  }
  const config =
    argument('--config') ??
    fileURLToPath(new URL('../../../apps/api/wrangler.jsonc', import.meta.url));
  const result = await importLocal(
    resolve(from),
    { config: resolve(config), persistTo: argument('--persist-to') },
    { keepProviderKeys: process.argv.includes('--keep-provider-keys') },
  );
  console.log('table             exported  in D1');
  for (const table of importOrder)
    console.log(
      `${table.padEnd(18)}${String(result.plan.counts[table]).padStart(8)}${String(result.after[table]).padStart(7)}`,
    );
  if (result.plan.droppedProviderKeys)
    console.log(
      `Provider API keys dropped: ${result.plan.droppedProviderKeys} (owners re-enter them in Settings).`,
    );
  if (result.mismatched.length) {
    console.error(`Count mismatch: ${result.mismatched.join(', ')}`);
    process.exit(1);
  }
  console.log('All counts match.');
}
