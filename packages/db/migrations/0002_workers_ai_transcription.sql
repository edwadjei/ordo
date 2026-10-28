-- Workers AI Whisper replaces local Whisper as the transcription provider.
-- SQLite cannot alter a CHECK constraint, so audio_settings is rebuilt.
-- Existing 'local_whisper' rows become 'workers_ai'; 'openai' rows and their
-- encrypted keys are kept unchanged. No other table references audio_settings.

CREATE TABLE audio_settings_next (
  owner_user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'workers_ai' CHECK (provider IN ('workers_ai', 'openai')),
  encrypted_api_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO audio_settings_next (owner_user_id, provider, encrypted_api_key, created_at, updated_at)
SELECT
  owner_user_id,
  CASE provider WHEN 'openai' THEN 'openai' ELSE 'workers_ai' END,
  encrypted_api_key,
  created_at,
  updated_at
FROM audio_settings;

DROP TABLE audio_settings;

ALTER TABLE audio_settings_next RENAME TO audio_settings;
