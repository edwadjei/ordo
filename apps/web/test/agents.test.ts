import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentActivity, HomeSnapshot } from '@ordo/client';
import {
  activityTarget,
  existingMessage,
  activityText,
  byAgent,
  keySafetyLine,
  expiresAt,
  keyStatus,
  mcpAddress,
  otherSystemsStep,
  scopeLabel,
  setupSteps,
} from '../lib/agents.ts';

const record = (fields: object = {}) =>
  ({
    id: 'k1',
    name: 'Claude Code',
    scopes: ['read'],
    createdAt: '2026-10-01T00:00:00Z',
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    ...fields,
  }) as never;
const now = new Date('2026-10-30T12:00:00Z');

test('a key is active, revoked or expired', () => {
  assert.equal(keyStatus(record(), now), 'active');
  assert.equal(
    keyStatus(record({ revokedAt: '2026-10-29T00:00:00Z' }), now),
    'revoked',
  );
  assert.equal(
    keyStatus(record({ expiresAt: '2026-10-30T11:59:00Z' }), now),
    'expired',
  );
  assert.equal(
    keyStatus(record({ expiresAt: '2026-11-30T00:00:00Z' }), now),
    'active',
  );
  assert.equal(scopeLabel(record()), 'Read only');
  assert.equal(
    scopeLabel(record({ scopes: ['read', 'write'] })),
    'Read and write',
  );
});

test('expiry choices become times from now, or none', () => {
  assert.equal(expiresAt('never', now), null);
  assert.equal(expiresAt('30', now), '2026-11-29T12:00:00.000Z');
});

test('the MCP address', () => {
  assert.equal(
    mcpAddress('https://ordo.example.test/'),
    'https://ordo.example.test/api/mcp',
  );
});

test('no setup command contains a key or a header with one in it', () => {
  // The steps take no key, so none can leak into a command or saved config.
  assert.equal(setupSteps.length, 1);
  assert.equal(otherSystemsStep.length, 1);
  for (const origin of ['https://ordo.example.test', 'http://127.0.0.1:8798']) {
    const commands = [...setupSteps(origin), otherSystemsStep(origin)].flatMap(
      (step) => step.command ?? [],
    );
    assert.equal(commands.length, 4);
    for (const command of commands) {
      assert.doesNotMatch(command, /ordo_pat_[A-Za-z0-9_-]/);
      assert.doesNotMatch(command, /Bearer\s+[A-Za-z0-9_-]{8,}/);
      assert.ok(
        command.includes(mcpAddress(origin)) || !command.includes('http'),
      );
    }
  }
});

test('the setup commands keep the quotes that stop the shell expanding them', () => {
  const [store, helper, add] = setupSteps('https://ordo.example.test');
  assert.equal(
    store.command,
    'security add-generic-password -a "$USER" -s ordo-mcp -U -w',
  );
  assert.match(
    helper.command!,
    /^cat > ~\/\.claude\/ordo-mcp-headers\.sh <<'EOF'\n/,
  );
  assert.match(
    helper.command!,
    /\nchmod 700 ~\/\.claude\/ordo-mcp-headers\.sh$/,
  );
  assert.equal(
    add.command,
    `claude mcp add-json --scope user ordo '{"type":"http","url":"https://ordo.example.test/api/mcp","headersHelper":"$HOME/.claude/ordo-mcp-headers.sh"}'`,
  );
  assert.equal(
    otherSystemsStep('https://ordo.example.test').command,
    "claude mcp add --scope user --transport http ordo https://ordo.example.test/api/mcp --header 'Authorization: Bearer ${ORDO_KEY}'",
  );
});

test('the safety line says not to paste the key and how to check', () => {
  assert.equal(
    keySafetyLine,
    'Never paste your key into a chat or a command. To check a connection, run /mcp in Claude Code or claude mcp list in a terminal.',
  );
});

const data = {
  tasks: [{ id: 't1', title: 'Send QA the scope' }],
  notes: [{ id: 'n1', title: 'UAT notes' }],
} as unknown as HomeSnapshot;
const entry = (
  action: string,
  entityType: string | null = null,
  entityId: string | null = null,
) =>
  ({
    id: 'a',
    tokenId: 'k1',
    action,
    entityType,
    entityId,
    createdAt: '2026-10-30T09:00:00Z',
  }) as AgentActivity;

test('activity reads as words, naming the item when it is here', () => {
  assert.equal(
    activityText(entry('task.create', 'task', 't1'), data),
    'Created task “Send QA the scope”',
  );
  assert.equal(
    activityText(entry('mcp.complete_task', 'task', 't1'), data),
    'Completed task “Send QA the scope”',
  );
  assert.equal(
    activityText(entry('note.create', 'note', 'n1'), data),
    'Created note “UAT notes”',
  );
  assert.equal(activityText(entry('mcp.get_my_day'), data), 'Read My Day');
  assert.equal(activityText(entry('mcp.new_tool'), data), 'Used new tool');
  assert.equal(
    activityText(entry('task.archive', 'task', 'gone'), data),
    'Archived task',
  );
  assert.deepEqual(activityTarget(entry('task.create', 'task', 't1'), data), {
    type: 'task',
    id: 't1',
  });
  assert.equal(
    activityTarget(entry('task.archive', 'task', 'gone'), data),
    null,
  );
});

test('By agent names the key that created the item', () => {
  const tokens = [{ id: 'k1', name: 'Claude Code' }];
  assert.equal(
    byAgent({ origin: 'agent', createdByTokenId: 'k1' }, tokens),
    'By agent · Claude Code',
  );
  assert.equal(
    byAgent({ origin: 'agent', createdByTokenId: 'gone' }, tokens),
    'By agent',
  );
  assert.equal(byAgent({ origin: 'manual' }, tokens), '');
  assert.equal(byAgent({}, tokens), '');
});

test('activity names workspaces and projects an assistant created, with their workspace', () => {
  const places = {
    tasks: [],
    notes: [],
    workspaces: [
      { id: 'w1', name: 'DOSH' },
      { id: 'mtn', name: 'MTN' },
    ],
    projects: [{ id: 'p1', name: 'Verify', workspaceId: 'mtn' }],
  } as unknown as HomeSnapshot;
  assert.equal(
    activityText(entry('workspace.create', 'workspace', 'w1'), places),
    'Created workspace “DOSH”',
  );
  assert.equal(
    activityText(entry('project.create', 'project', 'p1'), places),
    'Created project “Verify” in MTN',
  );
  assert.equal(
    activityText(entry('mcp.update_project', 'project', 'p1'), places),
    'Updated project “Verify” in MTN',
  );
  assert.equal(
    activityText(entry('project.create', 'project', 'gone'), places),
    'Created project',
  );
  assert.deepEqual(
    activityTarget(entry('workspace.create', 'workspace', 'w1'), places),
    { type: 'workspace', id: 'w1' },
  );
  assert.deepEqual(
    activityTarget(entry('project.create', 'project', 'p1'), places),
    { type: 'project', id: 'p1' },
  );
  assert.equal(
    activityTarget(entry('project.create', 'project', 'gone'), places),
    null,
  );
});

test('By agent works on workspaces and projects too', () => {
  assert.equal(
    byAgent(
      { id: 'w', name: 'DOSH', origin: 'agent', createdByTokenId: 'k1' },
      [{ id: 'k1', name: 'Claude Code' }],
    ),
    'By agent · Claude Code',
  );
  assert.equal(
    byAgent({ id: 'w', name: 'MTN' }, [{ id: 'k1', name: 'Claude Code' }]),
    '',
  );
});

test('creating an existing name says so plainly', () => {
  assert.equal(
    existingMessage('workspace', 'Work'),
    'You already have a workspace called “Work”. Opened it.',
  );
  assert.equal(
    existingMessage('project', 'Verify'),
    'You already have a project called “Verify”. Opened it.',
  );
});

test('a create that found an existing one says so', () => {
  const places = {
    tasks: [],
    notes: [],
    workspaces: [
      { id: 'w1', name: 'DOSH' },
      { id: 'mtn', name: 'MTN' },
    ],
    projects: [{ id: 'p1', name: 'Verify', workspaceId: 'mtn' }],
  } as unknown as HomeSnapshot;
  assert.equal(
    activityText(entry('workspace.found', 'workspace', 'w1'), places),
    'Found existing workspace “DOSH”',
  );
  assert.equal(
    activityText(entry('project.found', 'project', 'p1'), places),
    'Found existing project “Verify” in MTN',
  );
});
