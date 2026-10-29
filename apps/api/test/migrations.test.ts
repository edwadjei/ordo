import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { migrationStatements } from './d1-harness.js';

const wranglerConfig = fileURLToPath(
  new URL('../wrangler.jsonc', import.meta.url),
);

test('0002 maps existing local_whisper settings to workers_ai and keeps OpenAI rows and keys', async (t) => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: wranglerConfig,
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  t.after(() => proxy.dispose());
  const d1 = proxy.env.DB;
  const migrations = await migrationStatements();
  assert.deepEqual(migrations.map((migration) => migration.name).slice(0, 2), [
    '0001_initial.sql',
    '0002_workers_ai_transcription.sql',
  ]);
  const apply = (name: string) =>
    d1.batch(
      migrations
        .find((migration) => migration.name === name)!
        .statements.map((sql) => d1.prepare(sql)),
    );
  await apply('0001_initial.sql');
  // Fictional accounts with settings as the old schema stored them.
  const people = ['local', 'cloud', 'cloud-without-key'].map((label) => ({
    id: crypto.randomUUID(),
    label,
  }));
  for (const person of people)
    await d1
      .prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)')
      .bind(person.id, `${person.label}@example.invalid`, 'Fictional')
      .run();
  const [local, cloud, cloudWithoutKey] = people;
  await d1.batch([
    d1
      .prepare(
        "INSERT INTO audio_settings (owner_user_id, provider, created_at, updated_at) VALUES (?, 'local_whisper', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')",
      )
      .bind(local.id),
    d1
      .prepare(
        "INSERT INTO audio_settings (owner_user_id, provider, encrypted_api_key) VALUES (?, 'openai', 'fictional-ciphertext')",
      )
      .bind(cloud.id),
    d1
      .prepare(
        "INSERT INTO audio_settings (owner_user_id, provider) VALUES (?, 'openai')",
      )
      .bind(cloudWithoutKey.id),
  ]);
  await apply('0002_workers_ai_transcription.sql');
  const rows = (
    await d1
      .prepare(
        'SELECT owner_user_id, provider, encrypted_api_key, created_at, updated_at FROM audio_settings',
      )
      .all<{
        owner_user_id: string;
        provider: string;
        encrypted_api_key: string | null;
        created_at: string;
        updated_at: string;
      }>()
  ).results;
  const byOwner = new Map(rows.map((row) => [row.owner_user_id, row]));
  assert.equal(rows.length, 3);
  assert.equal(byOwner.get(local.id)!.provider, 'workers_ai');
  assert.equal(byOwner.get(local.id)!.created_at, '2026-01-01T00:00:00.000Z');
  assert.equal(byOwner.get(local.id)!.updated_at, '2026-01-02T00:00:00.000Z');
  assert.equal(byOwner.get(cloud.id)!.provider, 'openai');
  assert.equal(
    byOwner.get(cloud.id)!.encrypted_api_key,
    'fictional-ciphertext',
  );
  assert.equal(byOwner.get(cloudWithoutKey.id)!.provider, 'openai');
  // New rows default to workers_ai; local_whisper is refused.
  const fresh = crypto.randomUUID();
  await d1
    .prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)')
    .bind(fresh, 'fresh@example.invalid', 'Fictional')
    .run();
  await d1
    .prepare('INSERT INTO audio_settings (owner_user_id) VALUES (?)')
    .bind(fresh)
    .run();
  assert.equal(
    await d1
      .prepare('SELECT provider FROM audio_settings WHERE owner_user_id = ?')
      .bind(fresh)
      .first('provider'),
    'workers_ai',
  );
  await assert.rejects(() =>
    d1
      .prepare(
        "UPDATE audio_settings SET provider = 'local_whisper' WHERE owner_user_id = ?",
      )
      .bind(fresh)
      .run(),
  );
  // The rebuilt table still cascades when its user is deleted.
  await d1.prepare('DELETE FROM users WHERE id = ?').bind(local.id).run();
  assert.equal(
    await d1
      .prepare(
        'SELECT COUNT(*) AS n FROM audio_settings WHERE owner_user_id = ?',
      )
      .bind(local.id)
      .first('n'),
    0,
  );
});

test('0003 clears invented and contact-like names and keeps every account, session, setting and record', async (t) => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: wranglerConfig,
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  t.after(() => proxy.dispose());
  const d1 = proxy.env.DB;
  const migrations = await migrationStatements();
  assert.equal(migrations[2].name, '0003_optional_display_name.sql');
  const apply = (index: number) =>
    d1.batch(migrations[index].statements.map((sql) => d1.prepare(sql)));
  await apply(0);
  await apply(1);
  // Fictional accounts as the old schema stored them: [email, phone, name, kept?].
  const accounts: [string, string | null, string, boolean][] = [
    ['ama@example.test', null, 'Ama Fiction', true],
    ['kofi.mensah@example.test', null, 'kofi.mensah', false],
    ['phone:1', '+233241234567', 'Ordo member', false],
    ['phone:2', '+233247654321', '0558601966', false],
    ['phone:3', '+233201112223', '+233 55 860 1966', false],
    ['typed@example.test', null, 'typed@example.test', false],
    ['agent@example.test', null, 'Agent 007', true],
  ];
  const ids = accounts.map(() => crypto.randomUUID());
  await d1.batch(
    accounts.map(([email, phone, name], index) =>
      d1
        .prepare(
          "INSERT INTO users (id, email, phone, display_name, updated_at) VALUES (?, ?, ?, ?, '2026-01-02T00:00:00.000Z')",
        )
        .bind(ids[index], email, phone, name),
    ),
  );
  const [owner] = ids;
  const workspace = crypto.randomUUID();
  await d1.batch([
    d1
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('fictional-hash', ?, '2026-12-01T00:00:00.000Z')",
      )
      .bind(owner),
    d1
      .prepare(
        "INSERT INTO audio_settings (owner_user_id, provider, encrypted_api_key) VALUES (?, 'openai', 'fictional-ciphertext')",
      )
      .bind(owner),
    d1
      .prepare(
        "INSERT INTO workspaces (id, owner_user_id, name, color) VALUES (?, ?, 'Fiction', '#577664')",
      )
      .bind(workspace, owner),
    d1
      .prepare(
        "INSERT INTO tasks (id, owner_user_id, workspace_id, title) VALUES (?, ?, ?, 'Fictional task')",
      )
      .bind(crypto.randomUUID(), owner, workspace),
    d1
      .prepare(
        "INSERT INTO notes (id, owner_user_id, title) VALUES (?, ?, 'Fictional note')",
      )
      .bind(crypto.randomUUID(), owner),
  ]);
  await apply(2);
  const rows = (
    await d1
      .prepare('SELECT id, email, display_name, updated_at FROM users')
      .all<{
        id: string;
        email: string;
        display_name: string | null;
        updated_at: string;
      }>()
  ).results;
  assert.equal(rows.length, accounts.length);
  const byId = new Map(rows.map((row) => [row.id, row]));
  accounts.forEach(([email, , name, kept], index) => {
    const row = byId.get(ids[index])!;
    assert.equal(row.email, email);
    assert.equal(row.display_name, kept ? name : null, name);
    assert.equal(row.updated_at, '2026-01-02T00:00:00.000Z');
  });
  const count = async (table: string) =>
    d1.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first('n');
  for (const table of [
    'sessions',
    'audio_settings',
    'workspaces',
    'tasks',
    'notes',
  ])
    assert.equal(await count(table), 1, table);
  assert.equal(
    await d1
      .prepare(
        'SELECT encrypted_api_key FROM audio_settings WHERE owner_user_id = ?',
      )
      .bind(owner)
      .first('encrypted_api_key'),
    'fictional-ciphertext',
  );
  for (const table of ['users_keep', 'sessions_keep', 'audio_settings_keep'])
    assert.equal(
      await d1
        .prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?')
        .bind(table)
        .first('n'),
      0,
      table,
    );
  // NULL is allowed, an empty name is still refused, and foreign keys hold.
  await assert.rejects(() =>
    d1
      .prepare("UPDATE users SET display_name = '' WHERE id = ?")
      .bind(owner)
      .run(),
  );
  await assert.rejects(() =>
    d1
      .prepare(
        "INSERT INTO notes (id, owner_user_id, title) VALUES (?, ?, 'Orphan')",
      )
      .bind(crypto.randomUUID(), crypto.randomUUID())
      .run(),
  );
  // The cascade from users to sessions and audio_settings still works.
  const loner = ids[1];
  await d1.batch([
    d1
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('fictional-hash-2', ?, '2026-12-01T00:00:00.000Z')",
      )
      .bind(loner),
    d1.prepare('DELETE FROM users WHERE id = ?').bind(loner),
  ]);
  assert.equal(await count('sessions'), 1);
});

test('0004 adds project favourites and note sources with defaults, keeping every row', async (t) => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: wranglerConfig,
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  t.after(() => proxy.dispose());
  const d1 = proxy.env.DB;
  const migrations = await migrationStatements();
  assert.equal(migrations[3].name, '0004_favourites_and_note_sources.sql');
  const apply = (index: number) =>
    d1.batch(migrations[index].statements.map((sql) => d1.prepare(sql)));
  for (const index of [0, 1, 2]) await apply(index);
  const owner = crypto.randomUUID();
  const workspace = crypto.randomUUID();
  const project = crypto.randomUUID();
  const note = crypto.randomUUID();
  await d1.batch([
    d1
      .prepare(
        "INSERT INTO users (id, email) VALUES (?, 'fiction@example.test')",
      )
      .bind(owner),
    d1
      .prepare(
        "INSERT INTO workspaces (id, owner_user_id, name, color) VALUES (?, ?, 'Fiction', '#577664')",
      )
      .bind(workspace, owner),
    d1
      .prepare(
        "INSERT INTO projects (id, owner_user_id, workspace_id, name, revision) VALUES (?, ?, ?, 'Fictional project', 3)",
      )
      .bind(project, owner, workspace),
    d1
      .prepare(
        "INSERT INTO notes (id, owner_user_id, title, body, revision) VALUES (?, ?, 'Fictional note', 'Plain text body', 2)",
      )
      .bind(note, owner),
  ]);
  await apply(3);
  assert.deepEqual(
    await d1
      .prepare('SELECT name, favorite, revision FROM projects WHERE id = ?')
      .bind(project)
      .first(),
    { name: 'Fictional project', favorite: 0, revision: 3 },
  );
  assert.deepEqual(
    await d1
      .prepare('SELECT title, body, source, revision FROM notes WHERE id = ?')
      .bind(note)
      .first(),
    {
      title: 'Fictional note',
      body: 'Plain text body',
      source: 'manual',
      revision: 2,
    },
  );
  await assert.rejects(() =>
    d1
      .prepare('UPDATE projects SET favorite = 2 WHERE id = ?')
      .bind(project)
      .run(),
  );
  await assert.rejects(() =>
    d1.prepare("UPDATE notes SET source = 'fax' WHERE id = ?").bind(note).run(),
  );
  await d1
    .prepare("UPDATE notes SET source = 'transcript' WHERE id = ?")
    .bind(note)
    .run();
  // Full-text search still finds the note after the column was added.
  assert.equal(
    await d1
      .prepare(
        "SELECT COUNT(*) AS n FROM notes_fts WHERE notes_fts MATCH 'plain'",
      )
      .first('n'),
    1,
  );
});

test('0005 adds aliases, task provenance, drafts, capture runs and AI settings, keeping every row', async (t) => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: wranglerConfig,
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  t.after(() => proxy.dispose());
  const d1 = proxy.env.DB;
  const migrations = await migrationStatements();
  assert.equal(migrations[4].name, '0005_ai_capture.sql');
  const apply = (index: number) =>
    d1.batch(migrations[index].statements.map((sql) => d1.prepare(sql)));
  for (const index of [0, 1, 2, 3]) await apply(index);
  const [owner, other, workspace, project, task, note] = Array.from(
    { length: 6 },
    () => crypto.randomUUID(),
  );
  await d1.batch([
    d1
      .prepare(
        "INSERT INTO users (id, email) VALUES (?, 'fiction@example.test'), (?, 'other@example.test')",
      )
      .bind(owner, other),
    d1
      .prepare(
        "INSERT INTO workspaces (id, owner_user_id, name, color) VALUES (?, ?, 'Fiction', '#577664')",
      )
      .bind(workspace, owner),
    d1
      .prepare(
        "INSERT INTO projects (id, owner_user_id, workspace_id, name, revision) VALUES (?, ?, ?, 'Fictional project', 3)",
      )
      .bind(project, owner, workspace),
    d1
      .prepare(
        "INSERT INTO tasks (id, owner_user_id, title, revision) VALUES (?, ?, 'Fictional task', 4)",
      )
      .bind(task, owner),
    d1
      .prepare(
        "INSERT INTO notes (id, owner_user_id, title, body) VALUES (?, ?, 'Fictional note', 'Body')",
      )
      .bind(note, owner),
  ]);
  await apply(4);
  assert.deepEqual(
    await d1
      .prepare('SELECT aliases, revision FROM projects WHERE id = ?')
      .bind(project)
      .first(),
    { aliases: '[]', revision: 3 },
  );
  assert.deepEqual(
    await d1
      .prepare(
        'SELECT title, origin, source_note_id, revision FROM tasks WHERE id = ?',
      )
      .bind(task)
      .first(),
    {
      title: 'Fictional task',
      origin: 'manual',
      source_note_id: null,
      revision: 4,
    },
  );
  const rejects = (sql: string, ...values: unknown[]) =>
    assert.rejects(
      () =>
        d1
          .prepare(sql)
          .bind(...values)
          .run(),
      sql,
    );
  await rejects("UPDATE tasks SET origin = 'robot' WHERE id = ?", task);
  await rejects("UPDATE projects SET aliases = 'x' WHERE id = ?", project);
  await rejects(
    `UPDATE projects SET aliases = '${JSON.stringify(Array(11).fill('a'))}' WHERE id = ?`,
    project,
  );
  // A draft or run cannot point at another account's note.
  await rejects(
    "INSERT INTO drafts (id, owner_user_id, workspace_id, source_note_id, kind, body) VALUES (?, ?, ?, ?, 'email', 'Hi')",
    crypto.randomUUID(),
    other,
    workspace,
    note,
  );
  await rejects(
    "INSERT INTO capture_runs (id, owner_user_id, note_id, note_revision, workspace_id, status, provider) VALUES (?, ?, ?, 1, ?, 'ready', 'workers_ai')",
    crypto.randomUUID(),
    owner,
    note,
    workspace,
  );
  await d1
    .prepare(
      "INSERT INTO capture_runs (id, owner_user_id, note_id, note_revision, workspace_id, status, provider) VALUES (?, ?, ?, 1, ?, 'pending', 'workers_ai')",
    )
    .bind(crypto.randomUUID(), owner, note, workspace)
    .run();
  assert.deepEqual(
    await d1
      .prepare('SELECT text_provider FROM ai_settings WHERE owner_user_id = ?')
      .bind(owner)
      .first(),
    null,
  );
});
