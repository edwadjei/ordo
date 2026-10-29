import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  captureSystemPrompt,
  capturePrompt,
  readSuggestions,
  statedTimes,
} from '../src/domains/capture/capture.prompt.js';
import {
  TextModel,
  TextModelProviders,
} from '../src/capabilities/text-model.contract.js';
import { apiHarness, origin, signIn } from './d1-harness.js';
import {
  hiring,
  websiteRelaunch,
  weeklySync,
  weeklySyncExpectations,
  weeklySyncInput,
} from './fixtures/weekly-sync.js';

// The first real Workers AI run on the fictional weekly sync made four
// mistakes that clearer instructions address. The checks after validation
// below hold even when a model ignores them.

const blank = {
  dueDate: null,
  dueTime: null,
  followUpDate: null,
  followUpTime: null,
  priority: null,
  responsiblePerson: null,
  waitingOn: null,
  isFollowUp: false,
};
/** The real run's reply, mistakes included. */
const realRunReply = {
  summary: 'The team reviewed the website relaunch and hiring.',
  tasks: [
    {
      ...blank,
      title: 'Send the homepage copy to Ama for approval',
      dueDate: '2026-10-30',
      dueTime: '23:59',
      responsiblePerson: 'me',
    },
    {
      ...blank,
      title: 'Follow up with Yaw on the hosting quote',
      followUpDate: '2026-11-02',
      followUpTime: '09:00',
      waitingOn: 'Yaw',
      isFollowUp: true,
    },
    {
      ...blank,
      title: 'Draft the job description for the frontend developer role',
      dueDate: '2026-11-04',
      responsiblePerson: 'Kofi',
    },
    {
      ...blank,
      title: 'Email the design agency for the final logo files',
      dueDate: '2026-10-29',
      responsiblePerson: 'I',
    },
    {
      ...blank,
      title: 'Book a review meeting for the site relaunch',
      dueDate: '2026-11-14',
      dueTime: '10:00',
      responsiblePerson: 'We',
    },
  ],
  drafts: [
    {
      kind: 'email',
      to: 'the design agency',
      subject: 'Final logo files',
      body: 'Hi, thank you for the logo work. Could you send us the final logo files?',
    },
  ],
  destination: {
    projectRef: 'p1',
    confidence: 'high',
    reason: 'Site relaunch.',
  },
};

test('the instructions cover the owner, stated times, real drafts and days of the month', () => {
  for (const rule of [
    /"I", "me", "my" and "we" mean the owner/,
    /Never "me", "I", "myself", "we" or "us"/,
    /Never fill in a default time such as 09:00, 17:00 or 23:59/,
    /"the 14th" is the next 14th on or after today/,
    /The body is the message itself, ready to send, written in the owner's voice/,
    /Give an email a short subject/,
  ])
    assert.match(captureSystemPrompt, rule);
  const prompt = capturePrompt(weeklySyncInput);
  assert.match(prompt, /Today is Thursday 2026-10-29 \(Africa\/Accra\)/);
  assert.match(
    prompt,
    /name: Website Relaunch\n {2}aliases: site relaunch; new website/,
  );
  assert.ok(prompt.includes(weeklySync.trim()));
});

test('times are kept only when the capture states them', () => {
  assert.deepEqual([...statedTimes(weeklySync)], ['10:00']);
  assert.deepEqual(
    [...statedTimes('Call at 2:30 pm, then 14:00 and noon')].sort(),
    ['12:00', '14:00', '14:30'],
  );
  assert.deepEqual([...statedTimes("3 o'clock")].sort(), ['03:00', '15:00']);
  // Spelled-out or bare hours are not recognised: dropping is the safe side.
  assert.deepEqual([...statedTimes('half past two, or at 9 tomorrow')], []);
  assert.deepEqual([...statedTimes('Room 101 seats 3 people')], []);
});

test('after validation, the owner is never a responsible person and invented times are dropped', () => {
  const suggestions = readSuggestions(realRunReply, weeklySyncInput)!;
  assert.ok(suggestions);
  const [copy, quote, jobDescription, email, review] = suggestions.tasks;
  assert.equal(copy.responsiblePerson, null, '"me" is the owner');
  assert.equal(copy.dueTime, null, '23:59 was never said');
  assert.equal(copy.dueDate, '2026-10-30');
  assert.equal(quote.followUpTime, null, '09:00 was never said');
  assert.equal(quote.waitingOn, 'Yaw');
  assert.equal(jobDescription.responsiblePerson, 'Kofi');
  assert.equal(email.responsiblePerson, null, '"I" is the owner');
  assert.equal(review.responsiblePerson, null, '"We" is the owner');
  assert.equal(review.dueTime, '10:00', '"10am" is stated');
  for (const expected of weeklySyncExpectations) {
    const task = suggestions.tasks.find((t) => expected.title.test(t.title))!;
    for (const [key, value] of Object.entries(expected))
      if (key !== 'title')
        assert.equal(
          task[key as keyof typeof task],
          value,
          `${expected.title} ${key}`,
        );
  }
  assert.equal(suggestions.destination.projectId, websiteRelaunch);
  assert.notEqual(suggestions.destination.projectId, hiring);
});

test('a processed capture comes back with the checks applied', async (t) => {
  class Fake extends TextModel {
    readonly provider = 'workers_ai' as const;
    readonly model = 'fake';
    readonly maxInputCharacters = 64000;
    async generate() {
      return {
        output: realRunReply,
        usage: { inputTokens: 607, outputTokens: 526, neurons: 124 },
      };
    }
  }
  class Providers extends TextModelProviders {
    workersAiAvailable = () => true;
    workersAi = () => new Fake();
    openAi = () => new Fake();
    anthropic = () => new Fake();
  }
  const h = await apiHarness({ aiSettings: { providers: new Providers() } });
  t.after(() => h.app.close());
  const { cookie } = await signIn(h);
  const call = (url: string, payload: object) =>
    h.app.inject({ method: 'POST', url, headers: { origin, cookie }, payload });
  const workspace = (await call('/v1/workspaces', { name: 'DAMSYN' })).json();
  await call('/v1/projects', {
    name: 'Website Relaunch',
    workspaceId: workspace.id,
    aliases: ['site relaunch', 'new website'],
  });
  const note = (
    await call('/v1/notes', {
      title: 'Weekly sync',
      body: weeklySync,
      source: 'transcript',
    })
  ).json();
  const run = (
    await call(`/v1/notes/${note.id}/process`, { workspaceId: workspace.id })
  ).json();
  assert.equal(run.status, 'ready');
  const people = run.suggestions.tasks.map(
    (task: { responsiblePerson: string | null }) => task.responsiblePerson,
  );
  assert.deepEqual(people, [null, null, 'Kofi', null, null]);
  assert.deepEqual(
    run.suggestions.tasks.map(
      (task: { dueTime: string | null }) => task.dueTime,
    ),
    [null, null, null, null, '10:00'],
  );
});
