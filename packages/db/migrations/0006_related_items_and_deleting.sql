-- Related items on tasks, and archiving workspaces and projects.
-- Only columns, a table and indexes are added; no existing row changes.

-- Archived workspaces and projects are hidden from My Day, Inbox, pickers
-- and default lists and search, with everything inside kept as it was.
-- Restoring clears the timestamp.
ALTER TABLE workspaces ADD COLUMN archived_at TEXT;
ALTER TABLE projects ADD COLUMN archived_at TEXT;

-- Notes a person links to a task by hand. A link is removed with either
-- side when that side is deleted permanently; archiving keeps it.
CREATE TABLE task_note_links (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (task_id, note_id)
) WITHOUT ROWID;
CREATE INDEX task_note_links_note_idx ON task_note_links(note_id);

-- Related items and permanent deletion look tasks, drafts and capture runs
-- up by their source note, and everything up by its workspace or project.
CREATE INDEX drafts_source_note_idx ON drafts(source_note_id) WHERE source_note_id IS NOT NULL;
CREATE INDEX tasks_scope_idx ON tasks(owner_user_id, workspace_id, project_id);
CREATE INDEX notes_scope_idx ON notes(owner_user_id, workspace_id, project_id);
CREATE INDEX drafts_scope_idx ON drafts(owner_user_id, workspace_id, project_id);
CREATE INDEX capture_runs_scope_idx ON capture_runs(owner_user_id, workspace_id, project_id);
