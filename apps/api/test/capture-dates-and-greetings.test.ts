import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanGreeting,
  sourceSentence,
  statedDayOfMonth,
} from '../src/domains/capture/capture.checks.js';
import { readSuggestions } from '../src/domains/capture/capture.prompt.js';
import { weeklySync, weeklySyncInput } from './fixtures/weekly-sync.js';

// The release 5 real Workers AI run on the weekly sync left three gaps that
// the checks after validation now close, whatever the model writes.

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
/** The release 5 reply's shape for the weekly sync, mistakes included. */
const release5Reply = {
  summary: 'The team discussed the website relaunch and hiring.',
  tasks: [
    {
      ...blank,
      title: 'Send the homepage copy to Ama for approval',
      dueDate: '2026-10-30',
    },
    {
      ...blank,
      title: 'Follow up with Yaw on the hosting quote',
      dueDate: '2026-11-02',
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
      title:
        'Email the design agency to thank them and ask for the final logo files',
    },
    { ...blank, title: 'Book a review meeting for the site relaunch' },
  ],
  drafts: [
    {
      kind: 'email',
      to: 'the design agency',
      subject: 'Final logo files',
      body: 'Hi the design agency,\n\nThank you for your work on our new logo. Could you please send us the final logo files?\n\nThanks,',
    },
  ],
  destination: {
    projectRef: 'p1',
    confidence: 'high',
    reason: 'Names the site relaunch.',
  },
};

test('the release 5 reply comes back with the stated date, the follow-up date and a clean greeting', () => {
  const suggestions = readSuggestions(release5Reply, weeklySyncInput)!;
  const byTitle = (part: RegExp) =>
    suggestions.tasks.find((task) => part.test(task.title))!;
  const review = byTitle(/review meeting/);
  assert.equal(
    review.dueDate,
    '2026-11-14',
    '"the 14th" after Thursday 29 October',
  );
  assert.equal(review.dueTime, '10:00', '"at 10am" in the same sentence');
  const followUp = byTitle(/hosting quote/);
  assert.equal(followUp.followUpDate, '2026-11-02');
  assert.equal(
    followUp.dueDate,
    null,
    'a follow-up is not due on its follow-up day',
  );
  assert.equal(followUp.waitingOn, 'Yaw');
  // What the model got right is left alone.
  assert.equal(byTitle(/homepage copy/).dueDate, '2026-10-30');
  assert.equal(byTitle(/homepage copy/).dueTime, null);
  assert.equal(byTitle(/job description/).dueDate, '2026-11-04');
  // "I'll write that email today" names no day of the month: no date invented.
  assert.equal(byTitle(/design agency/).dueDate, null);
  assert.match(suggestions.drafts[0].body, /^Hello,\n\nThank you/);
  assert.equal(suggestions.drafts[0].to, 'the design agency');
});

test('days of the month resolve to the next occurrence on or after the note date', () => {
  const today = '2026-10-29';
  for (const [text, expected] of [
    ['book it for the 14th at 10am', '2026-11-14'],
    ['due the 29th', '2026-10-29'],
    ['by the 30th', '2026-10-30'],
    ['on the 31st', '2026-10-31'],
    ['on 14 November', '2026-11-14'],
    ['on the 3rd of March', '2027-03-03'],
    ['Nov 14', '2026-11-14'],
    ['November 2nd', '2026-11-02'],
    ['on 5 Oct', '2027-10-05'],
    ['on 29 February', '2028-02-29'],
    ['on May 4', '2027-05-04'],
  ] as const)
    assert.equal(statedDayOfMonth(text, today), expected, text);
  // The 31st after a 30-day month's 30th: the next month that has a 31st.
  assert.equal(statedDayOfMonth('by the 31st', '2026-11-05'), '2026-12-31');
  for (const text of [
    'the 14th may slip',
    'in 3 days',
    'room 14',
    'at 10am',
    'Friday',
    'the 45th',
    '',
  ])
    assert.equal(statedDayOfMonth(text, today), null, text);
});

test('an item finds its own sentence, never one it merely shares a word with', () => {
  const sentence = sourceSentence(
    'Book a review meeting for the site relaunch',
    weeklySync,
  );
  assert.match(sentence!, /14th at 10am/);
  assert.equal(sourceSentence('Water the plants', weeklySync), null);
  assert.equal(sourceSentence('Do it', weeklySync), null);
});

test('greetings name people, never organisations or articles', () => {
  for (const [body, expected] of [
    ['Hi the design agency,\n\nThanks.', 'Hello,\n\nThanks.'],
    ['Dear our suppliers,\nPlease send it.', 'Hello,\nPlease send it.'],
    ['hello the team\nPlease send it.', 'Hello,\nPlease send it.'],
    ['Hi Kofi,\n\nThanks.', 'Hi Kofi,\n\nThanks.'],
    ['Hello,\n\nThanks.', 'Hello,\n\nThanks.'],
    ['Thanks for the files.', 'Thanks for the files.'],
  ] as const)
    assert.equal(cleanGreeting(body), expected, body);
});
