-- Agent access (release slice 3, part 1): personal access tokens for AI
-- assistants, an activity log of what they did, and provenance on the tasks
-- and notes they create. Only tables, columns and indexes are added.

-- A token is shown once as `ordo_pat_<id>_<secret>`; only an HMAC-SHA256 of
-- the secret is kept (under OTP_HMAC_KEY, with its own label). Tokens are
-- revoked, never deleted, so provenance and activity keep their key name.
CREATE TABLE agent_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  -- "read" or "read write": writing implies reading.
  scopes TEXT NOT NULL CHECK (scopes IN ('read', 'read write')),
  secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT,
  UNIQUE (id, owner_user_id)
);
CREATE INDEX agent_tokens_owner_idx ON agent_tokens(owner_user_id, created_at);

-- What a token did to which item; never any content. Kept 90 days.
CREATE TABLE agent_activity (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 60),
  entity_type TEXT CHECK (entity_type IS NULL OR length(entity_type) BETWEEN 1 AND 30),
  entity_id TEXT CHECK (entity_id IS NULL OR length(entity_id) <= 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (token_id, owner_user_id) REFERENCES agent_tokens(id, owner_user_id) ON DELETE CASCADE
);
CREATE INDEX agent_activity_token_idx ON agent_activity(owner_user_id, token_id, created_at);
CREATE INDEX agent_activity_owner_idx ON agent_activity(owner_user_id, created_at);

-- Provenance. Tasks already have `origin`; notes gain it. Set by the server.
ALTER TABLE tasks ADD COLUMN created_by_token_id TEXT REFERENCES agent_tokens(id);
ALTER TABLE notes ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'
  CHECK (origin IN ('manual', 'capture', 'agent'));
ALTER TABLE notes ADD COLUMN created_by_token_id TEXT REFERENCES agent_tokens(id);
