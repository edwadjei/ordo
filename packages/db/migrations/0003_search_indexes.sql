CREATE INDEX tasks_search_idx ON tasks USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) WHERE deleted_at IS NULL;
CREATE INDEX notes_search_idx ON notes USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) WHERE deleted_at IS NULL;
CREATE INDEX projects_search_idx ON projects USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));
