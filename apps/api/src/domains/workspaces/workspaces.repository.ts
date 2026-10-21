import {
  DatabaseAdapter,
  and,
  asc,
  eq,
  tables,
  type TransactionContext,
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
      .orderBy(asc(workspaces.createdAt));
  }

  async findWorkspace(
    owner: string,
    id: string,
    transaction?: TransactionContext,
  ) {
    const [row] = await this.database
      .use(transaction)
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

  async updateWorkspace(
    owner: string,
    id: string,
    patch: Partial<NewWorkspace>,
    transaction: TransactionContext,
  ) {
    const [row] = await this.database
      .use(transaction)
      .update(workspaces)
      .set(patch)
      .where(and(eq(workspaces.id, id), eq(workspaces.ownerUserId, owner)))
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
      .orderBy(asc(projects.name));
  }

  async findProject(
    owner: string,
    id: string,
    transaction?: TransactionContext,
  ) {
    const [row] = await this.database
      .use(transaction)
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

  async updateProject(
    owner: string,
    id: string,
    patch: Partial<NewProject>,
    transaction: TransactionContext,
  ) {
    const [row] = await this.database
      .use(transaction)
      .update(projects)
      .set(patch)
      .where(and(eq(projects.id, id), eq(projects.ownerUserId, owner)))
      .returning();
    return row;
  }
}
