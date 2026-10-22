import {
  DatabaseAdapter,
  and,
  eq,
  isNull,
  sql,
  desc,
  tables,
} from '../../adapters/database/database.adapter.js';
export interface SearchResult {
  id: string;
  type: 'task' | 'note' | 'project';
  title: string;
  excerpt: string;
  workspaceId: string | null;
  projectId: string | null;
}
export class SearchRepository {
  constructor(private readonly database: DatabaseAdapter) {}
  async search(owner: string, query: string): Promise<SearchResult[]> {
    const { tasks, notes, projects } = tables;
    const term = sql`plainto_tsquery('english', ${query})`;
    // Must match the tasks_search_idx expression in migration 0005.
    const taskVector = sql`to_tsvector('english', coalesce(${tasks.title}, '') || ' ' || coalesce(${tasks.description}, '') || ' ' || coalesce(${tasks.responsiblePerson}, '') || ' ' || coalesce(${tasks.waitingOn}, ''))`;
    const noteVector = sql`to_tsvector('english', coalesce(${notes.title}, '') || ' ' || coalesce(${notes.body}, ''))`;
    const projectVector = sql`to_tsvector('english', coalesce(${projects.name}, '') || ' ' || coalesce(${projects.description}, ''))`;
    const [taskRows, noteRows, projectRows] = await Promise.all([
      this.database
        .use()
        .select({
          id: tasks.id,
          title: tasks.title,
          excerpt: sql<string>`left(${tasks.description}, 220)`,
          workspaceId: tasks.workspaceId,
          projectId: tasks.projectId,
          rank: sql<number>`ts_rank(${taskVector}, ${term})`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.ownerUserId, owner),
            isNull(tasks.deletedAt),
            sql`${taskVector} @@ ${term}`,
          ),
        )
        .orderBy(desc(sql`ts_rank(${taskVector}, ${term})`), tasks.id)
        .limit(30),
      this.database
        .use()
        .select({
          id: notes.id,
          title: notes.title,
          excerpt: sql<string>`left(${notes.body}, 220)`,
          workspaceId: notes.workspaceId,
          projectId: notes.projectId,
          rank: sql<number>`ts_rank(${noteVector}, ${term})`,
        })
        .from(notes)
        .where(
          and(
            eq(notes.ownerUserId, owner),
            isNull(notes.deletedAt),
            sql`${noteVector} @@ ${term}`,
          ),
        )
        .orderBy(desc(sql`ts_rank(${noteVector}, ${term})`), notes.id)
        .limit(30),
      this.database
        .use()
        .select({
          id: projects.id,
          title: projects.name,
          excerpt: sql<string>`left(${projects.description}, 220)`,
          workspaceId: projects.workspaceId,
          rank: sql<number>`ts_rank(${projectVector}, ${term})`,
        })
        .from(projects)
        .where(
          and(
            eq(projects.ownerUserId, owner),
            sql`${projectVector} @@ ${term}`,
          ),
        )
        .orderBy(desc(sql`ts_rank(${projectVector}, ${term})`), projects.id)
        .limit(30),
    ]);
    return [
      ...taskRows.map((row) => ({ ...row, type: 'task' as const })),
      ...noteRows.map((row) => ({ ...row, type: 'note' as const })),
      ...projectRows.map((row) => ({
        ...row,
        type: 'project' as const,
        projectId: row.id,
      })),
    ]
      .sort(
        (a, b) => Number(b.rank) - Number(a.rank) || a.id.localeCompare(b.id),
      )
      .slice(0, 30)
      .map(({ rank, ...row }) => row);
  }
}
