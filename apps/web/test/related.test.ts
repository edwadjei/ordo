import test from 'node:test';
import assert from 'node:assert/strict';
import type { NoteSummary } from '@ordo/client';
import { linkCandidates } from '../lib/related.ts';

const note = (id: string, fields: object = {}) =>
  ({
    id,
    title: id,
    preview: '',
    bodyLength: 0,
    workspaceId: 'other',
    projectId: null,
    updatedAt: '2026-10-30T00:00:00Z',
    ...fields,
  }) as unknown as NoteSummary;

const notes = [
  note('elsewhere', {
    title: 'Venue ideas',
    updatedAt: '2026-10-30T09:00:00Z',
  }),
  note('same-workspace', { title: 'Venue budget', workspaceId: 'mtn' }),
  note('same-project', {
    title: 'Venue shortlist',
    workspaceId: 'mtn',
    projectId: 'sim',
  }),
  note('linked', {
    title: 'Venue contract',
    workspaceId: 'mtn',
    projectId: 'sim',
  }),
  note('source', { title: 'Venue call', workspaceId: 'mtn', projectId: 'sim' }),
  note('by-preview', {
    title: 'Call notes',
    preview: 'The venue wants a deposit',
  }),
];
const task = { workspaceId: 'mtn', projectId: 'sim', sourceNoteId: 'source' };

test('the picker leaves out linked and source notes and puts nearby notes first', () => {
  assert.deepEqual(
    linkCandidates(notes, [{ id: 'linked' }], 'venue', task).map((n) => n.id),
    ['same-project', 'same-workspace', 'elsewhere', 'by-preview'],
  );
});

test('every typed word must match the title or preview', () => {
  assert.deepEqual(
    linkCandidates(notes, [], 'venue deposit', task).map((n) => n.id),
    ['by-preview'],
  );
  assert.equal(linkCandidates(notes, [], '', task, 2).length, 2);
});
