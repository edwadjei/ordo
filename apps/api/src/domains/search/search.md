# Search

Authenticated PostgreSQL full-text search spans the owner's active tasks, notes and projects. `GET /v1/search?q=...` accepts 1–200 trimmed characters and returns at most 30 ranked results. Each result includes its type, title, short plain-text excerpt and workspace/project context.

The repository uses parameterized `plainto_tsquery('english', ...)`, English stemming, and `ts_rank` with stable ID ties. Query text is never interpreted as SQL or raw tsquery syntax. Tasks and notes exclude archived rows. Migration `0003_search_indexes.sql` adds matching GIN expression indexes; `0005_task_times_people.sql` rebuilds the task index so task search also matches the plain-text `responsiblePerson` and `waitingOn` names. The repository's task vector must stay identical to that index expression. English token search is intentional; this is not substring, fuzzy or semantic search. Project search follows the current project model, which has no archive field.

Controller validates input; service owns the use case; repository owns SQL behind the database adapter. Every branch filters `owner_user_id` before returning content. Excerpts are plain text and must be rendered as text, never HTML.
