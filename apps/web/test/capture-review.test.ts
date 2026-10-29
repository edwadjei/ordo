import test from 'node:test';
import assert from 'node:assert/strict';
import type { CaptureRun } from '@ordo/client/capture';
import {
  editTask,
  mergeTasks,
  removeItem,
  saveBody,
  saveProblem,
  startReview,
  taskGroups,
} from '../lib/capture-review.ts';

/** What a fake model returns for a fictional MTN meeting transcript. */
function run(confidence: 'high' | 'low' = 'high'): CaptureRun {
  return {
    id: 'run-1',
    noteId: 'note-1',
    status: 'ready',
    provider: 'fake',
    model: 'fake-1',
    suggestions: {
      summary: 'UAT readiness and the SIM FAQ.',
      tasks: [
        {
          key: 't1',
          title: 'Send QA the test scope',
          dueDate: '2026-10-31',
          isFollowUp: false,
        },
        {
          key: 't2',
          title: 'Draft the SIM FAQ',
          priority: 'high',
          isFollowUp: false,
        },
        {
          key: 't3',
          title: 'Check readiness with QA',
          followUpDate: '2026-10-30',
          followUpTime: '10:00',
          waitingOn: 'Kofi',
          isFollowUp: true,
        },
      ],
      drafts: [
        {
          key: 'd1',
          kind: 'email',
          to: 'qa@example.test',
          subject: 'UAT readiness',
          body: 'Hi QA, is the checklist ready?',
        },
      ],
      destination: {
        workspaceId: 'w-mtn',
        projectId: 'p-sim',
        confidence,
        reason: 'Mentions SIM registration',
      },
    },
  };
}

test('only a ready run with suggestions can be reviewed', () => {
  assert.equal(
    startReview(
      { ...run(), status: 'pending', suggestions: null },
      { workspaceId: 'w-mtn' },
    ),
    null,
  );
  assert.equal(
    startReview({ ...run(), status: 'failed' }, { workspaceId: 'w-mtn' }),
    null,
  );
});

test('everything starts selected; follow-ups are their own group', () => {
  const review = startReview(run(), { workspaceId: 'w-mtn' })!;
  assert.ok([...review.tasks, ...review.drafts].every((item) => item.selected));
  const groups = taskGroups(review);
  assert.deepEqual(
    groups.tasks.map((t) => t.key),
    ['t1', 't2'],
  );
  assert.deepEqual(
    groups.followUps.map((t) => t.key),
    ['t3'],
  );
});

test('a confident destination is used; a low-confidence one stays unassigned until chosen', () => {
  assert.equal(
    startReview(run('high'), { workspaceId: 'w-mtn' })!.destination.projectId,
    'p-sim',
  );
  const low = startReview(run('low'), { workspaceId: 'w-mtn' })!;
  assert.equal(low.destination.projectId, undefined);
  assert.match(saveProblem(low, 'all'), /Choose a project/);
  const chosen = {
    ...low,
    destination: { workspaceId: 'w-mtn', projectId: null },
  };
  assert.equal(saveProblem(chosen, 'all'), '');
  // A project picked before processing wins over the model's guess.
  assert.equal(
    startReview(run('high'), { workspaceId: 'w-mtn', projectId: 'p-other' })!
      .destination.projectId,
    'p-other',
  );
  // A guess in another workspace is never used.
  assert.equal(
    startReview(run('high'), { workspaceId: 'w-damsyn' })!.destination
      .projectId,
    undefined,
  );
});

test('reject one, edit another, save selected', () => {
  let review = startReview(run(), { workspaceId: 'w-mtn' })!;
  review = editTask(review, 't2', { selected: false });
  review = editTask(review, 't1', {
    title: '  Send QA the final test scope ',
    dueTime: '09:30',
  });
  const body = saveBody(review, 'selected');
  assert.deepEqual(
    body.tasks.map((t) => t.title),
    ['Send QA the final test scope', 'Check readiness with QA'],
  );
  assert.equal(body.tasks[0].dueTime, '09:30');
  assert.equal(body.drafts.length, 1);
  assert.equal(body.workspaceId, 'w-mtn');
  assert.equal(body.projectId, 'p-sim');
  assert.ok(
    body.tasks.every((t) => !('selected' in t) && !('workspaceId' in t)),
  );
  // Save All ignores the selection but not removals.
  review = removeItem(review, 'd1');
  const all = saveBody(review, 'all');
  assert.equal(all.tasks.length, 3);
  assert.equal(all.drafts.length, 0);
});

test('merging keeps the earlier dates and both titles', () => {
  const review = mergeTasks(
    startReview(run(), { workspaceId: 'w-mtn' })!,
    't1',
    't3',
  );
  const merged = review.tasks.find((t) => t.key === 't1')!;
  assert.equal(review.tasks.length, 2);
  assert.equal(merged.title, 'Send QA the test scope; Check readiness with QA');
  assert.equal(merged.dueDate, '2026-10-31');
  assert.equal(merged.followUpDate, '2026-10-30');
  assert.equal(merged.followUpTime, '10:00');
  assert.equal(merged.waitingOn, 'Kofi');
  assert.equal(merged.isFollowUp, true);
});

test('a reassigned item names its own destination; nothing else does', () => {
  let review = startReview(run(), { workspaceId: 'w-mtn' })!;
  review = editTask(review, 't2', {
    destination: { workspaceId: 'w-mtn', projectId: 'p-faq' },
  });
  const body = saveBody(review, 'all');
  assert.deepEqual(
    body.tasks.map((t) => [
      t.title,
      'projectId' in t ? t.projectId : '(batch)',
    ]),
    [
      ['Send QA the test scope', '(batch)'],
      ['Draft the SIM FAQ', 'p-faq'],
      ['Check readiness with QA', '(batch)'],
    ],
  );
});

test('empty titles, empty drafts and an empty selection cannot be saved', () => {
  let review = startReview(run(), { workspaceId: 'w-mtn' })!;
  assert.match(
    saveProblem(editTask(review, 't1', { title: ' ' }), 'all'),
    /title/,
  );
  review = {
    ...review,
    tasks: review.tasks.map((t) => ({ ...t, selected: false })),
    drafts: review.drafts.map((d) => ({ ...d, selected: false })),
  };
  assert.match(saveProblem(review, 'selected'), /Select at least one/);
  assert.equal(saveProblem(review, 'all'), '');
});
