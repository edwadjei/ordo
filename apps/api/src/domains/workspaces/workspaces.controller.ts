import { z } from 'zod';
import type {
  HttpReply,
  HttpRequest,
  HttpRoutes,
} from '../../platform/http/http.js';
import {
  agentProjectPatch,
  permanentDeleteInput,
  workspaceInput,
  workspacePatch,
  projectInput,
  projectPatch,
} from '@ordo/core';
import { fail } from '../../platform/http/api-failure.js';
import { actorId, entityId } from '../../platform/http/request-context.js';
import type { WorkspacesService } from './workspaces.service.js';

const idempotencyKey = z.string().min(1).max(128).optional();

/** Who is creating (the access key, if any) and the optional retry key. */
const creating = (request: HttpRequest) => ({
  createdByTokenId: request.agent?.tokenId ?? null,
  idempotencyKey: idempotencyKey.parse(request.header('idempotency-key')),
});

/** 201 for a new item, 200 for the existing one returned instead. */
function answer<T>(reply: HttpReply, item: T, existing: boolean) {
  reply.status(existing ? 200 : 201);
  return { ...item, existing };
}

/** An access key may change a project's name, description and aliases only. */
function projectPatchFor(request: HttpRequest) {
  if (!request.agent) return projectPatch.parse(request.body);
  const body = request.body as Record<string, unknown> | null;
  if (
    body &&
    typeof body === 'object' &&
    ('archived' in body || 'favorite' in body)
  )
    fail(
      403,
      'AGENT_NOT_ALLOWED',
      "Access keys can change a project's name, description and aliases only.",
    );
  return agentProjectPatch.parse(request.body);
}

export function registerWorkspacesController(
  routes: HttpRoutes,
  service: WorkspacesService,
) {
  routes.get('/v1/workspaces', async (request) =>
    service.listWorkspaces(actorId(request)),
  );
  routes.get('/v1/workspaces/:id', async (request) =>
    service.getWorkspace(actorId(request), entityId(request)),
  );
  routes.post('/v1/workspaces', async (request, reply) => {
    const { workspace, existing } = await service.createWorkspace(
      actorId(request),
      workspaceInput.parse(request.body),
      creating(request),
    );
    return answer(reply, workspace, existing);
  });
  routes.patch('/v1/workspaces/:id', async (request) =>
    service.updateWorkspace(
      actorId(request),
      entityId(request),
      workspacePatch.parse(request.body),
    ),
  );
  routes.get('/v1/workspaces/:id/delete-preview', async (request) =>
    service.deletePreview(actorId(request), 'workspace', entityId(request)),
  );
  routes.delete('/v1/workspaces/:id', async (request) =>
    service.deletePermanently(
      actorId(request),
      'workspace',
      entityId(request),
      permanentDeleteInput.parse(request.body),
    ),
  );
  routes.get('/v1/workspaces/:id/projects', async (request) =>
    service.listProjects(actorId(request), entityId(request)),
  );
  routes.post('/v1/workspaces/:id/projects', async (request, reply) => {
    const { project, existing } = await service.createProject(
      actorId(request),
      projectInput.parse({
        ...(request.body as object),
        workspaceId: entityId(request),
      }),
      creating(request),
    );
    return answer(reply, project, existing);
  });
  routes.post('/v1/projects', async (request, reply) => {
    const { project, existing } = await service.createProject(
      actorId(request),
      projectInput.parse(request.body),
      creating(request),
    );
    return answer(reply, project, existing);
  });
  routes.get('/v1/projects/:id', async (request) =>
    service.getProject(actorId(request), entityId(request)),
  );
  routes.get('/v1/projects/:id/delete-preview', async (request) =>
    service.deletePreview(actorId(request), 'project', entityId(request)),
  );
  routes.delete('/v1/projects/:id', async (request) =>
    service.deletePermanently(
      actorId(request),
      'project',
      entityId(request),
      permanentDeleteInput.parse(request.body),
    ),
  );
  routes.patch('/v1/projects/:id', async (request) =>
    service.updateProject(
      actorId(request),
      entityId(request),
      projectPatchFor(request),
    ),
  );
}
