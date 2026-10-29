import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  importLocal,
  orderTasks,
  planImport,
  transform,
} from '../../../packages/db/scripts/import-local.js';

const run = promisify(execFile);
// A fictional embedded-database export made by export-embedded.mjs from a
// throwaway PGlite database; it contains no real data.
const fixture = fileURLToPath(
  new URL(
    '../../../packages/db/test/fixtures/embedded-export/',
    import.meta.url,
  ),
);
const config = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
const wranglerBin = fileURLToPath(
  new URL('../node_modules/.bin/wrangler', import.meta.url),
);

test('transform: ISO timestamps, 0/1 booleans, kept IDs and revisions, no password hashes', async () => {
  const user = transform(
    'users',
    {
      id: 'u',
      email: 'a@example.invalid',
      display_name: '  ',
      password_hash: 'scrypt:never',
      demo_loaded: true,
      created_at: '2026-10-28T08:28:04.522+00:00',
      updated_at: '2026-10-28 09:28:04.5+01',
    },
    { keepProviderKeys: false },
  );
  assert.equal(user.demo_loaded, 1);
  assert.equal(user.display_name, 'Ordo member');
  assert.equal(user.created_at, '2026-10-28T08:28:04.522Z');
  assert.equal(user.updated_at, '2026-10-28T08:28:04.500Z');
  assert.ok(!('password_hash' in user));
  const task = transform(
    'tasks',
    { id: 't', revision: 7, due_date: '2026-11-03', waiting_on: '  Kofi  ' },
    { keepProviderKeys: false },
  );
  assert.equal(task.revision, 7);
  assert.equal(task.due_date, '2026-11-03');
  assert.equal(task.waiting_on, 'Kofi');
  assert.equal(
    transform(
      'audio_settings',
      { owner_user_id: 'u', encrypted_api_key: 'v1.x' },
      { keepProviderKeys: false },
    ).encrypted_api_key,
    null,
  );
  assert.equal(
    transform(
      'audio_settings',
      { owner_user_id: 'u', encrypted_api_key: 'v1.x' },
      { keepProviderKeys: true },
    ).encrypted_api_key,
    'v1.x',
  );
  // Local Whisper no longer exists: old exports become Workers AI.
  for (const [provider, expected] of [
    ['local_whisper', 'workers_ai'],
    [undefined, 'workers_ai'],
    ['openai', 'openai'],
  ])
    assert.equal(
      transform(
        'audio_settings',
        { owner_user_id: 'u', provider },
        { keepProviderKeys: false },
      ).provider,
      expected,
    );
  assert.deepEqual(
    orderTasks([
      { id: 'c', parent_id: 'b' },
      { id: 'b', parent_id: 'a' },
      { id: 'a', parent_id: null },
    ]).map((row) => row.id),
    ['a', 'b', 'c'],
  );
  assert.throws(
    () =>
      orderTasks([
        { id: 'a', parent_id: 'b' },
        { id: 'b', parent_id: 'a' },
      ]),
    /cycle/,
  );
  const plan = await planImport(fixture, { keepProviderKeys: false });
  assert.equal(plan.droppedProviderKeys, 1);
  const sql = plan.batches.flat().join('\n');
  assert.ok(!sql.includes('scrypt'), 'no password hash is ever written');
  assert.ok(!/INSERT INTO (sessions|otp_challenges)/.test(sql));
  assert.ok(sql.includes("'Kofi''s checklist'"), 'quotes are escaped');
});

test('the fictional export loads into a fresh local D1 database with matching counts', async (t) => {
  const persistTo = await mkdtemp(join(tmpdir(), 'ordo-import-state-'));
  t.after(() => rm(persistTo, { recursive: true, force: true }));
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  await run(
    wranglerBin,
    [
      'd1',
      'migrations',
      'apply',
      'ordo',
      '--local',
      '--config',
      config,
      '--persist-to',
      persistTo,
    ],
    { env },
  );
  const target = { config, persistTo, wrangler: wranglerBin };
  const result = await importLocal(fixture, target, {
    keepProviderKeys: false,
  });
  assert.deepEqual(result.mismatched, []);
  assert.deepEqual(result.after, {
    users: 2,
    workspaces: 1,
    projects: 1,
    tasks: 3,
    idempotency_keys: 1,
    notes: 1,
    audio_settings: 1,
  });
  const query = async (command: string) => {
    const { stdout } = await run(
      wranglerBin,
      [
        'd1',
        'execute',
        'ordo',
        '--local',
        '--config',
        config,
        '--persist-to',
        persistTo,
        '--json',
        '--command',
        command,
      ],
      { env },
    );
    return JSON.parse(stdout)[0].results as Record<string, unknown>[];
  };
  // FTS triggers filled the search tables, including people names.
  assert.deepEqual(
    await query(
      'SELECT t.title FROM tasks_fts JOIN tasks t ON t.rowid = tasks_fts.rowid WHERE tasks_fts MATCH \'"kofi"\'',
    ),
    [{ title: 'Plan the harbour launch' }],
  );
  const [task] = await query(
    "SELECT revision, due_time, created_at FROM tasks WHERE title = 'Plan the harbour launch'",
  );
  assert.equal(task.revision, 4);
  assert.equal(task.due_time, '09:30');
  assert.match(
    String(task.created_at),
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
  );
  assert.deepEqual(await query('SELECT count(*) AS n FROM sessions'), [
    { n: 0 },
  ]);
  assert.deepEqual(
    await query('SELECT encrypted_api_key FROM audio_settings'),
    [{ encrypted_api_key: null }],
  );
  // A second run refuses to load into a database that already has users.
  await assert.rejects(
    () => importLocal(fixture, target, { keepProviderKeys: false }),
    /already has users/,
  );
});
