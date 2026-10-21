CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, display_name text NOT NULL,
 timezone text NOT NULL DEFAULT 'Africa/Accra', password_hash text NOT NULL,
 demo_loaded boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE workspaces (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES users(id), name text NOT NULL, color text NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id, owner_user_id)
);
CREATE TABLE projects (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES users(id), workspace_id uuid NOT NULL,
 name text NOT NULL, description text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id, owner_user_id) REFERENCES workspaces(id, owner_user_id), UNIQUE(id, workspace_id, owner_user_id)
);
CREATE TABLE tasks (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES users(id), workspace_id uuid, project_id uuid, parent_id uuid REFERENCES tasks(id),
 title text NOT NULL, description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','waiting','done')),
 priority text CHECK(priority IN ('low','medium','high')), due_date date, follow_up_date date,
 completed_at timestamptz, deleted_at timestamptz, revision integer NOT NULL DEFAULT 1 CHECK(revision > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(project_id IS NULL OR workspace_id IS NOT NULL), CHECK(parent_id IS NULL OR parent_id <> id),
 FOREIGN KEY(workspace_id, owner_user_id) REFERENCES workspaces(id, owner_user_id),
 FOREIGN KEY(project_id, workspace_id, owner_user_id) REFERENCES projects(id, workspace_id, owner_user_id)
);
CREATE INDEX tasks_owner_idx ON tasks(owner_user_id, updated_at);
CREATE INDEX tasks_workspace_status_due_idx ON tasks(workspace_id, status, due_date);
CREATE INDEX tasks_parent_idx ON tasks(parent_id);
CREATE TABLE notes (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES users(id), workspace_id uuid, project_id uuid,
 title text NOT NULL, body text NOT NULL DEFAULT '', deleted_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(project_id IS NULL OR workspace_id IS NOT NULL),
 FOREIGN KEY(workspace_id, owner_user_id) REFERENCES workspaces(id, owner_user_id),
 FOREIGN KEY(project_id, workspace_id, owner_user_id) REFERENCES projects(id, workspace_id, owner_user_id)
);
CREATE INDEX notes_owner_idx ON notes(owner_user_id, updated_at);
CREATE TABLE idempotency_keys (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES users(id), key text NOT NULL, fingerprint text NOT NULL,
 task_id uuid NOT NULL REFERENCES tasks(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_user_id, key)
);
