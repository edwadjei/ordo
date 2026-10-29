import type {
  AgentActivity,
  AgentTokenRecord,
  HomeSnapshot,
} from '@ordo/client';

/**
 * Connected assistants: wording and small rules for access keys, their
 * activity, and "By agent" on what they create. Keys themselves are only
 * ever held in memory on the screen that shows them once.
 */

export type KeyStatus = 'active' | 'revoked' | 'expired';
export function keyStatus(
  record: AgentTokenRecord,
  now = new Date(),
): KeyStatus {
  if (record.revokedAt) return 'revoked';
  if (record.expiresAt && new Date(record.expiresAt) <= now) return 'expired';
  return 'active';
}
export const scopeLabel = (record: Pick<AgentTokenRecord, 'scopes'>) =>
  record.scopes.includes('write') ? 'Read and write' : 'Read only';

export const expiryChoices = [
  { value: 'never', label: 'Never expires' },
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '365', label: 'In a year' },
] as const;
export type ExpiryChoice = (typeof expiryChoices)[number]['value'];
/** The expiry to send for a choice: null for never, else that many days on. */
export function expiresAt(choice: ExpiryChoice, now = new Date()) {
  if (choice === 'never') return null;
  return new Date(now.getTime() + Number(choice) * 86_400_000).toISOString();
}

/** The MCP address on this Ordo. */
export const mcpAddress = (origin: string) =>
  `${origin.replace(/\/$/, '')}/api/mcp`;
/**
 * The Claude Code command to connect. With no key it shows where the key
 * goes; the real key appears only on the screen that shows it once.
 */
export const connectCommand = (origin: string, key = 'PASTE_YOUR_KEY_HERE') =>
  `claude mcp add --transport http ordo ${mcpAddress(origin)} --header "Authorization: Bearer ${key}"`;

const toolWords: Record<string, string> = {
  get_my_day: 'Read My Day',
  search: 'Searched',
  list_workspaces: 'Listed workspaces',
  list_projects: 'Listed projects',
  list_tasks: 'Listed tasks',
  get_task: 'Read task',
  create_task: 'Created task',
  update_task: 'Updated task',
  complete_task: 'Completed task',
  create_note: 'Created note',
  get_note: 'Read note',
  create_workspace: 'Created workspace',
  create_project: 'Created project',
  update_project: 'Updated project',
};
const actionWords: Record<string, string> = {
  'task.create': 'Created task',
  'task.update': 'Updated task',
  'task.complete': 'Completed task',
  'task.archive': 'Archived task',
  'note.create': 'Created note',
  'note.update': 'Updated note',
  'note.archive': 'Archived note',
  'capture.save': 'Saved a capture',
  'workspace.create': 'Created workspace',
  'project.create': 'Created project',
  'project.update': 'Updated project',
};
/** Activity in words: "Created task “Send QA the scope”". */
export function activityText(entry: AgentActivity, data: HomeSnapshot) {
  const verb = entry.action.startsWith('mcp.')
    ? toolWords[entry.action.slice(4)] ||
      `Used ${entry.action.slice(4).replace(/_/g, ' ')}`
    : actionWords[entry.action] || entry.action.replace(/[._]/g, ' ');
  if (entry.entityType === 'project') {
    const project = data.projects.find((p) => p.id === entry.entityId);
    if (!project) return verb;
    const workspace = data.workspaces.find((w) => w.id === project.workspaceId);
    return workspace
      ? `${verb} “${project.name}” in ${workspace.name}`
      : `${verb} “${project.name}”`;
  }
  const title =
    entry.entityType === 'task'
      ? data.tasks.find((task) => task.id === entry.entityId)?.title
      : entry.entityType === 'note'
        ? data.notes.find((note) => note.id === entry.entityId)?.title
        : entry.entityType === 'workspace'
          ? data.workspaces.find((w) => w.id === entry.entityId)?.name
          : undefined;
  return title ? `${verb} “${title}”` : verb;
}
/** Whether an activity entry's item can be opened from here. */
export function activityTarget(
  entry: AgentActivity,
  data: HomeSnapshot,
): { type: 'task' | 'note' | 'workspace' | 'project'; id: string } | null {
  if (
    entry.entityType === 'task' &&
    data.tasks.some((t) => t.id === entry.entityId)
  )
    return { type: 'task', id: entry.entityId! };
  if (
    entry.entityType === 'note' &&
    data.notes.some((n) => n.id === entry.entityId)
  )
    return { type: 'note', id: entry.entityId! };
  if (
    entry.entityType === 'workspace' &&
    data.workspaces.some((w) => w.id === entry.entityId)
  )
    return { type: 'workspace', id: entry.entityId! };
  if (
    entry.entityType === 'project' &&
    data.projects.some((p) => p.id === entry.entityId)
  )
    return { type: 'project', id: entry.entityId! };
  return null;
}

/** "By agent · Claude Code" for items an assistant created, else ''. */
export function byAgent(
  item: object,
  tokens: Pick<AgentTokenRecord, 'id' | 'name'>[],
) {
  const made = item as { origin?: string; createdByTokenId?: string | null };
  if (made.origin !== 'agent') return '';
  const name = tokens.find((token) => token.id === made.createdByTokenId)?.name;
  return name ? `By agent · ${name}` : 'By agent';
}

/** What a connected assistant can and can't do, for the help text. */
export const agentCan = [
  'Read My Day, search, and list workspaces, projects and tasks',
  'Create workspaces and projects, and rename or describe projects',
  'Add, edit and complete tasks, and add notes',
];
export const agentCannot = [
  'Delete or archive workspaces and projects, or delete anything else',
  'Change your settings or access keys',
];
