import type { HttpRoutes } from '../../platform/http/http.js';
import {
  permanentDeleteInput,
  workspaceInput,
  workspacePatch,
  projectInput,
  projectPatch,
} from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import { created } from '../../platform/http/response.js';
import type { WorkspacesService } from './workspaces.service.js';

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
  routes.post('/v1/workspaces', async (request, reply) =>
    created(
      reply,
      await service.createWorkspace(
        actorId(request),
        workspaceInput.parse(request.body),
      ),
    ),
  );
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
  routes.post('/v1/workspaces/:id/projects', async (request, reply) =>
    created(
      reply,
      await service.createProject(
        actorId(request),
        projectInput.parse({
          ...(request.body as object),
          workspaceId: entityId(request),
        }),
      ),
    ),
  );
  routes.post('/v1/projects', async (request, reply) =>
    created(
      reply,
      await service.createProject(
        actorId(request),
        projectInput.parse(request.body),
      ),
    ),
  );
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
      projectPatch.parse(request.body),
    ),
  );
}
