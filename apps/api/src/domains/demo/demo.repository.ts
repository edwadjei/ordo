import { isoNow } from '../../platform/time/iso-now.js';
import {
  DatabaseAdapter,
  eq,
  insertWhere,
  sql,
  tables,
  type NewTask,
} from '../../adapters/database/database.adapter.js';
import { newId } from '../../platform/identifiers/new-id.js';

const { users, workspaces, projects, tasks, notes } = tables;

const mtnNames = [
  'SIM Registration',
  'Self-Service SIM Swap',
  'One TV',
  'Customer Portal',
  'Digital Onboarding',
  'Service Experience',
  'Account Recovery',
  'Usage Insights',
  'Payment Journey',
  'Support Tools',
  'Retail Experience',
  'Network Dashboard',
  'Accessibility Review',
  'Partner Portal',
  'Device Management',
  'Customer Feedback',
  'Identity Checks',
  'Notification Service',
  'API Catalogue',
  'Release Readiness',
  'Help Centre',
];

export class DemoRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  /**
   * One batch. It starts with the claim `UPDATE users SET demo_loaded = 1 …
   * WHERE demo_loaded = 0`, which also records a fresh random claim value;
   * every fixture insert runs only while that claim is this request's, so a
   * repeated or concurrent request inserts nothing.
   */
  async insertOnce(ownerUserId: string) {
    const claim = newId();
    const now = isoNow();
    const workspaceRows = [
      { id: newId(), ownerUserId, name: 'MTN', color: '#c49936' },
      { id: newId(), ownerUserId, name: 'DAMSYN', color: '#7367ad' },
      { id: newId(), ownerUserId, name: 'Dorsh', color: '#5a8498' },
      { id: newId(), ownerUserId, name: 'Personal', color: '#5c8970' },
    ];
    const projectRows = [
      ...mtnNames.map((name) => ({
        id: newId(),
        ownerUserId,
        workspaceId: workspaceRows[0].id,
        name,
        description: 'Fictional sample project for exploring Ordo.',
      })),
      {
        id: newId(),
        ownerUserId,
        workspaceId: workspaceRows[1].id,
        name: 'API v2',
        description: 'Fictional sample project.',
      },
      {
        id: newId(),
        ownerUserId,
        workspaceId: workspaceRows[2].id,
        name: 'Launch preparation',
        description: 'Fictional sample project.',
      },
      {
        id: newId(),
        ownerUserId,
        workspaceId: workspaceRows[3].id,
        name: 'Life admin',
        description: 'Fictional sample project.',
      },
    ];
    const today = now.slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    // Every row names the same columns, as one guarded multi-row insert needs.
    const task = (fields: Partial<NewTask> & { title: string }) => ({
      id: newId(),
      ownerUserId,
      workspaceId: null,
      projectId: null,
      parentId: null,
      description: '',
      status: 'todo' as const,
      priority: null,
      dueDate: null,
      followUpDate: null,
      ...fields,
    });
    const mainTask = task({
      workspaceId: workspaceRows[0].id,
      projectId: projectRows[0].id,
      title: 'Review the onboarding flow',
      description:
        'Fictional example: capture findings before the next review.',
      status: 'in_progress',
      priority: 'high',
      dueDate: today,
    });
    const taskRows = [
      mainTask,
      task({
        workspaceId: workspaceRows[0].id,
        projectId: projectRows[1].id,
        title: 'Confirm QA readiness',
        description: 'Fictional example: waiting for the test checklist.',
        status: 'waiting',
        followUpDate: today,
        dueDate: tomorrow,
      }),
      task({
        workspaceId: workspaceRows[1].id,
        projectId: projectRows[21].id,
        title: 'Write the API release notes',
        dueDate: today,
        priority: 'medium',
      }),
      task({
        workspaceId: workspaceRows[2].id,
        projectId: projectRows[22].id,
        title: 'Prepare the launch checklist',
        dueDate: tomorrow,
      }),
      task({
        workspaceId: workspaceRows[3].id,
        projectId: projectRows[23].id,
        title: 'Book a little time to plan the week',
        dueDate: yesterday,
      }),
      task({
        title: 'A thought worth coming back to',
        description:
          'Fictional sample Inbox item. Give your real captures a home when you are ready.',
      }),
      task({
        workspaceId: workspaceRows[0].id,
        projectId: projectRows[0].id,
        parentId: mainTask.id,
        title: 'Check the empty and error states',
      }),
    ];
    const noteRow = {
      id: newId(),
      ownerUserId,
      workspaceId: workspaceRows[0].id,
      projectId: projectRows[0].id,
      title: 'A quieter way to work',
      body: 'Fictional sample note\n\nCapture first. Decide what belongs where afterwards.\n\n• Keep the next action visible\n• Preserve the original thought\n• Make room for focused work',
    };
    const claimed = sql`EXISTS (SELECT 1 FROM ${users} WHERE id = ${ownerUserId} AND demo_claim = ${claim})`;
    const db = this.database.use();
    await db.batch([
      db
        .update(users)
        .set({ demoLoaded: true, demoClaim: claim, updatedAt: now })
        .where(sql`${eq(users.id, ownerUserId)} AND ${users.demoLoaded} = 0`),
      db.run(insertWhere(workspaces, workspaceRows, claimed)),
      db.run(insertWhere(projects, projectRows, claimed)),
      db.run(insertWhere(tasks, taskRows, claimed)),
      db.run(insertWhere(notes, [noteRow], claimed)),
    ]);
  }
}
