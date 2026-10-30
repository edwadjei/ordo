import test from 'node:test';
import assert from 'node:assert/strict';
import type { HomeSnapshot } from '@ordo/client';
import {
  archivedItems,
  archivedMessage,
  archivedScope,
  confirmsName,
  deleteSummary,
  isArchived,
  isLastWorkspace,
  menuFocusAfter,
  placeMenuItems,
  withoutArchived,
} from '../lib/organize.ts';

const snapshot = {
  user: {
    id: 'u',
    email: 'ama@example.test',
    displayName: '',
    timezone: 'Africa/Accra',
  },
  workspaces: [
    { id: 'mtn', name: 'MTN', archivedAt: null },
    { id: 'old', name: 'Old job', archivedAt: '2026-10-30T09:00:00Z' },
  ],
  projects: [
    { id: 'sim', workspaceId: 'mtn', name: 'SIM', archivedAt: null },
    {
      id: 'tv',
      workspaceId: 'mtn',
      name: 'One TV',
      archivedAt: '2026-10-30T09:00:00Z',
    },
    { id: 'legacy', workspaceId: 'old', name: 'Legacy', archivedAt: null },
  ],
  tasks: [
    { id: 't-sim', workspaceId: 'mtn', projectId: 'sim' },
    { id: 't-tv', workspaceId: 'mtn', projectId: 'tv' },
    { id: 't-old', workspaceId: 'old', projectId: null },
    { id: 't-inbox', workspaceId: null, projectId: null },
  ],
  notes: [
    { id: 'n-tv', workspaceId: 'mtn', projectId: 'tv' },
    { id: 'n-mtn', workspaceId: 'mtn', projectId: null },
  ],
} as unknown as HomeSnapshot;

test('archived workspaces and projects, and their items, leave everyday views', () => {
  const visible = withoutArchived(snapshot);
  assert.deepEqual(
    visible.workspaces.map((w) => w.id),
    ['mtn'],
  );
  assert.deepEqual(
    visible.projects.map((p) => p.id),
    ['sim'],
  );
  assert.deepEqual(
    visible.tasks.map((t) => t.id),
    ['t-sim', 't-inbox'],
  );
  assert.deepEqual(
    visible.notes.map((n) => n.id),
    ['n-mtn'],
  );
});

test('the Archived filter lists archived workspaces and archived projects in active ones', () => {
  const archived = archivedItems(snapshot);
  assert.deepEqual(
    archived.workspaces.map((w) => w.id),
    ['old'],
  );
  assert.deepEqual(
    archived.projects.map((p) => p.id),
    ['tv'],
  );
});

test('archived reads either a flag or a timestamp', () => {
  assert.equal(isArchived({ archivedAt: '2026-10-30T00:00:00Z' }), true);
  assert.equal(isArchived({ archivedAt: null }), false);
  assert.equal(isArchived({}), false);
});

test('the delete preview reads as a sentence, skipping what is empty', () => {
  assert.equal(
    deleteSummary({
      projects: 2,
      tasks: 14,
      notes: 6,
      drafts: 1,
      captureRuns: 0,
    }),
    'Deletes 2 projects, 14 tasks, 6 notes and 1 draft.',
  );
  assert.equal(
    deleteSummary({
      projects: 0,
      tasks: 1,
      notes: 0,
      drafts: 0,
      captureRuns: 2,
    }),
    'Deletes 1 task and 2 AI capture runs.',
  );
  assert.equal(
    deleteSummary({
      projects: 0,
      tasks: 0,
      notes: 0,
      drafts: 0,
      captureRuns: 0,
    }),
    'Nothing else is inside; only the name goes.',
  );
});

test('only the exact name enables a permanent delete', () => {
  assert.equal(confirmsName('MTN', 'MTN'), true);
  for (const typed of ['mtn', 'MTN ', ' MTN', '', 'MT'])
    assert.equal(confirmsName(typed, 'MTN'), false, JSON.stringify(typed));
});

test('the last workspace cannot be deleted', () => {
  assert.equal(isLastWorkspace(snapshot), false);
  assert.equal(
    isLastWorkspace({ ...snapshot, workspaces: [snapshot.workspaces[0]] }),
    true,
  );
});

test('a search result in an archived scope says which one', () => {
  assert.deepEqual(
    archivedScope(
      { type: 'task', id: 't-tv', workspaceId: 'mtn', projectId: 'tv' },
      snapshot,
    ),
    { kind: 'projects', id: 'tv', name: 'One TV' },
  );
  assert.deepEqual(
    archivedScope(
      { type: 'note', id: 'n', workspaceId: 'old', projectId: 'legacy' },
      snapshot,
    ),
    { kind: 'workspaces', id: 'old', name: 'Old job' },
  );
  assert.deepEqual(
    archivedScope({ type: 'project', id: 'tv', workspaceId: 'mtn' }, snapshot),
    { kind: 'projects', id: 'tv', name: 'One TV' },
  );
  assert.equal(
    archivedScope(
      { type: 'task', id: 't', workspaceId: 'mtn', projectId: 'sim' },
      snapshot,
    ),
    null,
  );
  assert.equal(
    archivedScope(
      { type: 'task', id: 't', workspaceId: null, projectId: null },
      snapshot,
    ),
    null,
  );
});

test('the options menu: settings, Archive or Restore, and Delete permanently…', () => {
  const live = { id: 'w', name: 'Work', archivedAt: null };
  assert.deepEqual(placeMenuItems('workspaces', live, false), [
    { action: 'settings', label: 'Open workspace settings', hint: undefined },
    { action: 'archive', label: 'Archive workspace', hint: undefined },
    { action: 'delete', label: 'Delete permanently…', hint: undefined },
  ]);
  const old = { id: 'p', name: 'Old', archivedAt: '2026-10-30T09:00:00Z' };
  assert.deepEqual(
    placeMenuItems('projects', old, false).map((item) => item.label),
    ['Open project settings', 'Restore project', 'Delete permanently…'],
  );
});

test('offline, every menu item says it needs a connection', () => {
  const items = placeMenuItems('workspaces', { archivedAt: null }, true);
  assert.ok(items.every((item) => item.hint === 'Needs a connection'));
});

test('arrow keys, Home and End move through the menu and wrap', () => {
  assert.equal(menuFocusAfter('ArrowDown', 2, 3), 0);
  assert.equal(menuFocusAfter('ArrowUp', 0, 3), 2);
  assert.equal(menuFocusAfter('Home', 2, 3), 0);
  assert.equal(menuFocusAfter('End', 0, 3), 2);
  assert.equal(menuFocusAfter('a', 0, 3), null);
});

test('archiving says where to find it again', () => {
  assert.equal(
    archivedMessage('Work', true),
    'Archived “Work”. Find it under Archived in the sidebar to restore it.',
  );
  assert.equal(archivedMessage('Work', false), 'Restored “Work”.');
});
