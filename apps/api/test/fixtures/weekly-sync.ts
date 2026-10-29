import { readFileSync } from 'node:fs';
import type { CapturePromptInput } from '../../src/domains/capture/capture.prompt.js';

/**
 * A fictional weekly sync, processed on Thursday 29 October 2026 in the
 * DAMSYN workspace. Used by the capture tests (with a fake model) and by
 * `scripts/capture-real-run.ts` (one real run, approved at the time).
 */
export const weeklySync = readFileSync(
  new URL('./weekly-sync.txt', import.meta.url),
  'utf8',
);

export const websiteRelaunch = '00000000-0000-4000-8000-0000000000a1';
export const hiring = '00000000-0000-4000-8000-0000000000a2';

export const weeklySyncInput: CapturePromptInput = {
  note: { title: 'Weekly sync', body: weeklySync, source: 'transcript' },
  workspace: { id: '00000000-0000-4000-8000-0000000000aa', name: 'DAMSYN' },
  projects: [
    {
      id: websiteRelaunch,
      name: 'Website Relaunch',
      description: '',
      aliases: ['site relaunch', 'new website'],
    },
    { id: hiring, name: 'Hiring', description: '', aliases: [] },
  ],
  chosenProjectId: null,
  today: { date: '2026-10-29', weekday: 'Thursday', timezone: 'Africa/Accra' },
};

/** What a good run returns, as checks that a reviewer can read. */
export const weeklySyncExpectations: {
  title: RegExp;
  dueDate?: string;
  dueTime?: string | null;
  followUpDate?: string;
  responsiblePerson?: string | null;
  waitingOn?: string;
}[] = [
  {
    title: /homepage copy/i,
    dueDate: '2026-10-30',
    dueTime: null,
    responsiblePerson: null,
  },
  { title: /hosting quote/i, followUpDate: '2026-11-02', waitingOn: 'Yaw' },
  {
    title: /job description/i,
    dueDate: '2026-11-04',
    responsiblePerson: 'Kofi',
  },
  { title: /review meeting/i, dueDate: '2026-11-14', dueTime: '10:00' },
];
