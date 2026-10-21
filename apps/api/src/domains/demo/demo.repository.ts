import {
  DatabaseAdapter,
  eq,
  tables,
  type TransactionContext,
} from '../../adapters/database/database.adapter.js';
import { newId } from '../../platform/identifiers/new-id.js';

const { users, workspaces, projects, tasks, notes } = tables;

export class DemoRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  async hasLoaded(ownerUserId: string, transaction: TransactionContext) {
    const [user] = await this.database
      .use(transaction)
      .select({ demoLoaded: users.demoLoaded })
      .from(users)
      .where(eq(users.id, ownerUserId));
    return user.demoLoaded;
  }

  async insert(ownerUserId: string, transaction: TransactionContext) {
    const tx = this.database.use(transaction);
    const workspaceRows = [
      { id: newId(), ownerUserId, name: 'MTN', color: '#c49936' },
      { id: newId(), ownerUserId, name: 'DAMSYN', color: '#7367ad' },
      { id: newId(), ownerUserId, name: 'Dorsh', color: '#5a8498' },
      { id: newId(), ownerUserId, name: 'Personal', color: '#5c8970' },
    ];
    await tx.insert(workspaces).values(workspaceRows);
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
    await tx.insert(projects).values(projectRows);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    const mainTask = newId();
    await tx.insert(tasks).values([
      {
        id: mainTask,
        ownerUserId,
        workspaceId: workspaceRows[0].id,
        projectId: projectRows[0].id,
        title: 'Review the onboarding flow',
        description:
          'Fictional example: capture findings before the next review.',
        status: 'in_progress',
        priority: 'high',
        dueDate: today,
      },
      {
        id: newId(),
        ownerUserId,
        workspaceId: workspaceRows[0].id,
        projectId: projectRows[1].id,
        title: 'Confirm QA readiness',
        description: 'Fictional example: waiting for the test checklist.',
        status: 'waiting',
        followUpDate: today,
        dueDate: tomorrow,
      },
      {
        id: newId(),
        ownerUserId,
        workspaceId: workspaceRows[1].id,
        projectId: projectRows[21].id,
        title: 'Write the API release notes',
        status: 'todo',
        dueDate: today,
        priority: 'medium',
      },
      {
        id: newId(),
        ownerUserId,
        workspaceId: workspaceRows[2].id,
        projectId: projectRows[22].id,
        title: 'Prepare the launch checklist',
        status: 'todo',
        dueDate: tomorrow,
      },
      {
        id: newId(),
        ownerUserId,
        workspaceId: workspaceRows[3].id,
        projectId: projectRows[23].id,
        title: 'Book a little time to plan the week',
        status: 'todo',
        dueDate: yesterday,
      },
      {
        id: newId(),
        ownerUserId,
        workspaceId: null,
        projectId: null,
        title: 'A thought worth coming back to',
        description:
          'Fictional sample Inbox item. Give your real captures a home when you are ready.',
        status: 'todo',
      },
    ]);
    await tx.insert(tasks).values({
      id: newId(),
      ownerUserId,
      workspaceId: workspaceRows[0].id,
      projectId: projectRows[0].id,
      parentId: mainTask,
      title: 'Check the empty and error states',
      status: 'todo',
    });
    await tx.insert(notes).values({
      id: newId(),
      ownerUserId,
      workspaceId: workspaceRows[0].id,
      projectId: projectRows[0].id,
      title: 'A quieter way to work',
      body: 'Fictional sample note\n\nCapture first. Decide what belongs where afterwards.\n\n• Keep the next action visible\n• Preserve the original thought\n• Make room for focused work',
    });
    await tx
      .update(users)
      .set({ demoLoaded: true, updatedAt: new Date().toISOString() })
      .where(eq(users.id, ownerUserId));
  }
}
