# Ordo API foundation

Fastify + TypeScript with Drizzle and PostgreSQL. This is the first local web-core foundation, not a production release or the full MVP. The same domain/API boundary is intended for the later React Native/Expo iOS/Android clients; native authentication is not implemented yet.

## Architecture and concept notes

The API follows the structure and concepts requested from Edward's DAMSYN API: `platform/`, abstract `capabilities/`, concrete `adapters/`, and business `domains/`. Controllers parse and call services; services own invariants/transactions; repositories own scoped queries. Fastify, Drizzle, current routes, payloads, and migration checksums remain unchanged.

Read [the architecture map](docs/architecture.md), then the owning domain's concept note: [identity](src/domains/identity/identity.md), [workspaces/projects](src/domains/workspaces/workspaces.md), [tasks](src/domains/tasks/tasks.md), [notes](src/domains/notes/notes.md), [Home](src/domains/home/home.md), or [fictional demo](src/domains/demo/demo.md). Import-boundary tests enforce the platform/domain split and capability ownership.

## Run locally

Use Node.js 22.23.2 (the root `.nvmrc`) and run from the repository root:

```bash
npm ci
npm run dev:api
```

The API listens on `127.0.0.1:4318`; the web client on port 3318 proxies its same-origin `/api` requests to `/v1`. Database tables initialize at startup. With no `DATABASE_URL`, the API uses real embedded PostgreSQL through PGlite and persists at `.data/ordo/` under the repository root; missing directories are created automatically. Keep one API process per PGlite directory. Stop gracefully so it can close its data directory. The local data directory must remain ignored by Git.

No account or sample content is created automatically. Register through the local web UI, then choose the explicit sample-data action if wanted. Demo data is fictional and isolated to that account.

## Configuration

| Name              | Purpose                                                                                        | Default                                       |
| ----------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `API_PORT`        | API loopback port                                                                              | `4318`                                        |
| `ORDO_DATA_DIR`   | Local embedded PostgreSQL directory                                                            | repository `.data/ordo`                       |
| `DATABASE_URL`    | Standard PostgreSQL connection string; bypasses embedded database                              | Unset for local development                   |
| `TRUSTED_ORIGINS` | Comma-separated exact origins allowed for browser writes                                       | `http://localhost:3318,http://127.0.0.1:3318` |
| `NODE_ENV`        | Production requires `DATABASE_URL` and explicit `TRUSTED_ORIGINS`; sets Secure session cookies | Local development                             |

Never print or commit connection strings or cookie/session values. The application does not log request bodies. Standard PostgreSQL compatibility uses the same schema and postgres-js driver but has not yet been verified against a separate PostgreSQL server in this environment. Embedded persistence, constraints, and restarts have been tested.

## Authentication and request boundary

Register with `{ email, password, displayName }`; login with `{ email, password }`. Passwords are 12–128 characters, salted with 16 random bytes and hashed using Node scrypt. Session tokens contain 32 random bytes, are stored only as SHA-256 digests, expire after seven days, and are revoked on logout. Cookie: `ordo_session`, HttpOnly, SameSite=Lax, Path=/, Secure in production. No email is sent, and email ownership is not verified.

Every mutation requires an `Origin` equal to a configured trusted origin, including register/login. All private reads and writes authenticate the session and resolve record ownership from it. Client-provided owner IDs are rejected by strict input schemas. This browser-session API is not yet a public agent or native bearer-token API.

An optional `X-Ordo-Account` mutation header provides an additional account-switch guard. A mismatch against the authenticated actor returns `409 SESSION_CHANGED`. The header never establishes identity or access; it protects a queued capture owned by one account from being submitted after another account signs in in a different tab.

Login and registration are limited to 12 requests per minute per observed peer IP per API process. Logout is deliberately outside that limit so users can revoke sessions even after sign-in throttling. The current local Next.js proxy makes all browser requests appear from loopback; before shared deployment, configure trusted proxy/client-IP handling and a shared limiter. This local limiter is not a complete production abuse-control system.

## JSON contract

Shared TypeScript types and strict Zod input schemas live in `packages/core/src/index.ts`. All entity IDs are UUIDs. JSON uses camelCase; `revision` is a positive integer beginning at 1. Dates are validated calendar dates in `YYYY-MM-DD` form, intentionally without converting date-only values to arbitrary UTC instants. Record timestamps are UTC database timestamps. User timezone defaults to `Africa/Accra`.

- `User`: `id, email, displayName, timezone`.
- `Workspace`: `id, name, color, revision, createdAt, updatedAt`.
- `Project`: `id, workspaceId, name, description, revision, createdAt, updatedAt`.
- `Task`: `id, title, description, status, priority, dueDate, followUpDate, workspaceId, projectId, parentId, completedAt, deletedAt, revision, createdAt, updatedAt`.
- `Note`: `id, title, body, workspaceId, projectId, deletedAt, revision, createdAt, updatedAt`.

Task status is `todo | in_progress | waiting | done`. Priority is `low | medium | high | null`. Workspace, project, parent, due/follow-up date fields are nullable. Unscoped tasks/notes have `workspaceId: null` and `projectId: null`, but always have an authenticated owner in storage; that is the personal Inbox. A project requires its workspace. Parent and child must share both workspace and project, including null Inbox scope.

`GET /v1/home` returns `{ user, workspaces, projects, tasks, notes }` for the current owner, excluding archived tasks/notes. Entity writes return the saved entity directly. Auth routes return `{ user }`, logout `{ ok: true }`. Demo returns a refreshed Home snapshot. Owner IDs, password hashes, and session hashes are never included.

| Method and path                    | Body / behavior                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /health`                      | Public `{ status: 'ok' }` liveness; does not prove a signed-in feature works                                      |
| `POST /v1/auth/register`           | Required `email, password, displayName`; creates account and cookie, 201                                          |
| `POST /v1/auth/login`              | Required `email, password`; creates new session cookie                                                            |
| `GET /v1/auth/me`                  | Authenticated public user                                                                                         |
| `POST /v1/auth/logout`             | No body; revokes current session and clears cookie                                                                |
| `GET /v1/home`                     | Current owner's full active snapshot                                                                              |
| `GET /v1/workspaces`               | Current owner's workspace list                                                                                    |
| `GET /v1/workspaces/:id`           | Owned workspace or 404                                                                                            |
| `POST /v1/workspaces`              | Required `name`; optional `color` (hex, default `#577664`)                                                        |
| `PATCH /v1/workspaces/:id`         | Optional `name, color`; required `expectedRevision`                                                               |
| `GET /v1/workspaces/:id/projects`  | Scoped owned project list                                                                                         |
| `POST /v1/projects`                | Required `name, workspaceId`; optional `description`                                                              |
| `POST /v1/workspaces/:id/projects` | Required `name`; workspace from URL; optional `description`                                                       |
| `GET /v1/projects/:id`             | Owned project or 404                                                                                              |
| `PATCH /v1/projects/:id`           | Optional `name, description`; required `expectedRevision`                                                         |
| `GET /v1/tasks`                    | Current owner's active tasks                                                                                      |
| `GET /v1/tasks/:id`                | Active owned task or 404                                                                                          |
| `POST /v1/tasks`                   | Required `title` and `Idempotency-Key` header; optional task fields above; 201 first create / 200 identical retry |
| `PATCH /v1/tasks/:id`              | Optional editable task fields; required `expectedRevision`; omitted fields remain unchanged                       |
| `DELETE /v1/tasks/:id`             | Required `{ expectedRevision }`; soft archive; returns tombstone                                                  |
| `GET /v1/notes`                    | Current owner's active notes                                                                                      |
| `GET /v1/notes/:id`                | Active owned note or 404                                                                                          |
| `POST /v1/notes`                   | Required `title`; optional `body, workspaceId, projectId`                                                         |
| `PATCH /v1/notes/:id`              | Optional note fields; required `expectedRevision`; omitted fields remain unchanged                                |
| `DELETE /v1/notes/:id`             | Required `{ expectedRevision }`; soft archive; returns tombstone                                                  |
| `POST /v1/demo`                    | Explicitly loads fictional fixtures once for the authenticated owner, transactionally                             |

Task creation defaults to `todo`, empty description, null optional scope/dates/priority/parent. Idempotency keys are owner-scoped, at most 128 characters, and retained with the task reference; a changed payload under the same key returns `409 IDEMPOTENCY_CONFLICT`. An archived original task does not reappear on retry (`410 TASK_ARCHIVED`). Keep the same key only for retrying the same original payload.

PATCH and DELETE use optimistic revision checks. Stale revisions return `409 REVISION_CONFLICT` with no write. All owner mutations that could affect hierarchy are serialized per owner using a PostgreSQL transaction and user-row lock, preventing concurrent reparenting races. Cross-owner/project/workspace injection is rejected, cycles are rejected, and completing a parent never automatically completes children. Moving a task to another destination or archiving it while it has active children returns `409 HAS_SUBTASKS`; move/archive the children explicitly first.

Errors have `{ error: { code, message } }`. Expected codes include `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `ACCOUNT_EXISTS`, `INVALID_INPUT`, `ORIGIN_REJECTED`, `SESSION_CHANGED`, `NOT_FOUND`, `SCOPE_MISMATCH`, `TASK_CYCLE`, `HIERARCHY_LIMIT`, `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `TASK_ARCHIVED`, `HAS_SUBTASKS`, `RATE_LIMITED`, and `PAYLOAD_TOO_LARGE`. Unexpected errors return a generic `INTERNAL_ERROR` without SQL, secrets, or request content. Request body limit is 150,000 bytes; note body up to 100,000 characters, task description 20,000, names/titles 200.

## Migrations and verification

Numbered SQL migrations live in `packages/db/migrations/`, beginning with `0001_core.sql`, with matching Drizzle tables in `packages/db/src/schema.ts`. Startup discovers numbered migrations, validates applied checksums, and executes each unapplied migration transactionally. Run one migrator at a time for a shared deployment. Migration version/checksum is recorded in `ordo_migrations`; existing schema is not silently recreated or dropped, and editing an applied migration causes startup refusal. No shared-environment migration has been applied. Future changes require an additive migration and the normal owner-approved release/backup process.

```bash
npm run typecheck --workspace @ordo/api
npm run typecheck --workspace @ordo/core
npm run typecheck --workspace @ordo/db
npm run test --workspace @ordo/api
```

The integration tests use isolated embedded PostgreSQL instances and temporary filesystem directories, never existing user data. They cover passwords/session revocation, CSRF, idempotency, revisions, cross-owner and scope rejection, cycles, independent parent completion, archival, explicitly requested fixture seeding, fresh nested-directory persistence across restart, omitted PATCH field preservation, queued account-switch rejection, and logout after login throttling.

## Current limits

Not yet implemented: password reset/email verification, account/export/deletion UI, session management UI, OIDC/native auth, audit events, OpenAPI generation, pagination and server-side filtering/search, incremental sync cursor/tombstones, full offline note/multidevice editing, AI, recording/imports, MCP, desktop/mobile packaging, deployment hardening, or production backup/restore. The snapshot API supports the first web client but is not an unlimited-scale synchronization contract. Archive tombstones are returned from DELETE and excluded from refreshed snapshots; they are not yet distributed through an incremental sync feed. No standard PostgreSQL instance, staging environment, or production deployment has been verified.
