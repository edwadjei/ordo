import test from 'node:test';
import assert from 'node:assert/strict';
import type { Note } from '@ordo/client';
import { openNote } from '../lib/open-note.ts';

const listed = {
  id: 'n1',
  title: 'Launch plan',
  preview: '## Launch plan\n- [ ] Book',
  bodyLength: 900,
  revision: 3,
  source: 'manual',
  workspaceId: null,
  projectId: null,
  createdAt: '2026-10-30T00:00:00Z',
  updatedAt: '2026-10-30T00:00:00Z',
} as unknown as Note;
const full = {
  ...listed,
  body: '## Launch plan\n- [ ] Book the venue\n…',
} as Note;
const copy = (revision: number) => ({
  id: 'n1',
  title: 'Launch plan',
  body: `device copy r${revision}`,
  revision,
  updatedAt: '2026-10-29T00:00:00Z',
  cachedAt: '2026-10-29T00:00:00Z',
});

test('online, opening a note fetches the whole note', async () => {
  let fetched = 0;
  const opened = await openNote({
    listed,
    offline: false,
    fetchNote: async () => (fetched++, full),
    cached: () => copy(3),
  });
  assert.equal(fetched, 1);
  assert.deepEqual(opened, {
    kind: 'full',
    note: full,
    from: 'server',
    outdated: false,
  });
});

test('offline, a note opened before is read from this device', async () => {
  const opened = await openNote({
    listed,
    offline: true,
    fetchNote: async () => assert.fail('no request offline'),
    cached: () => copy(3),
  });
  assert.equal(opened.kind, 'full');
  assert.equal(opened.kind === 'full' && opened.from, 'device');
  assert.equal(opened.kind === 'full' && opened.note.body, 'device copy r3');
  assert.equal(opened.kind === 'full' && opened.outdated, false);
});

test('a device copy older than the list says so', async () => {
  const opened = await openNote({
    listed,
    offline: true,
    fetchNote: async () => full,
    cached: () => copy(2),
  });
  assert.equal(opened.kind === 'full' && opened.outdated, true);
});

test('offline and never opened: preview only, with the online message', async () => {
  assert.deepEqual(
    await openNote({
      listed,
      offline: true,
      fetchNote: async () => full,
      cached: () => null,
    }),
    {
      kind: 'preview',
      reason: 'offline',
      message: 'Open online to read the whole note.',
    },
  );
});

test('a failed fetch falls back to the device copy, else the preview', async () => {
  const failing = async () => {
    throw new Error('Couldn’t reach Ordo.');
  };
  const withCopy = await openNote({
    listed,
    offline: false,
    fetchNote: failing,
    cached: () => copy(3),
  });
  assert.equal(withCopy.kind === 'full' && withCopy.from, 'device');
  const without = await openNote({
    listed,
    offline: false,
    fetchNote: failing,
    cached: () => null,
  });
  assert.equal(without.kind, 'preview');
  assert.match(
    without.kind === 'preview' ? without.message : '',
    /Only the start/,
  );
});

test('a cancelled open is not turned into a fallback', async () => {
  await assert.rejects(
    openNote({
      listed,
      offline: false,
      fetchNote: async () => {
        throw new DOMException('Aborted', 'AbortError');
      },
      cached: () => copy(3),
    }),
    /Aborted/,
  );
});

test('a note that arrives without its whole body never reaches the editor', async () => {
  const opened = await openNote({
    listed,
    offline: false,
    fetchNote: async () => ({ ...listed }) as Note,
    cached: () => null,
  });
  assert.equal(opened.kind, 'preview');
});
