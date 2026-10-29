import { z } from 'zod';
import {
  agentProjectPatch,
  noteInput,
  priorities,
  projectInput,
  statuses,
  taskInput,
  taskPatch,
  workspaceInput,
  type AgentScope,
  type User,
} from '@ordo/core';
import { newId } from '../../platform/identifiers/new-id.js';
import { localToday } from '../../platform/time/local-today.js';
import type { HomeService } from '../home/home.service.js';
import type { NotesService } from '../notes/notes.service.js';
import type { SearchService } from '../search/search.service.js';
import type { TasksService } from '../tasks/tasks.service.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';

export interface ToolServices {
  tasks: TasksService;
  notes: NotesService;
  workspaces: WorkspacesService;
  search: SearchService;
  home: HomeService;
}

export interface ToolContext {
  user: User;
  tokenId: string;
}

/** What a tool did, for the activity log. */
export interface ToolOutcome {
  result: unknown;
  /** The activity action, when not `mcp.<tool>`. */
  action?: string;
  entityType: string | null;
  entityId: string | null;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  scope: AgentScope;
  inputSchema: Record<string, unknown>;
  run(
    args: Record<string, unknown>,
    context: ToolContext,
    services: ToolServices,
  ): Promise<ToolOutcome>;
}

type TaskLike = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
  dueTime: string | null;
  followUpDate: string | null;
  followUpTime: string | null;
  responsiblePerson: string | null;
  waitingOn: string | null;
  workspaceId: string | null;
  projectId: string | null;
  parentId: string | null;
  origin?: string;
  revision: number;
};
/** The fields an assistant needs, without descriptions: compact JSON. */
const compactTask = (task: TaskLike) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate,
  dueTime: task.dueTime,
  followUpDate: task.followUpDate,
  followUpTime: task.followUpTime,
  responsiblePerson: task.responsiblePerson,
  waitingOn: task.waitingOn,
  workspaceId: task.workspaceId,
  projectId: task.projectId,
  parentId: task.parentId,
  origin: task.origin ?? 'manual',
  revision: task.revision,
});

const uuid = { type: 'string', format: 'uuid' };
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const time = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' };
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: 'object', properties, required, additionalProperties: false });
const taskFields = {
  title: { type: 'string', minLength: 1, maxLength: 200 },
  description: { type: 'string', maxLength: 20000 },
  status: { type: 'string', enum: [...statuses] },
  priority: nullable({ type: 'string', enum: [...priorities] }),
  dueDate: nullable(date),
  dueTime: nullable(time),
  followUpDate: nullable(date),
  followUpTime: nullable(time),
  responsiblePerson: nullable({ type: 'string', maxLength: 80 }),
  waitingOn: nullable({ type: 'string', maxLength: 80 }),
  workspaceId: nullable(uuid),
  projectId: nullable(uuid),
};

const byId = z.object({ id: z.uuid() }).strict();
const retryKey = { type: 'string', minLength: 1, maxLength: 128 };
const projectFields = {
  name: { type: 'string', minLength: 1, maxLength: 200 },
  description: { type: 'string', maxLength: 5000 },
  aliases: {
    type: 'array',
    items: { type: 'string', minLength: 1, maxLength: 60 },
    maxItems: 10,
  },
};
/** The fields an assistant needs about a project. */
const compactProject = (project: {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  aliases: string[];
  origin: string;
  revision: number;
}) => ({
  id: project.id,
  name: project.name,
  description: project.description,
  workspaceId: project.workspaceId,
  aliases: project.aliases,
  origin: project.origin,
  revision: project.revision,
});
const listTasksInput = z
  .object({
    workspaceId: z.uuid().optional(),
    projectId: z.uuid().optional(),
    status: z.enum(statuses).optional(),
    dueBefore: z.iso.date().optional(),
    dueAfter: z.iso.date().optional(),
    waiting: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

/** An update or completion uses the current revision unless one is given. */
async function currentRevision(
  services: ToolServices,
  context: ToolContext,
  id: string,
  given?: number,
) {
  return given ?? (await services.tasks.get(context.user.id, id)).revision;
}

export const tools: Tool[] = [
  {
    name: 'get_my_day',
    title: 'My Day',
    description:
      "Today's work: overdue tasks, tasks due today, follow-ups due, and what is waiting on someone. Dates are in the owner's timezone.",
    scope: 'read',
    inputSchema: object({}),
    async run(args, context, { home }) {
      z.object({}).strict().parse(args);
      const { date } = localToday(context.user.timezone);
      const snapshot = await home.snapshot(context.user);
      const open = snapshot.tasks.filter((task) => task.status !== 'done');
      const cap = (list: TaskLike[]) => list.slice(0, 50).map(compactTask);
      return {
        result: {
          today: date,
          overdue: cap(open.filter((t) => t.dueDate && t.dueDate < date)),
          dueToday: cap(open.filter((t) => t.dueDate === date)),
          followUps: cap(
            open.filter((t) => t.followUpDate && t.followUpDate <= date),
          ),
          waiting: cap(open.filter((t) => t.status === 'waiting')),
        },
        entityType: null,
        entityId: null,
      };
    },
  },
  {
    name: 'search',
    title: 'Search',
    description: 'Search tasks, notes and projects by words.',
    scope: 'read',
    inputSchema: object(
      { query: { type: 'string', minLength: 1, maxLength: 200 } },
      ['query'],
    ),
    async run(args, context, { search }) {
      const { query } = z
        .object({ query: z.string().trim().min(1).max(200) })
        .strict()
        .parse(args);
      return {
        result: { results: await search.search(context.user.id, query) },
        entityType: null,
        entityId: null,
      };
    },
  },
  {
    name: 'list_workspaces',
    title: 'List workspaces',
    description: "The owner's workspaces (archived ones are left out).",
    scope: 'read',
    inputSchema: object({}),
    async run(args, context, { workspaces }) {
      z.object({}).strict().parse(args);
      const list = await workspaces.listWorkspaces(context.user.id);
      return {
        result: {
          workspaces: list
            .filter((w) => !w.archivedAt)
            .map(({ id, name }) => ({ id, name })),
        },
        entityType: 'workspace',
        entityId: null,
      };
    },
  },
  {
    name: 'list_projects',
    title: 'List projects',
    description:
      'Projects, optionally of one workspace, with their aliases (archived ones are left out).',
    scope: 'read',
    inputSchema: object({ workspaceId: uuid }),
    async run(args, context, { workspaces }) {
      const { workspaceId } = z
        .object({ workspaceId: z.uuid().optional() })
        .strict()
        .parse(args);
      const list = await workspaces.listProjects(context.user.id, workspaceId);
      return {
        result: {
          projects: list
            .filter((p) => !p.archivedAt)
            .map(({ id, name, workspaceId, aliases, favorite }) => ({
              id,
              name,
              workspaceId,
              aliases,
              favorite,
            })),
        },
        entityType: 'project',
        entityId: null,
      };
    },
  },
  {
    name: 'create_workspace',
    title: 'Create a workspace',
    description:
      'Creates a workspace. If an active workspace already has this name (ignoring case), that one is returned with existing: true instead. It is marked as made by this assistant. Send the same idempotencyKey to retry safely.',
    scope: 'write',
    inputSchema: object(
      {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        idempotencyKey: retryKey,
      },
      ['name'],
    ),
    async run(args, context, { workspaces }) {
      const { idempotencyKey, ...input } = z
        .object({ idempotencyKey: z.string().min(1).max(128).optional() })
        .passthrough()
        .parse(args);
      const { workspace, existing } = await workspaces.createWorkspace(
        context.user.id,
        workspaceInput.parse(input),
        { createdByTokenId: context.tokenId, idempotencyKey },
      );
      return {
        result: {
          id: workspace.id,
          name: workspace.name,
          color: workspace.color,
          origin: workspace.origin,
          existing,
        },
        // Returning an existing one is not a create.
        ...(existing ? { action: 'workspace.found' } : {}),
        entityType: 'workspace',
        entityId: workspace.id,
      };
    },
  },
  {
    name: 'create_project',
    title: 'Create a project',
    description:
      'Creates a project in a workspace. A description and aliases (other names it goes by) help route captured notes and tasks to it. If an active project in that workspace already has this name (ignoring case), that one is returned with existing: true instead. It is marked as made by this assistant. Send the same idempotencyKey to retry safely.',
    scope: 'write',
    inputSchema: object(
      { workspaceId: uuid, ...projectFields, idempotencyKey: retryKey },
      ['workspaceId', 'name'],
    ),
    async run(args, context, { workspaces }) {
      const { idempotencyKey, ...input } = z
        .object({ idempotencyKey: z.string().min(1).max(128).optional() })
        .passthrough()
        .parse(args);
      const { project, existing } = await workspaces.createProject(
        context.user.id,
        // Favourites stay with the owner.
        {
          ...projectInput.omit({ favorite: true }).parse(input),
          favorite: false,
        },
        { createdByTokenId: context.tokenId, idempotencyKey },
      );
      return {
        result: { ...compactProject(project), existing },
        ...(existing ? { action: 'project.found' } : {}),
        entityType: 'project',
        entityId: project.id,
      };
    },
  },
  {
    name: 'update_project',
    title: 'Update a project',
    description:
      "Changes a project's name, description or aliases (aliases replace the whole list). Omitted fields stay as they are. Without expectedRevision the current revision is used.",
    scope: 'write',
    inputSchema: object(
      {
        projectId: uuid,
        ...projectFields,
        expectedRevision: { type: 'integer', minimum: 1 },
      },
      ['projectId'],
    ),
    async run(args, context, { workspaces }) {
      const { projectId, expectedRevision, ...patch } = z
        .object({
          projectId: z.uuid(),
          expectedRevision: z.number().int().positive().optional(),
        })
        .passthrough()
        .parse(args);
      const saved = await workspaces.updateProject(
        context.user.id,
        projectId,
        agentProjectPatch.parse({
          ...patch,
          expectedRevision:
            expectedRevision ??
            (await workspaces.getProject(context.user.id, projectId)).revision,
        }),
      );
      return {
        result: compactProject(saved),
        entityType: 'project',
        entityId: projectId,
      };
    },
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description:
      'Active tasks, filtered by workspace, project, status, due date (dueBefore and dueAfter, inclusive) or waiting. At most 200; 50 by default.',
    scope: 'read',
    inputSchema: object({
      workspaceId: uuid,
      projectId: uuid,
      status: { type: 'string', enum: [...statuses] },
      dueBefore: date,
      dueAfter: date,
      waiting: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    }),
    async run(args, context, { tasks }) {
      const filter = listTasksInput.parse(args);
      const list = (await tasks.list(context.user.id)).filter(
        (task) =>
          (!filter.workspaceId || task.workspaceId === filter.workspaceId) &&
          (!filter.projectId || task.projectId === filter.projectId) &&
          (!filter.status || task.status === filter.status) &&
          (!filter.dueBefore ||
            (task.dueDate !== null && task.dueDate <= filter.dueBefore)) &&
          (!filter.dueAfter ||
            (task.dueDate !== null && task.dueDate >= filter.dueAfter)) &&
          (filter.waiting === undefined ||
            (task.status === 'waiting') === filter.waiting),
      );
      return {
        result: {
          tasks: list.slice(0, filter.limit ?? 50).map(compactTask),
          total: list.length,
        },
        entityType: 'task',
        entityId: null,
      };
    },
  },
  {
    name: 'get_task',
    title: 'Get a task',
    description: 'One task with its description.',
    scope: 'read',
    inputSchema: object({ id: uuid }, ['id']),
    async run(args, context, { tasks }) {
      const { id } = byId.parse(args);
      return {
        result: await tasks.get(context.user.id, id),
        entityType: 'task',
        entityId: id,
      };
    },
  },
  {
    name: 'create_task',
    title: 'Create a task',
    description:
      'Creates a task, in the Inbox unless a workspace (and project) is given. It is marked as made by this assistant. Send the same idempotencyKey to retry safely.',
    scope: 'write',
    inputSchema: object(
      {
        ...taskFields,
        parentId: nullable(uuid),
        idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 },
      },
      ['title'],
    ),
    async run(args, context, { tasks }) {
      const { idempotencyKey, ...input } = z
        .object({ idempotencyKey: z.string().min(1).max(128).optional() })
        .passthrough()
        .parse(args);
      const result = await tasks.create(
        context.user.id,
        taskInput.parse(input),
        idempotencyKey ?? newId(),
        context.tokenId,
      );
      return {
        result: { ...result.task, created: result.created },
        entityType: 'task',
        entityId: result.task.id,
      };
    },
  },
  {
    name: 'update_task',
    title: 'Update a task',
    description:
      "Changes a task's title, description, status, priority, dates, times, people or destination. Omitted fields stay as they are. Without expectedRevision the current revision is used.",
    scope: 'write',
    inputSchema: object(
      {
        id: uuid,
        expectedRevision: { type: 'integer', minimum: 1 },
        ...taskFields,
      },
      ['id'],
    ),
    async run(args, context, services) {
      const { id, expectedRevision, ...patch } = z
        .object({
          id: z.uuid(),
          expectedRevision: z.number().int().positive().optional(),
        })
        .passthrough()
        .parse(args);
      const saved = await services.tasks.update(
        context.user.id,
        id,
        taskPatch.parse({
          ...patch,
          expectedRevision: await currentRevision(
            services,
            context,
            id,
            expectedRevision,
          ),
        }),
      );
      return { result: saved, entityType: 'task', entityId: id };
    },
  },
  {
    name: 'complete_task',
    title: 'Complete a task',
    description: 'Marks a task done.',
    scope: 'write',
    inputSchema: object(
      { id: uuid, expectedRevision: { type: 'integer', minimum: 1 } },
      ['id'],
    ),
    async run(args, context, services) {
      const { id, expectedRevision } = z
        .object({
          id: z.uuid(),
          expectedRevision: z.number().int().positive().optional(),
        })
        .strict()
        .parse(args);
      const saved = await services.tasks.update(context.user.id, id, {
        status: 'done',
        expectedRevision: await currentRevision(
          services,
          context,
          id,
          expectedRevision,
        ),
      });
      return { result: saved, entityType: 'task', entityId: id };
    },
  },
  {
    name: 'create_note',
    title: 'Create a note',
    description:
      'Creates a note (Markdown body), in the Inbox unless a workspace (and project) is given. It is marked as made by this assistant.',
    scope: 'write',
    inputSchema: object(
      {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        body: { type: 'string', maxLength: 100000 },
        source: {
          type: 'string',
          enum: ['manual', 'recording', 'email', 'transcript'],
        },
        workspaceId: nullable(uuid),
        projectId: nullable(uuid),
      },
      ['title'],
    ),
    async run(args, context, { notes }) {
      const note = await notes.create(
        context.user.id,
        noteInput.parse(args),
        context.tokenId,
      );
      return { result: note, entityType: 'note', entityId: note.id };
    },
  },
  {
    name: 'get_note',
    title: 'Get a note',
    description: 'One note with its whole body.',
    scope: 'read',
    inputSchema: object({ id: uuid }, ['id']),
    async run(args, context, { notes }) {
      const { id } = byId.parse(args);
      return {
        result: await notes.get(context.user.id, id),
        entityType: 'note',
        entityId: id,
      };
    },
  },
];
