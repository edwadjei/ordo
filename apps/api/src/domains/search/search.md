# Search

Authenticated full-text search spans the owner's active tasks, notes and projects. `GET /v1/search?q=...` accepts 1–200 trimmed characters and returns at most 30 ranked results. Each result includes its type, title, short plain-text excerpt and workspace/project context.

The repository searches SQLite FTS5 tables created by migration `0001_initial.sql`: `tasks_fts` (title, description, responsible person and waiting-on names), `notes_fts` (title, body) and `projects_fts` (name, description). They are external-content tables keyed by each row's `rowid` and kept current by insert, update and delete triggers, so nothing in the application writes them. The `porter unicode61` tokenizer stems English words ("plan" finds "planning") and folds case.

User text is turned into words (letters and digits only), each quoted, at most 16, all required, and bound as a parameter to `MATCH`; FTS operators, column filters and quotes in the input are plain words, never query syntax or SQL. Input with no words returns no results without a query. The three queries run in one `batch()`, each filtered by `owner_user_id` and, for tasks and notes, `deleted_at IS NULL`; results are ordered by `bm25()` (lower is better) with stable ID ties and capped at 30. Mixing scores across tables is a ranking heuristic, as it was with PostgreSQL. This is token search, not substring, fuzzy or semantic search. Project search follows the current project model, which has no archive field.

Controller validates input; service owns the use case; repository owns SQL behind the database adapter. Excerpts are plain text and must be rendered as text, never HTML.

## Operations

If row IDs ever change outside normal writes (for example a `VACUUM` on a table without an integer primary key), rebuild an index with `INSERT INTO tasks_fts(tasks_fts) VALUES ('rebuild')` (likewise `notes_fts`, `projects_fts`). `test/search-fts.test.ts` covers ranking, people names, reindexing on edit, archived rows, the cap and hostile input.
