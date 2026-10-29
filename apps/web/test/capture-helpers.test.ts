import test from 'node:test';
import assert from 'node:assert/strict';
import type { Note, Task } from '@ordo/client';
import {
  conversations,
  draftText,
  notProcessed,
  parseAliases,
  taskOrigin,
  tasksFromNote,
} from '../lib/capture.ts';

const note = (id: string, source: string, fields: object = {}) =>
  ({
    id,
    title: id,
    body: '',
    source,
    workspaceId: 'w1',
    projectId: 'p1',
    revision: 1,
    createdAt: '2026-10-29T00:00:00Z',
    updatedAt: '2026-10-29T00:00:00Z',
    ...fields,
  }) as unknown as Note;

test('conversations are recordings, emails and transcripts in scope, newest first', () => {
  const list = conversations(
    [
      note('typed', 'manual'),
      note('old-call', 'recording', { updatedAt: '2026-10-01T00:00:00Z' }),
      note('email', 'email'),
      note('elsewhere', 'transcript', { projectId: 'p2' }),
    ],
    { projectId: 'p1' },
  );
  assert.deepEqual(
    list.map((n) => n.id),
    ['email', 'old-call'],
  );
});

test('Not processed means the latest run is pending or failed', () => {
  assert.equal(
    notProcessed(note('a', 'email', { captureStatus: 'pending' })),
    true,
  );
  assert.equal(
    notProcessed(note('b', 'email', { captureStatus: 'failed' })),
    true,
  );
  assert.equal(
    notProcessed(note('c', 'email', { captureStatus: 'saved' })),
    false,
  );
  assert.equal(notProcessed(note('d', 'email')), false);
});

test('provenance: origin defaults to manual and capture tasks link their note', () => {
  const tasks = [
    { id: 't1', origin: 'capture', sourceNoteId: 'n1' },
    { id: 't2' },
  ] as unknown as Task[];
  assert.equal(taskOrigin(tasks[0]), 'capture');
  assert.equal(taskOrigin(tasks[1]), 'manual');
  assert.deepEqual(
    tasksFromNote(tasks, 'n1').map((t) => t.id),
    ['t1'],
  );
});

test('other names are trimmed, de-duplicated and limited', () => {
  assert.deepEqual(parseAliases(' SIM reg,  KYC , sim REG,, '), {
    aliases: ['SIM reg', 'KYC'],
    problem: '',
  });
  assert.match(
    parseAliases(Array.from({ length: 11 }, (_, i) => `n${i}`).join(','))
      .problem,
    /10/,
  );
  assert.match(parseAliases('x'.repeat(61)).problem, /60/);
});

test('a copied draft carries its recipient and subject above the text', () => {
  assert.equal(
    draftText({
      kind: 'email',
      to: 'qa@example.test',
      subject: 'UAT',
      body: 'Hi QA',
    }),
    'To: qa@example.test\nSubject: UAT\n\nHi QA',
  );
  assert.equal(
    draftText({
      kind: 'message',
      to: null,
      subject: 'ignored',
      body: 'On my way',
    }),
    'On my way',
  );
});
