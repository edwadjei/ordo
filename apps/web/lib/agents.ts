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
 * How to connect Claude Code. These steps never take the key: a command
 * that holds it ends up in plain text in Claude Code's saved settings, and
 * in anything that prints them. The key is saved once, in the Keychain, and
 * read from there each time Claude Code connects.
 */
export interface SetupStep {
  text: string;
  command?: string;
}
export const setupSteps = (origin: string): SetupStep[] => [
  {
    text: 'Save the key in your Mac’s Keychain. Run this, then paste the key when it asks for a password. Nothing is shown or kept in your shell history.',
    command: 'security add-generic-password -U -a "$USER" -s ordo-mcp -w',
  },
  {
    text: 'Add a small script that reads the key from the Keychain when Claude Code connects.',
    command: [
      "mkdir -p ~/.claude && cat > ~/.claude/ordo-headers.sh <<'EOF'",
      '#!/bin/sh',
      'key=$(security find-generic-password -s ordo-mcp -w) || exit 1',
      `printf '{"Authorization":"Bearer %s"}' "$key"`,
      'EOF',
      'chmod 700 ~/.claude/ordo-headers.sh',
    ].join('\n'),
  },
  {
    text: 'Connect Claude Code to Ordo.',
    command: `claude mcp add-json --scope user ordo '{"type":"http","url":"${mcpAddress(origin)}","headersHelper":"'"$HOME"'/.claude/ordo-headers.sh"}'`,
  },
];
export const keySafetyLine =
  'Never paste your key into a chat or a command. To check a connection, run /mcp in Claude Code.';

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
  // A create that matched an existing one by name.
  'workspace.found': 'Found existing workspace',
  'project.found': 'Found existing project',
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

/** Creating a name that already exists opens that one instead; say so plainly. */
export const existingMessage = (kind: 'workspace' | 'project', name: string) =>
  `You already have a ${kind} called “${name}”. Opened it.`;
