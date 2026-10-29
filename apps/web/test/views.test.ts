import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayCounts,
  dayLabel,
  daySections,
  daySummary,
  firstName,
  followUpOverdue,
  greeting,
  hasPassed,
  knownNames,
  localNow,
  looksLikeContact,
  savedAtLabel,
  upcomingGroups,
  waitingTasks,
  whenLabel,
  type EverydayTask,
} from '../lib/views.ts';

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
    parentId: null,
    workspaceId: null,
    projectId: null,
    revision: 1,
    completedAt: null,
    createdAt: `2026-10-01T00:00:${String(seq).padStart(2, '0')}Z`,
    updatedAt: '2026-10-01T00:00:00Z',
    ...fields,
  } as EverydayTask;
}
const now = { date: '2026-10-21', time: '10:30' };

test('greeting uses the local hour and the first word of the display name', () => {
  assert.equal(greeting(8, 'Edward Adjei'), 'Good morning, Edward');
  assert.equal(greeting(13, '  Ama  '), 'Good afternoon, Ama');
  assert.equal(greeting(19, 'Kofi'), 'Good evening, Kofi');
  assert.equal(greeting(2, 'Kofi'), 'Good evening, Kofi');
  assert.equal(greeting(5, ''), 'Good morning');
  assert.equal(firstName(null), '');
});

test('greeting never shows a phone number, an email or the placeholder name', () => {
  assert.equal(greeting(19, '0558601966'), 'Good evening');
  assert.equal(greeting(19, '+233 24 000 0000'), 'Good evening');
  assert.equal(greeting(8, '(024) 000-0000'), 'Good morning');
  assert.equal(greeting(13, 'ama.mensah@example.test'), 'Good afternoon');
  assert.equal(greeting(13, 'Ordo member'), 'Good afternoon');
  assert.equal(greeting(8, 'Ama 2'), 'Good morning, Ama');
  assert.equal(greeting(8, 'Kofi 0558601966'), 'Good morning, Kofi');
  assert.equal(looksLikeContact('0558601966'), true);
  assert.equal(looksLikeContact('someone@example.test'), true);
  assert.equal(looksLikeContact('Agent 47'), false);
  assert.equal(looksLikeContact('2024'), false);
});

test('saved label shows the time today and the date otherwise', () => {
  const now = new Date(2026, 9, 29, 18, 5);
  assert.equal(
    savedAtLabel(new Date(2026, 9, 29, 15, 42), now, 'en-GB'),
    '15:42',
  );
  assert.match(
    savedAtLabel(new Date(2026, 9, 29, 15, 42), now, 'en-US'),
    /^3:42\sPM$/,
  );
  assert.equal(
    savedAtLabel(new Date(2026, 9, 27, 9, 0), now, 'en-GB'),
    '27 Oct',
  );
});

test('localNow reads wall-clock time in the user timezone, with an Accra fallback', () => {
  const instant = new Date('2026-10-21T23:30:00Z');
  assert.deepEqual(localNow('Africa/Accra', instant), {
    date: '2026-10-21',
    time: '23:30',
    hour: 23,
  });
  assert.deepEqual(localNow('Asia/Tokyo', instant), {
    date: '2026-10-22',
    time: '08:30',
    hour: 8,
  });
  assert.equal(localNow('Not/A_Zone', instant).date, '2026-10-21');
  assert.equal(
    localNow('Africa/Accra', new Date('2026-10-21T00:05:00Z')).time,
    '00:05',
  );
});

test('a moment passes when its day is over or its time today has arrived', () => {
  assert.equal(hasPassed({ date: '2026-10-20', time: null }, now), true);
  assert.equal(hasPassed({ date: '2026-10-21', time: '10:30' }, now), true);
  assert.equal(hasPassed({ date: '2026-10-21', time: '10:31' }, now), false);
  assert.equal(hasPassed({ date: '2026-10-21', time: null }, now), false);
});

test('My Day puts each open task in one section: due now, overdue, then today', () => {
  const dueNow = task({ dueDate: '2026-10-21', dueTime: '09:00' });
  const followNow = task({
    followUpDate: '2026-10-21',
    followUpTime: '10:00',
  });
  const later = task({ dueDate: '2026-10-21', dueTime: '16:00' });
  const untimed = task({ dueDate: '2026-10-21' });
  const overdue = task({ dueDate: '2026-10-19', dueTime: '09:00' });
  const both = task({ dueDate: '2026-10-21', followUpDate: '2026-10-18' });
  const done = task({ dueDate: '2026-10-21', status: 'done' });
  const future = task({ dueDate: '2026-10-25' });
  const sections = daySections(
    [dueNow, followNow, later, untimed, overdue, both, done, future],
    now,
  );
  assert.deepEqual(
    sections.dueNow.map((t) => t.id),
    [dueNow.id, followNow.id],
  );
  assert.deepEqual(
    sections.overdue.map((t) => t.id),
    [both.id, overdue.id],
  );
  assert.deepEqual(
    sections.today.map((t) => t.id),
    [later.id, untimed.id],
  );
});

test('counts cover today, overdue, seven-day upcoming, waiting and inbox for open tasks in scope', () => {
  const ws = '11111111-1111-4111-8111-111111111111';
  const tasks = [
    task({ dueDate: '2026-10-21', projectId: 'p', workspaceId: ws }),
    task({ dueDate: '2026-10-20' }),
    task({ followUpDate: '2026-10-28', status: 'waiting' }),
    task({ dueDate: '2026-10-29' }),
    task({ dueDate: '2026-10-22', status: 'done' }),
    task({ status: 'waiting', projectId: 'p', workspaceId: ws }),
  ];
  assert.deepEqual(dayCounts(tasks, now), {
    today: 1,
    overdue: 1,
    upcoming: 1,
    waiting: 2,
    inbox: 3,
  });
  assert.deepEqual(dayCounts(tasks, now, ws), {
    today: 1,
    overdue: 0,
    upcoming: 0,
    waiting: 1,
    inbox: 0,
  });
});

test('the day summary is short and plain', () => {
  const base = { today: 0, overdue: 0, upcoming: 0, waiting: 0, inbox: 0 };
  assert.equal(
    daySummary({ ...base, today: 3, overdue: 1 }, 1),
    '1 due now, 2 more for today and 1 overdue.',
  );
  assert.equal(daySummary({ ...base, today: 1 }, 0), '1 thing for today.');
  assert.equal(
    daySummary({ ...base, upcoming: 2 }, 0),
    'Nothing due today. 2 coming up this week.',
  );
});

test('upcoming groups seven local days with due and follow-up moments ordered by time', () => {
  const a = task({ title: 'Call', dueDate: '2026-10-22', dueTime: '14:00' });
  const b = task({
    title: 'Chase vendor',
    followUpDate: '2026-10-22',
    followUpTime: '09:15',
    dueDate: '2026-10-24',
  });
  const c = task({ title: 'Anytime', dueDate: '2026-10-22' });
  const outside = task({ dueDate: '2026-10-29' });
  const todayTask = task({ dueDate: '2026-10-21' });
  const groups = upcomingGroups([a, b, c, outside, todayTask], now.date);
  assert.equal(groups.length, 7);
  assert.deepEqual(
    groups.map((g) => g.date),
    [
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
    ],
  );
  assert.equal(groups[0].label, 'Tomorrow');
  assert.equal(groups[1].label, 'Friday 23 Oct');
  assert.deepEqual(
    groups[0].items.map((m) => [m.task.title, m.kind, m.time]),
    [
      ['Chase vendor', 'follow-up', '09:15'],
      ['Call', 'due', '14:00'],
      ['Anytime', 'due', null],
    ],
  );
  assert.deepEqual(
    groups[2].items.map((m) => [m.task.id, m.kind]),
    [[b.id, 'due']],
  );
  assert.equal(
    groups.flatMap((g) => g.items).some((m) => m.task.id === outside.id),
    false,
  );
});

test('upcoming groups cross a month and year boundary in local days', () => {
  const groups = upcomingGroups([], '2026-12-29');
  assert.deepEqual(
    groups.map((g) => g.date),
    [
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
      '2027-01-04',
      '2027-01-05',
    ],
  );
  assert.equal(groups[2].label, 'Friday 1 Jan 2027');
});

test('date labels are relative near today and short otherwise', () => {
  assert.equal(dayLabel('2026-10-20', now.date), 'Yesterday');
  assert.equal(whenLabel('2026-10-21', '14:30', now.date), 'Today · 14:30');
  assert.equal(whenLabel('2026-10-30', null, now.date), '30 Oct');
});

test('waiting rows sort by follow-up and flag passed follow-ups', () => {
  const none = task({ status: 'waiting', waitingOn: 'Ama' });
  const late = task({
    status: 'waiting',
    followUpDate: '2026-10-21',
    followUpTime: '08:00',
  });
  const soon = task({
    status: 'waiting',
    followUpDate: '2026-10-21',
    followUpTime: '17:00',
  });
  const other = task({ status: 'todo', followUpDate: '2026-10-20' });
  const list = waitingTasks([none, soon, late, other]);
  assert.deepEqual(
    list.map((t) => t.id),
    [late.id, soon.id, none.id],
  );
  assert.equal(followUpOverdue(late, now), true);
  assert.equal(followUpOverdue(soon, now), false);
  assert.equal(followUpOverdue(none, now), false);
});

test('known names are trimmed, unique without case, and sorted', () => {
  assert.deepEqual(
    knownNames([
      task({ waitingOn: 'Kofi Mensah', responsiblePerson: ' ama ' }),
      task({ waitingOn: 'kofi mensah', responsiblePerson: 'Abena' }),
      task({ waitingOn: null, responsiblePerson: '' }),
    ]),
    ['Abena', 'ama', 'Kofi Mensah'],
  );
});
