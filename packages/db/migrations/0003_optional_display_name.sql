-- An account may have no display name. Sign-in used to invent one ("Ordo
-- member" for a phone, the email's local part for an email) and accepted a
-- phone number or email address typed as a name, which My Day then showed as
-- "Good evening, 0558601966". Such names are cleared here; the API now stores
-- NULL instead (`cleanDisplayName` in @ordo/core applies the same rule).
--
-- SQLite cannot alter a CHECK or NOT NULL constraint, so users is rebuilt.
-- D1 always enforces foreign keys, and dropping users would run its
-- ON DELETE CASCADE actions on sessions and audio_settings even with deferred
-- checks, so those rows are copied aside first and restored afterwards. The
-- other child tables (workspaces, projects, tasks, notes, idempotency_keys)
-- have no action: their deferred violations are resolved when every user row
-- is inserted back under the same id, before this migration's transaction
-- commits. No row is lost and every id is kept.

PRAGMA defer_foreign_keys = on;

CREATE TABLE users_keep AS SELECT * FROM users;
CREATE TABLE sessions_keep AS SELECT * FROM sessions;
CREATE TABLE audio_settings_keep AS SELECT * FROM audio_settings;

DROP TABLE users;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 80),
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

-- A name is cleared when it is an invented default, looks like an email
-- address, or is a phone number: seven or more digits once spaces, '+', '-',
-- '.' and brackets are removed. updated_at is kept as it was.
INSERT INTO users (id, email, display_name, timezone, phone, email_verified_at,
                   phone_verified_at, demo_loaded, demo_claim, created_at, updated_at)
SELECT id, email,
       CASE
         WHEN display_name = 'Ordo member' THEN NULL
         WHEN instr(email, '@') > 1
              AND display_name = substr(email, 1, min(instr(email, '@') - 1, 80)) THEN NULL
         WHEN display_name LIKE '%_@_%._%' THEN NULL
         WHEN length(replace(replace(replace(replace(replace(replace(trim(display_name),
                ' ', ''), '+', ''), '-', ''), '.', ''), '(', ''), ')', '')) >= 7
              AND replace(replace(replace(replace(replace(replace(trim(display_name),
                ' ', ''), '+', ''), '-', ''), '.', ''), '(', ''), ')', '') NOT GLOB '*[^0-9]*'
           THEN NULL
         ELSE display_name
       END,
       timezone, phone, email_verified_at, phone_verified_at, demo_loaded, demo_claim,
       created_at, updated_at
  FROM users_keep;

INSERT INTO sessions (token_hash, user_id, expires_at)
SELECT token_hash, user_id, expires_at FROM sessions_keep;

INSERT INTO audio_settings (owner_user_id, provider, encrypted_api_key, created_at, updated_at)
SELECT owner_user_id, provider, encrypted_api_key, created_at, updated_at FROM audio_settings_keep;

DROP TABLE users_keep;
DROP TABLE sessions_keep;
DROP TABLE audio_settings_keep;

PRAGMA defer_foreign_keys = off;
