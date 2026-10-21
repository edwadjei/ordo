import type { User } from '@ordo/core';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { TasksService } from '../tasks/tasks.service.js';
import type { NotesService } from '../notes/notes.service.js';

export class HomeService {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly tasks: TasksService,
    private readonly notes: NotesService,
  ) {}

  async snapshot(user: User) {
    const [workspaces, projects, tasks, notes] = await Promise.all([
      this.workspaces.listWorkspaces(user.id),
      this.workspaces.listProjects(user.id),
      this.tasks.list(user.id),
      this.notes.list(user.id),
    ]);
    return { user, workspaces, projects, tasks, notes };
  }
}
