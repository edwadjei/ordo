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
