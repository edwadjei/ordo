-- Ordo on Cloudflare D1 (SQLite). Applied with `wrangler d1 migrations apply`;
-- the Worker never runs migrations. IDs are text UUIDs; timestamps are ISO 8601
-- UTC text (`YYYY-MM-DDTHH:MM:SS.sssZ`) so they compare as text; dates are
-- `YYYY-MM-DD`; times are `HH:MM`; booleans are 0/1.

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
  phone TEXT UNIQUE,
  email_verified_at TEXT,
  phone_verified_at TEXT,
  demo_loaded INTEGER NOT NULL DEFAULT 0 CHECK (demo_loaded IN (0, 1)),
  -- Random per-request claim written when the fictional fixtures are loaded.
  demo_claim TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, owner_user_id)
);
CREATE INDEX workspaces_owner_idx ON workspaces(owner_user_id, created_at);

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES workspaces(id, owner_user_id),
  UNIQUE (id, workspace_id, owner_user_id)
);
CREATE INDEX projects_owner_idx ON projects(owner_user_id, workspace_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT,
  project_id TEXT,
  parent_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'waiting', 'done')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  due_date TEXT CHECK (due_date IS NULL OR date(due_date) IS due_date),
  due_time TEXT CHECK (due_time IS NULL OR (due_time GLOB '[0-2][0-9]:[0-5][0-9]' AND due_time <= '23:59')),
  follow_up_date TEXT CHECK (follow_up_date IS NULL OR date(follow_up_date) IS follow_up_date),
  follow_up_time TEXT CHECK (follow_up_time IS NULL OR (follow_up_time GLOB '[0-2][0-9]:[0-5][0-9]' AND follow_up_time <= '23:59')),
  responsible_person TEXT CHECK (responsible_person IS NULL OR length(responsible_person) BETWEEN 1 AND 80),
  waiting_on TEXT CHECK (waiting_on IS NULL OR length(waiting_on) BETWEEN 1 AND 80),
  completed_at TEXT,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (project_id IS NULL OR workspace_id IS NOT NULL),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (due_time IS NULL OR due_date IS NOT NULL),
  CHECK (follow_up_time IS NULL OR follow_up_date IS NOT NULL),
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES workspaces(id, owner_user_id),
  FOREIGN KEY (project_id, workspace_id, owner_user_id) REFERENCES projects(id, workspace_id, owner_user_id)
);
CREATE INDEX tasks_owner_active_idx ON tasks(owner_user_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_parent_idx ON tasks(parent_id);

CREATE TABLE notes (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (project_id IS NULL OR workspace_id IS NOT NULL),
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES workspaces(id, owner_user_id),
  FOREIGN KEY (project_id, workspace_id, owner_user_id) REFERENCES projects(id, workspace_id, owner_user_id)
);
CREATE INDEX notes_owner_active_idx ON notes(owner_user_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (owner_user_id, key)
);

CREATE TABLE otp_challenges (
  contact TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  next_send_at TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1)),
  -- Random per-request claim written by the compare-and-set that consumes a code.
  consumed_by TEXT
);

CREATE TABLE audio_settings (
  owner_user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'local_whisper' CHECK (provider IN ('local_whisper', 'openai')),
  encrypted_api_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Per-route, per-client sign-in throttle (one upsert per request).
CREATE TABLE auth_throttle (
  route TEXT NOT NULL,
  client TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (route, client)
) WITHOUT ROWID;
CREATE INDEX auth_throttle_window_idx ON auth_throttle(window_started_at);

-- Full-text search. External-content FTS5 tables keyed by the content table's
-- rowid and kept in sync by triggers. If rowids ever change (for example after
-- a VACUUM), rebuild with `INSERT INTO tasks_fts(tasks_fts) VALUES ('rebuild')`.
CREATE VIRTUAL TABLE tasks_fts USING fts5(
  title, description, responsible_person, waiting_on,
  content = 'tasks', content_rowid = 'rowid', tokenize = 'porter unicode61'
);
CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts (rowid, title, description, responsible_person, waiting_on)
  VALUES (new.rowid, new.title, new.description, new.responsible_person, new.waiting_on);
END;
CREATE TRIGGER tasks_fts_delete AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts (tasks_fts, rowid, title, description, responsible_person, waiting_on)
  VALUES ('delete', old.rowid, old.title, old.description, old.responsible_person, old.waiting_on);
END;
CREATE TRIGGER tasks_fts_update AFTER UPDATE OF title, description, responsible_person, waiting_on ON tasks BEGIN
  INSERT INTO tasks_fts (tasks_fts, rowid, title, description, responsible_person, waiting_on)
  VALUES ('delete', old.rowid, old.title, old.description, old.responsible_person, old.waiting_on);
  INSERT INTO tasks_fts (rowid, title, description, responsible_person, waiting_on)
  VALUES (new.rowid, new.title, new.description, new.responsible_person, new.waiting_on);
END;

CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, body,
  content = 'notes', content_rowid = 'rowid', tokenize = 'porter unicode61'
);
CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts (rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts (notes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER notes_fts_update AFTER UPDATE OF title, body ON notes BEGIN
  INSERT INTO notes_fts (notes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO notes_fts (rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE VIRTUAL TABLE projects_fts USING fts5(
  name, description,
  content = 'projects', content_rowid = 'rowid', tokenize = 'porter unicode61'
);
CREATE TRIGGER projects_fts_insert AFTER INSERT ON projects BEGIN
  INSERT INTO projects_fts (rowid, name, description) VALUES (new.rowid, new.name, new.description);
END;
CREATE TRIGGER projects_fts_delete AFTER DELETE ON projects BEGIN
  INSERT INTO projects_fts (projects_fts, rowid, name, description) VALUES ('delete', old.rowid, old.name, old.description);
END;
CREATE TRIGGER projects_fts_update AFTER UPDATE OF name, description ON projects BEGIN
  INSERT INTO projects_fts (projects_fts, rowid, name, description) VALUES ('delete', old.rowid, old.name, old.description);
  INSERT INTO projects_fts (rowid, name, description) VALUES (new.rowid, new.name, new.description);
END;
