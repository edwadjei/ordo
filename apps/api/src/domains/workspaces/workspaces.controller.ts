import type { FastifyInstance } from 'fastify';
import {
  workspaceInput,
  workspacePatch,
  projectInput,
  projectPatch,
} from '@ordo/core';
import { actorId, entityId } from '../../platform/http/request-context.js';
import type { WorkspacesService } from './workspaces.service.js';

export function registerWorkspacesController(
  app: FastifyInstance,
  service: WorkspacesService,
) {
  app.get('/v1/workspaces', async (request) =>
    service.listWorkspaces(actorId(request)),
  );
  app.get('/v1/workspaces/:id', async (request) =>
    service.getWorkspace(actorId(request), entityId(request)),
  );
  app.post('/v1/workspaces', async (request, reply) =>
    reply
      .code(201)
      .send(
        await service.createWorkspace(
          actorId(request),
          workspaceInput.parse(request.body),
        ),
      ),
  );
  app.patch('/v1/workspaces/:id', async (request) =>
    service.updateWorkspace(
      actorId(request),
      entityId(request),
      workspacePatch.parse(request.body),
    ),
  );
  app.get('/v1/workspaces/:id/projects', async (request) =>
    service.listProjects(actorId(request), entityId(request)),
  );
  app.post('/v1/workspaces/:id/projects', async (request, reply) =>
    reply.code(201).send(
      await service.createProject(
        actorId(request),
        projectInput.parse({
          ...(request.body as object),
          workspaceId: entityId(request),
        }),
      ),
    ),
  );
  app.post('/v1/projects', async (request, reply) =>
    reply
      .code(201)
      .send(
        await service.createProject(
          actorId(request),
          projectInput.parse(request.body),
        ),
      ),
  );
  app.get('/v1/projects/:id', async (request) =>
    service.getProject(actorId(request), entityId(request)),
  );
  app.patch('/v1/projects/:id', async (request) =>
    service.updateProject(
      actorId(request),
      entityId(request),
      projectPatch.parse(request.body),
    ),
  );
}
