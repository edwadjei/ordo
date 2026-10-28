import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  tables,
  sql,
  type NewWorkspace,
  type NewProject,
} from '../../adapters/database/database.adapter.js';

const { workspaces, projects } = tables;

export class WorkspacesRepository {
  constructor(private readonly database: DatabaseAdapter) {}

  listWorkspaces(owner: string) {
    return this.database
      .use()
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, owner))
      .orderBy(asc(workspaces.createdAt), asc(workspaces.id));
  }

  async findWorkspace(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, id), eq(workspaces.ownerUserId, owner)));
    return row;
  }

  async insertWorkspace(input: NewWorkspace) {
    const [row] = await this.database
      .use()
      .insert(workspaces)
      .values(input)
      .returning();
    return row;
  }

  /** Conditional on the revision the caller read; `undefined` if it changed. */
  async updateWorkspace(
    owner: string,
    id: string,
    expectedRevision: number,
    patch: Partial<NewWorkspace>,
  ) {
    const [row] = await this.database
      .use()
      .update(workspaces)
      .set({ ...patch, revision: sql`${workspaces.revision} + 1` })
      .where(
        and(
          eq(workspaces.id, id),
          eq(workspaces.ownerUserId, owner),
          eq(workspaces.revision, expectedRevision),
        ),
      )
      .returning();
    return row;
  }

  listProjects(owner: string, workspaceId?: string) {
    return this.database
      .use()
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.ownerUserId, owner),
          workspaceId ? eq(projects.workspaceId, workspaceId) : undefined,
        ),
      )
      .orderBy(asc(projects.name), asc(projects.id));
  }

  async findProject(owner: string, id: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerUserId, owner)));
    return row;
  }

  async insertProject(input: NewProject) {
    const [row] = await this.database
      .use()
      .insert(projects)
      .values(input)
      .returning();
    return row;
  }

  /** Conditional on the revision the caller read; `undefined` if it changed. */
  async updateProject(
    owner: string,
    id: string,
    expectedRevision: number,
    patch: Partial<NewProject>,
  ) {
    const [row] = await this.database
      .use()
      .update(projects)
      .set({ ...patch, revision: sql`${projects.revision} + 1` })
      .where(
        and(
          eq(projects.id, id),
          eq(projects.ownerUserId, owner),
          eq(projects.revision, expectedRevision),
        ),
      )
      .returning();
    return row;
  }
}
