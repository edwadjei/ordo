import type { HttpRoutes } from '../../platform/http/http.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { TasksService } from '../tasks/tasks.service.js';
import type { NotesService } from '../notes/notes.service.js';
import { HomeService } from './home.service.js';
import { registerHomeController } from './home.controller.js';

export function createHomeModule(
  workspaces: WorkspacesService,
  tasks: TasksService,
  notes: NotesService,
) {
  const service = new HomeService(workspaces, tasks, notes);
  return {
    service,
    register: (routes: HttpRoutes) => registerHomeController(routes, service),
  };
}
