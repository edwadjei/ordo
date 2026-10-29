-- AI capture (release slice 2): project routing hints, task provenance,
-- drafts, capture runs and the account's text-AI provider choice.
-- Every change adds a column or a table, so no existing row is rewritten.

-- Up to 10 alternative names (1–60 characters each) the AI may match.
ALTER TABLE projects ADD COLUMN aliases TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(aliases) AND json_type(aliases) = 'array' AND json_array_length(aliases) <= 10);

-- Where a task came from. Set on create; the source note is never deleted
-- with the task (notes are only ever archived, so the reference stays valid).
ALTER TABLE tasks ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'
  CHECK (origin IN ('manual', 'capture', 'agent'));
ALTER TABLE tasks ADD COLUMN source_note_id TEXT REFERENCES notes(id);
CREATE INDEX tasks_source_note_idx ON tasks(source_note_id) WHERE source_note_id IS NOT NULL;

-- Lets drafts and capture runs reference a note of the same owner.
CREATE UNIQUE INDEX notes_id_owner_idx ON notes(id, owner_user_id);

-- Email or message drafts. Ordo never sends them; people copy them.
CREATE TABLE drafts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  source_note_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'message')),
  recipient TEXT CHECK (recipient IS NULL OR length(recipient) BETWEEN 1 AND 200),
  subject TEXT CHECK (subject IS NULL OR length(subject) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (length(body) <= 20000),
  used_at TEXT,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES workspaces(id, owner_user_id),
  FOREIGN KEY (project_id, workspace_id, owner_user_id) REFERENCES projects(id, workspace_id, owner_user_id),
  FOREIGN KEY (source_note_id, owner_user_id) REFERENCES notes(id, owner_user_id)
);
CREATE INDEX drafts_owner_active_idx ON drafts(owner_user_id, created_at) WHERE deleted_at IS NULL;

-- One "Process with AI" request on a note. Suggestions are validated JSON;
-- note text, prompts and raw model output are never stored here.
CREATE TABLE capture_runs (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  note_id TEXT NOT NULL,
  note_revision INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed', 'pending', 'saved')),
  provider TEXT NOT NULL CHECK (provider IN ('workers_ai', 'openai', 'anthropic')),
  -- Null when no model could be reached (a `pending` run).
  model TEXT,
  suggestions TEXT CHECK (suggestions IS NULL OR json_valid(suggestions)),
  error_code TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  neurons INTEGER,
  -- Written by the one save that wins; a retry with the same key and body
  -- reads `saved_result` back instead of saving twice.
  save_key TEXT,
  save_fingerprint TEXT,
  save_claim TEXT,
  saved_result TEXT CHECK (saved_result IS NULL OR json_valid(saved_result)),
  saved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status <> 'ready' OR suggestions IS NOT NULL),
  FOREIGN KEY (note_id, owner_user_id) REFERENCES notes(id, owner_user_id),
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES workspaces(id, owner_user_id),
  FOREIGN KEY (project_id, workspace_id, owner_user_id) REFERENCES projects(id, workspace_id, owner_user_id)
);
CREATE INDEX capture_runs_note_idx ON capture_runs(owner_user_id, note_id, created_at);

-- The account's text-AI choice and its Anthropic key (AES-GCM encrypted like
-- audio keys). The one OpenAI key stays in audio_settings, shared with
-- transcription, so it is never stored twice.
CREATE TABLE ai_settings (
  owner_user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_provider TEXT NOT NULL DEFAULT 'workers_ai' CHECK (text_provider IN ('workers_ai', 'openai', 'anthropic')),
  encrypted_anthropic_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
