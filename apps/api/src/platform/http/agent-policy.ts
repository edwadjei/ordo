import type { AgentScope } from '@ordo/core';

/**
 * What an agent access token may do, route by route. Anything not listed is
 * refused: settings and keys, sign-in, changing, archiving or deleting
 * workspaces, archiving or deleting projects, and every other kind of
 * delete. A token's project changes are limited to name, description and
 * aliases by the controller. `DELETE /v1/tasks/:id` and `/v1/notes/:id`
 * archive (they are soft), so they are allowed with `write`.
 */
interface Rule {
  method: string;
  path: RegExp;
  scope: AgentScope;
  action: string;
  entityType: string | null;
}

const id = '[0-9a-f-]{36}';
const rule = (
  method: string,
  path: string,
  scope: AgentScope,
  action: string,
  entityType: string | null,
): Rule => ({
  method,
  path: new RegExp(`^${path.replaceAll(':id', id)}$`),
  scope,
  action,
  entityType,
});

const rules: Rule[] = [
  rule('GET', '/v1/home', 'read', 'home.read', null),
  rule('GET', '/v1/search', 'read', 'search', null),
  rule('GET', '/v1/workspaces', 'read', 'workspace.list', 'workspace'),
  rule('GET', '/v1/workspaces/:id', 'read', 'workspace.read', 'workspace'),
  rule(
    'GET',
    '/v1/workspaces/:id/projects',
    'read',
    'project.list',
    'workspace',
  ),
  rule('GET', '/v1/projects/:id', 'read', 'project.read', 'project'),
  rule('GET', '/v1/tasks', 'read', 'task.list', 'task'),
  rule('GET', '/v1/tasks/:id', 'read', 'task.read', 'task'),
  rule('GET', '/v1/tasks/:id/related', 'read', 'task.related', 'task'),
  rule('GET', '/v1/notes', 'read', 'note.list', 'note'),
  rule('GET', '/v1/notes/:id', 'read', 'note.read', 'note'),
  rule('GET', '/v1/notes/:id/capture-runs', 'read', 'capture.list', 'note'),
  rule('GET', '/v1/capture-runs/:id', 'read', 'capture.read', 'capture_run'),
  rule('GET', '/v1/drafts', 'read', 'draft.list', 'draft'),
  rule('GET', '/v1/drafts/:id', 'read', 'draft.read', 'draft'),
  rule('POST', '/v1/workspaces', 'write', 'workspace.create', 'workspace'),
  rule(
    'POST',
    '/v1/workspaces/:id/projects',
    'write',
    'project.create',
    'project',
  ),
  rule('POST', '/v1/projects', 'write', 'project.create', 'project'),
  rule('PATCH', '/v1/projects/:id', 'write', 'project.update', 'project'),
  rule('POST', '/v1/tasks', 'write', 'task.create', 'task'),
  rule('PATCH', '/v1/tasks/:id', 'write', 'task.update', 'task'),
  rule('DELETE', '/v1/tasks/:id', 'write', 'task.archive', 'task'),
  rule('POST', '/v1/notes', 'write', 'note.create', 'note'),
  rule('PATCH', '/v1/notes/:id', 'write', 'note.update', 'note'),
  rule('DELETE', '/v1/notes/:id', 'write', 'note.archive', 'note'),
  rule(
    'POST',
    '/v1/capture-runs/:id/save',
    'write',
    'capture.save',
    'capture_run',
  ),
  // MCP checks each tool's scope itself.
  rule('POST', '/v1/mcp', 'read', 'mcp', null),
  rule('GET', '/v1/mcp', 'read', 'mcp', null),
  rule('DELETE', '/v1/mcp', 'read', 'mcp', null),
];

/** The rule for this request, or undefined when tokens may not use it. */
export function agentRule(method: string, path: string) {
  return rules.find((r) => r.method === method && r.path.test(path));
}
