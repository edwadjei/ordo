# Ordo API

Hono + TypeScript + Zod in one Cloudflare Worker on the Workers Free plan, with Drizzle on Cloudflare D1. The Worker serves this API under `/api` on the same origin as the web app's static export. The same domain/API boundary will serve the React Native/Expo iOS/Android clients with token sign-in. See the [technical architecture](../../docs/TECHNICAL.md) and the [Cloudflare platform spec](../../docs/specs/02-cloudflare-platform.md).

**Implementation status:** Phase 2. The API runs as a Worker under `wrangler dev` on a local D1 database; nothing is deployed and no Cloudflare account or resource exists yet (hosted staging is Phase 3). Controllers and platform guards use a framework-neutral HTTP layer (`src/platform/http/http.ts`); cryptography is Web Crypto only. Native authentication is not implemented yet.

## Architecture and concept notes

The API follows the structure and concepts requested from Edward's DAMSYN API: `platform/`, abstract `capabilities/`, concrete `adapters/`, and business `domains/`. Controllers parse and call services; services own invariants and save preconditions; repositories own scoped queries. Routes and payloads are unchanged from the Node build except that password routes are gone.

Read [the architecture map](docs/architecture.md), then the owning domain's concept note: [identity](src/domains/identity/identity.md), [workspaces/projects](src/domains/workspaces/workspaces.md), [tasks](src/domains/tasks/tasks.md), [notes](src/domains/notes/notes.md), [Home](src/domains/home/home.md), [search](src/domains/search/search.md), or [fictional demo](src/domains/demo/demo.md). Import-boundary tests enforce the platform/domain split and capability ownership.

## Run locally

Use Node.js 22.23.2 (the root `.nvmrc`). From the repository root:

```bash
npm ci
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm run db:migrate:local --workspace @ordo/api
npm run build --workspace @ordo/web
npm run dev --workspace @ordo/api
```

Then open `http://127.0.0.1:8788`. One Worker serves the static web export from `apps/web/out` and answers `/api/*` itself: `/api/<path>` is the API's `/v1/<path>` and `/api/health` is `/health`. There is no separate Node API process and no CORS. Wrangler keeps the local D1 database in `apps/api/.wrangler/state` (git-ignored); `--local` is the default for `wrangler dev` and every D1 command here passes it.

- `.dev.vars` (git-ignored) holds local variables; `.dev.vars.example` lists the names. `ORDO_ENV=development` enables the local-only behaviour below. Leave the Gatekeeper values empty for local work.
- Sign in with any email address: with no Gatekeeper configured, the development-only console transport prints `[ordo dev] Sign-in code for a•••@example.invalid: 123456` in the `wrangler dev` terminal. Nothing is sent.
- The web build must exist before `wrangler dev` starts, because `assets.directory` points at `apps/web/out`. How the web app is developed against the Worker (rebuilding the export, or the Next.js dev server proxying to port 8788) is described in [local development](../../docs/LOCAL-DEVELOPMENT.md).
- Migrations are applied only by `wrangler d1 migrations apply ordo --local` (the `db:migrate:local` script); the Worker never runs them. Wrangler records applied files in its `d1_migrations` table.

No account or sample content is created automatically. Sign in, then choose the explicit sample-data action if wanted. Demo data is fictional and isolated to that account.

### Moving content from the old embedded database

A one-time import moves content from the former embedded PostgreSQL database (`.data/ordo`) into local D1. Users, workspaces, projects, tasks, idempotency keys, notes and audio settings are copied; sessions, codes and password hashes never are, so everyone signs in again with a code.

1. Stop the old API and copy its data directory. From a checkout that still has PGlite installed (any commit before Phase 2), run `node <this repository>/packages/db/scripts/export-embedded.mjs <copy of .data/ordo> <export folder>`. It writes one JSON file per table.
2. Apply migrations to an empty local D1 database, then run `npm run db:import:local --workspace @ordo/api -- --from <absolute export folder>`. It loads batches with `wrangler d1 execute ordo --local` and prints exported and loaded counts per table; it exits non-zero on any mismatch and refuses a database that already has users. Add `--keep-provider-keys` only when the Worker's `ORDO_CREDENTIAL_KEY` equals the old local credential key; otherwise encrypted provider keys are dropped and owners re-enter them in Settings. `--persist-to <dir>` targets another local state folder.

The import is developed and tested only against a fictional fixture (`packages/db/test/fixtures/embedded-export`). Running it on real data is the coordinator's step, with Edward's approval.

## Configuration

| Name | Kind | Purpose |
| --- | --- | --- |
| `DB` | D1 binding | The database (`database_name` `ordo`); locally a placeholder ID |
| `ASSETS` | Assets binding | The static web export |
| `ORDO_ENV` | Variable | `development` enables the console code transport, a temporary OTP key, non-Secure cookies and the default local origins; anything else is hosted |
| `TRUSTED_ORIGINS` | Variable | Comma-separated exact origins allowed for writes; required when hosted. Development default: `http://127.0.0.1:8788`, `http://localhost:8788`, and the same on port 3358 |
| `OTP_HMAC_KEY` | Secret | 64 hex characters; required when hosted |
| `ORDO_CREDENTIAL_KEY` | Secret | 64 hex characters; without it credential storage reports unavailable |
| `GATEKEEPER_API_KEY`, `GATEKEEPER_API_URL` | Secrets | Real code delivery; used instead of the console transport when both are set |
| `GATEKEEPER_SENDER_ID`, `GATEKEEPER_EMAIL_HTML` | Variables | Optional SMS sender ID; `false` selects the plain-text email |

Values come from `.dev.vars` locally and from Worker secrets when hosted (Phase 3). Names only appear in this repository. A hosted Worker missing a required value answers API requests with a generic `500 INTERNAL_ERROR` and logs which name is missing, never a value. The application does not log request bodies or codes, except the development-only console transport, which prints the code it would have sent.

## Authentication and request boundary

Sign-in is code-only (see "Codes, search, and recordings" below). Session tokens contain 32 random bytes, are stored only as SHA-256 digests, expire after seven days, and are revoked on logout. Cookie: `ordo_session`, HttpOnly, SameSite=Lax, Path=/, Secure unless `ORDO_ENV=development`.

Every mutation requires an `Origin` equal to a configured trusted origin, including sign-in. All private reads and writes authenticate the session and resolve record ownership from it. Client-provided owner IDs are rejected by strict input schemas. This browser-session API is not yet a public agent or native bearer-token API.

An optional `X-Ordo-Account` header provides an additional account-switch guard on reads and writes. A mismatch against the authenticated actor returns `409 SESSION_CHANGED`. The header never establishes identity or access; it protects a queued capture owned by one account from being submitted after another account signs in in a different tab.

Sign-in routes are limited to 12 requests a minute per route and per client address (`CF-Connecting-IP`), counted in D1 so every isolate shares the limit. Logout is deliberately outside that limit so users can revoke sessions even after sign-in throttling.

### Read-your-writes bookmarks

Each API request opens a D1 Sessions API session from the `X-Ordo-Bookmark` request header (a missing or malformed value starts unconstrained) and returns the session's latest bookmark in the `X-Ordo-Bookmark` response header. `packages/client` stores it per account and sends it back, so web and mobile read their own saves even from a read replica.

## JSON contract

Shared TypeScript types and strict Zod input schemas live in `packages/core/src/index.ts`. All entity IDs are UUIDs. JSON uses camelCase; `revision` is a positive integer beginning at 1. Dates are validated calendar dates in `YYYY-MM-DD` form, intentionally without converting date-only values to arbitrary UTC instants. Record timestamps are UTC ISO 8601 text (`2026-10-28T08:28:04.522Z`). User timezone defaults to `Africa/Accra`.

- `User`: `id, email, displayName, timezone`.
- `Workspace`: `id, name, color, revision, createdAt, updatedAt`.
- `Project`: `id, workspaceId, name, description, revision, createdAt, updatedAt`.
- `Task`: `id, title, description, status, priority, dueDate, dueTime, followUpDate, followUpTime, responsiblePerson, waitingOn, workspaceId, projectId, parentId, completedAt, deletedAt, revision, createdAt, updatedAt`.
- `Note`: `id, title, body, workspaceId, projectId, deletedAt, revision, createdAt, updatedAt`.

Task status is `todo | in_progress | waiting | done`. Priority is `low | medium | high | null`. Workspace, project, parent, due/follow-up date fields are nullable. `dueTime` and `followUpTime` are optional 24-hour `HH:MM` local wall-clock times in the user's timezone, stored separately from their date-only fields; a time requires its date, so a request that leaves a time without its date (including clearing the date but not the time) returns `400 INVALID_INPUT` ("A due time needs a due date." / "A follow-up time needs a follow-up date."). `responsiblePerson` and `waitingOn` are plain-text names (trimmed, at most 80 characters, empty becomes `null`) and are never matched to accounts; `waitingOn` describes who a task waits on but Waiting On membership is still `status: waiting`. Unscoped tasks/notes have `workspaceId: null` and `projectId: null`, but always have an authenticated owner in storage; that is the personal Inbox. A project requires its workspace. Parent and child must share both workspace and project, including null Inbox scope.

`GET /v1/home` returns `{ user, workspaces, projects, tasks, notes }` for the current owner, excluding archived tasks/notes. Entity writes return the saved entity directly. Code verification returns `{ user }`, logout `{ ok: true }`. Demo returns a refreshed Home snapshot. Owner IDs and session hashes are never included.

| Method and path                    | Body / behavior                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /health`                      | Public `{ status: 'ok' }` liveness (`/api/health` on the Worker); does not prove a signed-in feature works        |
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
| `POST /v1/demo`                    | Explicitly loads fictional fixtures once for the authenticated owner, in one batch                                |

Task creation defaults to `todo`, empty description, null optional scope/dates/times/people/priority/parent. Idempotency keys are owner-scoped, at most 128 characters, and retained with the task reference; a changed payload under the same key returns `409 IDEMPOTENCY_CONFLICT`. An archived original task does not reappear on retry (`410 TASK_ARCHIVED`). Keep the same key only for retrying the same original payload.

### Saving safely: check-on-save

D1 has no row locks or interactive transactions, so every write carries its own preconditions. PATCH and DELETE are `UPDATE … WHERE revision = ?`; a stale or concurrently overtaken revision returns `409 REVISION_CONFLICT` ("changed elsewhere") with no write. A hierarchy change is also conditional on the revisions of every ancestor read during the cycle check, so crossing moves cannot create a cycle. Moving a task to another destination or archiving it while it has active children returns `409 HAS_SUBTASKS` (the statement includes `NOT EXISTS (active child)`); a subtask is inserted only while its parent is still active and unchanged in the same destination. Task creation inserts the task and its idempotency key in one `batch()`. Cross-owner/project/workspace injection is rejected, cycles are rejected, and completing a parent never automatically completes children. Each rule has statement-level and concurrent-request tests in `test/concurrency.test.ts`.

Errors have `{ error: { code, message } }`. Expected codes include `UNAUTHORIZED`, `INVALID_INPUT`, `ORIGIN_REJECTED`, `SESSION_CHANGED`, `NOT_FOUND`, `SCOPE_MISMATCH`, `TASK_CYCLE`, `HIERARCHY_LIMIT`, `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `TASK_ARCHIVED`, `HAS_SUBTASKS`, `RATE_LIMITED`, `OTP_INVALID`, `OTP_RATE_LIMITED` and `PAYLOAD_TOO_LARGE`. Unexpected errors return a generic `INTERNAL_ERROR` without SQL, secrets, or request content. Request body limit is 150,000 bytes; note body up to 100,000 characters, task description 20,000, names/titles 200.

## Migrations and verification

The schema is one numbered SQLite migration set in `packages/db/migrations/` (Phase 2 starts fresh with `0001_initial.sql`), with matching Drizzle `sqlite-core` tables in `packages/db/src/schema.ts`. It includes the FTS5 search tables and their triggers, `auth_throttle`, and the check constraints for task times and name lengths. Future changes are new numbered files; an applied file is never edited. Every shared-environment migration needs Edward's approval, a D1 restore point and the rollback gates.

```bash
npm run typecheck --workspace @ordo/api
npm run test --workspace @ordo/api
```

The tests run in Node against the Hono app through a small shim (`test/http-harness.ts`, which calls `app.request()`) and against the Worker entry itself (`test/worker.test.ts`). Each test gets a fresh, in-memory local D1 database from Wrangler's platform proxy (Miniflare, `remoteBindings: false`, nothing persisted) with every migration applied, split into statements exactly as `wrangler d1 migrations apply` splits them (`test/d1-harness.ts`). Accounts are created through the real code flow with a capturing delivery transport; no real message is sent. The suites cover code sign-in (replays, attempt limits, resend spacing, throttling), CSRF, idempotency, revisions, concurrency scenarios for every check-on-save rule, cross-owner and scope rejection, cycles, independent parent completion, archival, fixture seeding, FTS5 search, bookmarks, omitted PATCH field preservation, queued account-switch rejection, sign-out after throttling, and the data import against a fictional fixture.

CPU time per request has not been measured: the local runtime reports `cpu_time_ms: 0`. Every request path avoids deliberately slow work (no scrypt; HMAC and SHA-256 only) and uses at most a handful of D1 statements, mostly batched; Phase 3 records CPU time from Cloudflare observability against the 10 ms budget.

## Current limits

Not yet implemented: contact linking/recovery, account/export/deletion UI, session management UI, OIDC/native auth, audit events, OpenAPI generation, pagination and advanced filtering, incremental sync cursor/tombstones, full offline note/multidevice editing, AI extraction, transcript imports, MCP, desktop/mobile packaging, or hosted backup/restore. The snapshot API supports the first web client but is not an unlimited-scale synchronization contract. Archive tombstones are returned from DELETE and excluded from refreshed snapshots; they are not yet distributed through an incremental sync feed. No staging environment or production deployment exists.

## Codes, search, and recordings

| Route                       | Behavior                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/capabilities`      | Public configuration availability, including `transcriptionProviders` and `credentialStorage`; no credentials         |
| `POST /v1/auth/otp/request` | `{contact}` email or Ghana phone → 202 `{challengeId,retryAfterSeconds,expiresInSeconds}`                             |
| `POST /v1/auth/otp/verify`  | `{challengeId,code,displayName?}` → user and session cookie                                                           |
| `GET /v1/search?q=...`      | Ranked owner-scoped task/note/project FTS5 results (`bm25()`), max 30                                                 |
| `POST /v1/transcriptions`   | Raw supported audio, max 20 MiB → `{transcript}`; memory only, audio discarded after processing; 503 when unavailable |

A code is valid for five minutes and works once, with 60-second resend spacing, five sends and five attempts per 15-minute contact window; resending does not clear failed attempts. Email and phone accounts are not automatically linked. Codes are stored as HMAC-SHA256 hashes keyed by `OTP_HMAC_KEY`. A legacy local account (for example one moved by the import) keeps its ID and data and has its old sessions deleted at its first successful email code. Details live in the identity, search, and transcriptions domain concept notes. Ordo stores no audio/files or recording metadata. Audio buffers are request-scoped and cleared after processing; transcripts persist only when separately saved through Notes. Per-isolate concurrency limits apply.

## Audio provider settings

`GET /v1/settings/audio` returns safe owner-scoped readiness/configuration. `PATCH /v1/settings/audio` saves `{provider,apiKey?,removeApiKey?}`; keys are encrypted with `ORDO_CREDENTIAL_KEY` and never returned. New-key writes require HTTPS or exact loopback origins. `POST /v1/settings/audio/test` checks the saved provider configuration without sending audio. The Worker uses the account's own OpenAI key; local Whisper needs an FFmpeg process the Worker cannot start, so it reports unavailable (also under `wrangler dev`). Global OpenAI credentials are not inherited by accounts.

`POST /v1/transcriptions` requires `X-Ordo-Audio-Provider` (`local_whisper` or `openai`) alongside the displayed-account guard when resolving user settings. A stale or missing snapshot returns `409 AUDIO_SETTINGS_CHANGED` before sending audio. See the audio-settings domain concept and root audio guide.

Code email uses the Ordo HTML template by default (wordmark, orange accent, expiry/security copy, no remote assets). `GATEKEEPER_EMAIL_HTML=false` chooses the plain-text fallback. Sender delivery/domain identity remains controlled by the configured Gatekeeper service; the application supplies subject/body.
