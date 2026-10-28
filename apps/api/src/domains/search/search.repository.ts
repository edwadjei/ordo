import {
  DatabaseAdapter,
  sql,
} from '../../adapters/database/database.adapter.js';
export interface SearchResult {
  id: string;
  type: 'task' | 'note' | 'project';
  title: string;
  excerpt: string;
  workspaceId: string | null;
  projectId: string | null;
}
type Row = Omit<SearchResult, 'type'> & { rank: number };
const LIMIT = 30;
const MAX_TERMS = 16;

/**
 * Turns free text into an FTS5 query: letters/digits only, each term quoted
 * (so operators and column filters in user input are plain words), all terms
 * required. The porter tokenizer stems each term, so "plan" finds "planning".
 * The result is always bound as a parameter, never spliced into SQL.
 */
export function ftsQuery(input: string) {
  const terms = input.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms
    .slice(0, MAX_TERMS)
    .map((term) => `"${term}"`)
    .join(' ');
}

export class SearchRepository {
  constructor(private readonly database: DatabaseAdapter) {}
  async search(owner: string, query: string): Promise<SearchResult[]> {
    const match = ftsQuery(query);
    if (!match) return [];
    const db = this.database.use();
    // bm25() is lower for better matches. Archived rows stay indexed but are
    // excluded here; every query is scoped to the owner.
    const [taskRows, noteRows, projectRows] = await db.batch([
      db.all<Row>(sql`
        SELECT t.id AS id, t.title AS title, substr(t.description, 1, 220) AS excerpt,
               t.workspace_id AS workspaceId, t.project_id AS projectId, bm25(tasks_fts) AS rank
          FROM tasks_fts JOIN tasks AS t ON t.rowid = tasks_fts.rowid
         WHERE tasks_fts MATCH ${match} AND t.owner_user_id = ${owner} AND t.deleted_at IS NULL
         ORDER BY rank, t.id LIMIT ${LIMIT}`),
      db.all<Row>(sql`
        SELECT n.id AS id, n.title AS title, substr(n.body, 1, 220) AS excerpt,
               n.workspace_id AS workspaceId, n.project_id AS projectId, bm25(notes_fts) AS rank
          FROM notes_fts JOIN notes AS n ON n.rowid = notes_fts.rowid
         WHERE notes_fts MATCH ${match} AND n.owner_user_id = ${owner} AND n.deleted_at IS NULL
         ORDER BY rank, n.id LIMIT ${LIMIT}`),
      db.all<Row>(sql`
        SELECT p.id AS id, p.name AS title, substr(p.description, 1, 220) AS excerpt,
               p.workspace_id AS workspaceId, p.id AS projectId, bm25(projects_fts) AS rank
          FROM projects_fts JOIN projects AS p ON p.rowid = projects_fts.rowid
         WHERE projects_fts MATCH ${match} AND p.owner_user_id = ${owner}
         ORDER BY rank, p.id LIMIT ${LIMIT}`),
    ]);
    return [
      ...taskRows.map((row) => ({ ...row, type: 'task' as const })),
      ...noteRows.map((row) => ({ ...row, type: 'note' as const })),
      ...projectRows.map((row) => ({ ...row, type: 'project' as const })),
    ]
      .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
      .slice(0, LIMIT)
      .map(({ rank: _rank, ...row }) => row);
  }
}
