-- Agents create workspaces and projects. Only columns and indexes are added.

-- Provenance: the access token that created it, when an agent did. `origin`
-- is derived from it ("agent" when set, "manual" otherwise).
ALTER TABLE workspaces ADD COLUMN created_by_token_id TEXT REFERENCES agent_tokens(id);
ALTER TABLE projects ADD COLUMN created_by_token_id TEXT REFERENCES agent_tokens(id);

-- A create's retry key and a hash of what it asked for, so a retry returns
-- the original and the same key with a different request is refused. Kept
-- on the row itself: `idempotency_keys` belongs to tasks.
ALTER TABLE workspaces ADD COLUMN idempotency_key TEXT;
ALTER TABLE workspaces ADD COLUMN idempotency_fingerprint TEXT;
CREATE UNIQUE INDEX workspaces_idempotency_idx
  ON workspaces(owner_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE projects ADD COLUMN idempotency_key TEXT;
ALTER TABLE projects ADD COLUMN idempotency_fingerprint TEXT;
CREATE UNIQUE INDEX projects_idempotency_idx
  ON projects(owner_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
