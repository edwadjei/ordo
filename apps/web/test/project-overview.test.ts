import test from 'node:test';
import assert from 'node:assert/strict';
import type { HomeSnapshot, Note } from '@ordo/client';
import { projectOverview, type EverydayTask } from '../lib/views.ts';

let seq = 0;
function task(fields: Partial<EverydayTask> = {}): EverydayTask {
  seq++;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    description: '',
    status: 'todo',
    priority: null,
    dueDate: null,
    followUpDate: null,
    dueTime: null,
    followUpTime: null,
    responsiblePerson: null,
    waitingOn: null,
    parentId: null,
    workspaceId: 'w1',
    projectId: 'p1',
    revision: 1,
    completedAt: null,
    createdAt: `2026-10-01T00:00:${String(seq).padStart(2, '0')}Z`,
    updatedAt: '2026-10-01T00:00:00Z',
    ...fields,
  };
}
function note(id: string, updatedAt: string, projectId = 'p1') {
  return {
    id,
    title: id,
    body: '',
    workspaceId: 'w1',
    projectId,
    revision: 1,
    createdAt: updatedAt,
    updatedAt,
  } as Note;
}
function snapshot(tasks: EverydayTask[], notes: Note[] = []): HomeSnapshot {
  return {
    user: {
      id: 'u1',
      email: 'ama@example.test',
      displayName: 'Ama',
      timezone: 'Africa/Accra',
    },
    workspaces: [],
    projects: [],
    tasks,
    notes,
  };
}
const now = { date: '2026-10-21', time: '10:30' };

test('project overview keeps only this project’s open tasks', () => {
  const mine = task(),
    done = task({ status: 'done' }),
    other = task({ projectId: 'p2' });
  const view = projectOverview(snapshot([mine, done, other]), 'p1', now);
  assert.deepEqual(
    view.open.map((t) => t.id),
    [mine.id],
  );
  assert.deepEqual(
    view.next.map((t) => t.id),
    [mine.id],
  );
});

test('overdue tasks are blockers and waiting tasks say who, without repeating them as next', () => {
  const late = task({ dueDate: '2026-10-19' }),
    lateFollowUp = task({ followUpDate: '2026-10-20' }),
    waiting = task({ status: 'waiting', waitingOn: 'Kofi' }),
    today = task({ dueDate: '2026-10-21' });
  const view = projectOverview(
    snapshot([late, lateFollowUp, waiting, today]),
    'p1',
    now,
  );
  assert.deepEqual(
    view.overdue.map((t) => t.id),
    [late.id, lateFollowUp.id],
  );
  assert.deepEqual(
    view.waiting.map((t) => t.waitingOn),
    ['Kofi'],
  );
  assert.deepEqual(
    view.next.map((t) => t.id),
    [today.id],
  );
  assert.equal(view.open.length, 4);
});

test('next tasks and recent notes are capped, newest notes first', () => {
  const tasks = Array.from({ length: 7 }, () => task());
  const notes = [
    note('old', '2026-10-01T00:00:00Z'),
    note('newest', '2026-10-20T00:00:00Z'),
    note('middle', '2026-10-10T00:00:00Z'),
    note('newer', '2026-10-15T00:00:00Z'),
    note('elsewhere', '2026-10-21T00:00:00Z', 'p2'),
  ];
  const view = projectOverview(snapshot(tasks, notes), 'p1', now);
  assert.equal(view.next.length, 5);
  assert.equal(view.notes.length, 4);
  assert.deepEqual(
    view.recentNotes.map((n) => n.id),
    ['newest', 'newer', 'middle'],
  );
});
