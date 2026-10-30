# Ordo API

Hono + TypeScript + Zod in one Cloudflare Worker on the Workers Free plan, with Drizzle on Cloudflare D1. The Worker serves this API under `/api` on the same origin as the web app's static export. The same domain/API boundary will serve the React Native/Expo iOS/Android clients with token sign-in. See the [technical architecture](../../docs/TECHNICAL.md) and the [Cloudflare platform spec](../../docs/specs/02-cloudflare-platform.md).

**Implementation status:** Phase 2. The API runs as a Worker under `wrangler dev` on a local D1 database; nothing is deployed and no Cloudflare account or resource exists yet (hosted staging is Phase 3). Controllers and platform guards use a framework-neutral HTTP layer (`src/platform/http/http.ts`); cryptography is Web Crypto only. Native authentication is not implemented yet.

## Architecture and concept notes

The API follows the structure and concepts requested from Edward's DAMSYN API: `platform/`, abstract `capabilities/`, concrete `adapters/`, and business `domains/`. Controllers parse and call services; services own invariants and save preconditions; repositories own scoped queries. Routes and payloads are unchanged from the Node build except that password routes are gone.

Read [the architecture map](docs/architecture.md), then the owning domain's concept note: [identity](src/domains/identity/identity.md), [workspaces/projects](src/domains/workspaces/workspaces.md), [tasks](src/domains/tasks/tasks.md), [notes](src/domains/notes/notes.md), [Home](src/domains/home/home.md), [search](src/domains/search/search.md), [fictional demo](src/domains/demo/demo.md), [audio settings](src/domains/audio-settings/audio-settings.md), [transcriptions](src/domains/transcriptions/transcriptions.md), [AI capture](src/domains/capture/capture.md), [drafts](src/domains/drafts/drafts.md), or [AI settings](src/domains/ai-settings/ai-settings.md), or [agent access and MCP](src/domains/agent-access/agent-access.md). Import-boundary tests enforce the platform/domain split and capability ownership.

## Run locally

Use Node.js 22.23.2 (the root `.nvmrc`). From the repository root:

```bash
npm ci
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm run db:migrate:local --workspace @ordo/api
npm run build --workspace @ordo/web
npm run dev --workspace @ordo/api
```

Then open `http://127.0.0.1:8788`. One Worker serves the static web export from `apps/web/out` and answers `/api/*` itself: `/api/<path>` is the API's `/v1/<path>` and `/api/health` is `/health`. There is no separate Node API process and no CORS. Wrangler keeps the local D1 database in `apps/api/.wrangler/state` (git-ignored). The `dev` script runs `wrangler dev --local`, which disables remote bindings, and every D1 command here passes `--local`, so nothing needs a Cloudflare login.

- `.dev.vars` (git-ignored) holds local variables; `.dev.vars.example` lists the names. `ORDO_ENV=development` enables the local-only behaviour below. Leave the Gatekeeper values empty for local work.
- Sign in with any email address: with no Gatekeeper configured, the development-only console transport prints `[ordo dev] Sign-in code for a•••@example.invalid: 123456` in the `wrangler dev` terminal. Nothing is sent.
- The web build must exist before `wrangler dev` starts, because `assets.directory` points at `apps/web/out`. How the web app is developed against the Worker (rebuilding the export, or the Next.js dev server proxying to port 8788) is described in [local development](../../docs/LOCAL-DEVELOPMENT.md).
- Workers AI has no local simulator: the `AI` binding always runs on Cloudflare and needs an account. Under `npm run dev` it cannot be reached, so development leaves it off (`ORDO_WORKERS_AI`, see `.dev.vars.example`) and local transcription needs an account's own OpenAI key. Details are in the [audio setup guide](../../docs/AUDIO-SETUP.md#local-development).
- Migrations are applied only by `wrangler d1 migrations apply ordo --local` (the `db:migrate:local` script); the Worker never runs them. Wrangler records applied files in its `d1_migrations` table.

No account or sample content is created automatically. Sign in, then choose the explicit sample-data action if wanted. Demo data is fictional and isolated to that account.

### Moving content from the old embedded database

A one-time import moves content from the former embedded PostgreSQL database (`.data/ordo`) into local D1. Users, workspaces, projects, tasks, idempotency keys, notes and audio settings are copied; sessions, codes and password hashes never are, so everyone signs in again with a code.

1. Stop the old API and copy its data directory. From a checkout that still has PGlite installed (any commit before Phase 2), run `node <this repository>/packages/db/scripts/export-embedded.mjs <copy of .data/ordo> <export folder>`. It writes one JSON file per table.
2. Apply migrations to an empty local D1 database, then run `npm run db:import:local --workspace @ordo/api -- --from <absolute export folder>`. It loads batches with `wrangler d1 execute ordo --local` and prints exported and loaded counts per table; it exits non-zero on any mismatch and refuses a database that already has users. Add `--keep-provider-keys` only when the Worker's `ORDO_CREDENTIAL_KEY` equals the old local credential key; otherwise encrypted provider keys are dropped and owners re-enter them in Settings. `--persist-to <dir>` targets another local state folder.

The import is developed and tested only against a fictional fixture (`packages/db/test/fixtures/embedded-export`). Running it on real data is the coordinator's step, with Edward's approval.

## Configuration

| Name                                            | Kind           | Purpose                                                                                                                                                                  |
| ----------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB`                                            | D1 binding     | The database (`database_name` `ordo`); locally a placeholder ID                                                                                                          |
| `ASSETS`                                        | Assets binding | The static web export                                                                                                                                                    |
| `ORDO_ENV`                                      | Variable       | `development` enables the console code transport, a temporary OTP key, non-Secure cookies and the default local origins; anything else is hosted                         |
| `TRUSTED_ORIGINS`                               | Variable       | Comma-separated exact origins allowed for writes; required when hosted. Development default: `http://127.0.0.1:8788`, `http://localhost:8788`, and the same on port 3358 |
| `OTP_HMAC_KEY`                                  | Secret         | 64 hex characters; required when hosted                                                                                                                                  |
| `ORDO_CREDENTIAL_KEY`                           | Secret         | 64 hex characters; without it credential storage reports unavailable                                                                                                     |
| `GATEKEEPER_API_KEY`, `GATEKEEPER_API_URL`      | Secrets        | Real code delivery; used instead of the console transport when both are set                                                                                              |
| `GATEKEEPER_SENDER_ID`, `GATEKEEPER_EMAIL_HTML` | Variables      | Optional SMS sender ID; `false` selects the plain-text email                                                                                                             |

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

- `User`: `id, email, displayName, timezone`. `displayName` is `""` when the account has no name; it is never a phone number or email address (see [display names](src/domains/identity/identity.md#display-names)).
- `Workspace`: `id, name, color, archivedAt, revision, createdAt, updatedAt`. `archivedAt` is set while it is archived.
- `Project`: `id, workspaceId, name, description, favorite, aliases, archivedAt, revision, createdAt, updatedAt`. `favorite` is a boolean, `false` by default. `aliases` is up to 10 distinct alternative names (1–60 characters each), `[]` by default; AI capture may match them.
- `Task`: `id, title, description, status, priority, dueDate, dueTime, followUpDate, followUpTime, responsiblePerson, waitingOn, workspaceId, projectId, parentId, origin, sourceNoteId, completedAt, deletedAt, revision, createdAt, updatedAt`. `origin` is `manual | capture | agent` and is set by the server, never by a client: `manual` for `POST /v1/tasks`, `capture` from the capture save route. `sourceNoteId` is the owner's note it came from; a client may set it on create only.
- `Draft` and `CaptureRun`: see [AI capture](#ai-capture) below.
- `Note`: `id, title, body, preview, bodyLength, source, workspaceId, projectId, deletedAt, revision, createdAt, updatedAt`. `body` is Markdown text; `source` is `manual | recording | email | transcript`, `manual` by default, and is set on create only. `GET /v1/notes`, `GET /v1/notes/:id` and `/v1/home` add `latestCaptureStatus` (`null | pending | failed | ready | saved`), the status of the note's newest capture run, read in the same query. `preview` is the body's first 280 characters (code points, so a character is never split) and `bodyLength` its length in characters. `/v1/home` and `GET /v1/notes` send every note without `body` (`NoteSummary`); open one with `GET /v1/notes/:id`, which, like every note write, returns the full body.

Task status is `todo | in_progress | waiting | done`. Priority is `low | medium | high | null`. Workspace, project, parent, due/follow-up date fields are nullable. `dueTime` and `followUpTime` are optional 24-hour `HH:MM` local wall-clock times in the user's timezone, stored separately from their date-only fields; a time requires its date, so a request that leaves a time without its date (including clearing the date but not the time) returns `400 INVALID_INPUT` ("A due time needs a due date." / "A follow-up time needs a follow-up date."). `responsiblePerson` and `waitingOn` are plain-text names (trimmed, at most 80 characters, empty becomes `null`) and are never matched to accounts; `waitingOn` describes who a task waits on but Waiting On membership is still `status: waiting`. Unscoped tasks/notes have `workspaceId: null` and `projectId: null`, but always have an authenticated owner in storage; that is the personal Inbox. A project requires its workspace. Parent and child must share both workspace and project, including null Inbox scope.

`GET /v1/home` returns `{ user, workspaces, projects, tasks, notes }` for the current owner, excluding archived tasks/notes. Entity writes return the saved entity directly. Code verification returns `{ user }`, logout `{ ok: true }`. Demo returns a refreshed Home snapshot. Owner IDs and session hashes are never included.

| Method and path                    | Body / behavior                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /health`                      | Public `{ status: 'ok' }` liveness (`/api/health` on the Worker); does not prove a signed-in feature works        |
| `GET /v1/auth/me`                  | Authenticated public user                                                                                         |
| `PATCH /v1/auth/me`                | `{ displayName: string \| null }`; trimmed, at most 80; empty or `null` clears; a phone- or email-like name is `400`; returns `{ user }` |
| `POST /v1/auth/logout`             | No body; revokes current session and clears cookie                                                                |
| `GET /v1/home`                     | Current owner's full active snapshot                                                                              |
| `GET /v1/workspaces`               | Current owner's workspace list                                                                                    |
| `GET /v1/workspaces/:id`           | Owned workspace or 404                                                                                            |
| `POST /v1/workspaces`              | Required `name`; optional `color` (hex, default `#577664`)                                                        |
| `PATCH /v1/workspaces/:id`         | Optional `name, color, archived`; required `expectedRevision`                                                     |
| `GET /v1/workspaces/:id/projects`  | Scoped owned project list                                                                                         |
| `POST /v1/projects`                | Required `name, workspaceId`; optional `description, favorite, aliases`                                           |
| `POST /v1/workspaces/:id/projects` | Required `name`; workspace from URL; optional `description, favorite, aliases`                                    |
| `GET /v1/projects/:id`             | Owned project or 404                                                                                              |
| `PATCH /v1/projects/:id`           | Optional `name, description, favorite, aliases, archived`; required `expectedRevision`                            |
| `GET /v1/tasks`                    | Current owner's active tasks                                                                                      |
| `GET /v1/tasks/:id`                | Active owned task or 404                                                                                          |
| `POST /v1/tasks`                   | Required `title` and `Idempotency-Key` header; optional task fields above; 201 first create / 200 identical retry |
| `PATCH /v1/tasks/:id`              | Optional editable task fields; required `expectedRevision`; omitted fields remain unchanged; a new `workspaceId`/`projectId` moves the task's subtasks too |
| `DELETE /v1/tasks/:id`             | Required `{ expectedRevision }`; soft archive; returns tombstone                                                  |
| `GET /v1/notes`                    | Current owner's active notes, without `body` (with `preview`, `bodyLength`)                                       |
| `GET /v1/notes/:id`                | Active owned note with its full body, or 404                                                                      |
| `POST /v1/notes`                   | Required `title`; optional `body, source, workspaceId, projectId`                                                 |
| `PATCH /v1/notes/:id`              | Optional `title, body, workspaceId, projectId`; required `expectedRevision`; omitted fields remain unchanged; `source` cannot change |
| `DELETE /v1/notes/:id`             | Required `{ expectedRevision }`; soft archive; returns tombstone                                                  |
| `POST /v1/demo`                    | Explicitly loads fictional fixtures once for the authenticated owner, in one batch                                |

Task creation defaults to `todo`, empty description, null optional scope/dates/times/people/priority/parent. Idempotency keys are owner-scoped, at most 128 characters, and retained with the task reference; a changed payload under the same key returns `409 IDEMPOTENCY_CONFLICT`. An archived original task does not reappear on retry (`410 TASK_ARCHIVED`). Keep the same key only for retrying the same original payload.

### Saving safely: check-on-save

D1 has no row locks or interactive transactions, so every write carries its own preconditions. PATCH and DELETE are `UPDATE … WHERE revision = ?`; a stale or concurrently overtaken revision returns `409 REVISION_CONFLICT` ("changed elsewhere") with no write. A hierarchy change is also conditional on the revisions of every ancestor read during the cycle check, so crossing moves cannot create a cycle. Moving a task to another workspace or project moves its subtasks with it in the same `batch()` (see the [tasks concept note](src/domains/tasks/tasks.md)). Archiving a task while it has active children returns `409 HAS_SUBTASKS` (the statement includes `NOT EXISTS (active child)`); a subtask is inserted only while its parent is still active and unchanged in the same destination. Task creation inserts the task and its idempotency key in one `batch()`. Cross-owner/project/workspace injection is rejected, cycles are rejected, and completing a parent never automatically completes children. Each rule has statement-level and concurrent-request tests in `test/concurrency.test.ts`.

Errors have `{ error: { code, message } }`. Expected codes include `UNAUTHORIZED`, `INVALID_INPUT`, `ORIGIN_REJECTED`, `SESSION_CHANGED`, `NOT_FOUND`, `SCOPE_MISMATCH`, `TASK_CYCLE`, `HIERARCHY_LIMIT`, `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `TASK_ARCHIVED`, `HAS_SUBTASKS`, `SCOPE_DELETED` (a write that lost a race with a permanent delete), `RATE_LIMITED`, `OTP_INVALID`, `OTP_RATE_LIMITED` and `PAYLOAD_TOO_LARGE`. Unexpected errors return a generic `INTERNAL_ERROR` without SQL, secrets, or request content. Request body limit is 150,000 bytes (450,000 for note create and edit, 650,000 for a capture save); note body up to 100,000 characters, task description 20,000, names/titles 200.

## Migrations and verification

The schema is one numbered SQLite migration set in `packages/db/migrations/` (Phase 2 starts fresh with `0001_initial.sql`; `0002` moves transcription to Workers AI, `0003` makes the display name optional, `0004` adds project favourites and note sources, `0005` adds AI capture: project aliases, task provenance, drafts, capture runs and AI settings, `0006` adds archiving and task links and `0007` adds agent access: tokens, activity and provenance), with matching Drizzle `sqlite-core` tables in `packages/db/src/schema.ts`. It includes the FTS5 search tables and their triggers, `auth_throttle`, and the check constraints for task times and name lengths. Future changes are new numbered files; an applied file is never edited. Every shared-environment migration needs Edward's approval, a D1 restore point and the rollback gates.

```bash
npm run typecheck --workspace @ordo/api
npm run test --workspace @ordo/api
```

The tests run in Node against the Hono app through a small shim (`test/http-harness.ts`, which calls `app.request()`) and against the Worker entry itself (`test/worker.test.ts`). Each test gets a fresh, in-memory local D1 database from Wrangler's platform proxy (Miniflare, `remoteBindings: false`, nothing persisted) with every migration applied, split into statements exactly as `wrangler d1 migrations apply` splits them (`test/d1-harness.ts`). Accounts are created through the real code flow with a capturing delivery transport; no real message is sent. The suites cover code sign-in (replays, attempt limits, resend spacing, throttling), CSRF, idempotency, revisions, concurrency scenarios for every check-on-save rule, cross-owner and scope rejection, cycles, independent parent completion, archival, fixture seeding, FTS5 search, bookmarks, omitted PATCH field preservation, queued account-switch rejection, sign-out after throttling, and the data import against a fictional fixture.

CPU time per request has not been measured: the local runtime reports `cpu_time_ms: 0`. Every request path avoids deliberately slow work (no scrypt; HMAC and SHA-256 only) and uses at most a handful of D1 statements, mostly batched; Phase 3 records CPU time from Cloudflare observability against the 10 ms budget.

## Current limits

Not yet implemented: contact linking/recovery, account/export/deletion UI, session management UI, OIDC/native auth, audit events, OpenAPI generation, pagination and advanced filtering, incremental sync cursor/tombstones, full offline note/multidevice editing, background or automatic AI processing, chunking of captures longer than the model accepts, MCP, desktop/mobile packaging, or hosted backup/restore. The snapshot API supports the first web client but is not an unlimited-scale synchronization contract. Archive tombstones are returned from DELETE and excluded from refreshed snapshots; they are not yet distributed through an incremental sync feed. No staging environment or production deployment exists.

## Codes, search, and recordings

| Route                       | Behavior                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/capabilities`      | Public configuration availability, including `transcriptionProviders` and `credentialStorage`; no credentials                                                                        |
| `POST /v1/auth/otp/request` | `{contact}` email or Ghana phone → 202 `{challengeId,retryAfterSeconds,expiresInSeconds}`                                                                                            |
| `POST /v1/auth/otp/verify`  | `{challengeId,code,displayName?}` → user and session cookie; a phone- or email-like name is not stored                                                                               |
| `GET /v1/search?q=...`      | Ranked owner-scoped task/note/project FTS5 results (`bm25()`), max 30                                                                                                                |
| `POST /v1/transcriptions`   | Raw supported audio, max 20 MiB → `{transcript}` via Workers AI or the account's OpenAI key; memory only, audio discarded after processing; specific 429/503 errors when unavailable |

A code is valid for five minutes and works once, with 60-second resend spacing, five sends and five attempts per 15-minute contact window; resending does not clear failed attempts. Email and phone accounts are not automatically linked. Codes are stored as HMAC-SHA256 hashes keyed by `OTP_HMAC_KEY`. A legacy local account (for example one moved by the import) keeps its ID and data and has its old sessions deleted at its first successful email code. Details live in the identity, search, and transcriptions domain concept notes. Ordo stores no audio/files or recording metadata. Audio buffers are request-scoped and cleared after processing; transcripts persist only when separately saved through Notes. Per-isolate concurrency limits apply.

## Audio provider settings

`GET /v1/settings/audio` returns safe owner-scoped readiness/configuration. `PATCH /v1/settings/audio` saves `{provider,apiKey?,removeApiKey?}`; keys are encrypted with `ORDO_CREDENTIAL_KEY` and never returned. New-key writes require HTTPS or exact loopback origins. `POST /v1/settings/audio/test` checks the saved provider configuration without sending audio. Providers are `workers_ai` (default: Workers AI Whisper `@cf/openai/whisper-large-v3-turbo` through the Worker's `AI` binding) and `openai` (the account's own key). Ordo never falls back from one to the other. Global OpenAI credentials are not inherited by accounts.

`POST /v1/transcriptions` requires `X-Ordo-Audio-Provider` (`workers_ai` or `openai`) alongside the displayed-account guard when resolving user settings. A stale or missing snapshot returns `409 AUDIO_SETTINGS_CHANGED` before sending audio. When Workers AI's daily free allowance is used up the response is `429 TRANSCRIPTION_ALLOWANCE_USED`; without a usable binding it is `503 WORKERS_AI_UNAVAILABLE`. The full error list is in the [transcriptions concept note](src/domains/transcriptions/transcriptions.md#workers-ai-whisper-default) and the [audio setup guide](../../docs/AUDIO-SETUP.md). Real Workers AI calls are verified in Phase 3.

Code email uses the Ordo HTML template by default (wordmark, orange accent, expiry/security copy, no remote assets). `GATEKEEPER_EMAIL_HTML=false` chooses the plain-text fallback. Sender delivery/domain identity remains controlled by the configured Gatekeeper service; the application supplies subject/body.

## AI capture

AI runs only when the person asks, and nothing is created until they save. The [capture concept note](src/domains/capture/capture.md) has the full rules, the providers and the Workers AI cost per capture.

| Method and path | Body / behavior |
|---|---|
| `POST /v1/notes/:id/process` | `{ workspaceId, projectId? }` → `201` with a run; `413 CAPTURE_TOO_LONG` or `400 CAPTURE_EMPTY` create no run |
| `GET /v1/notes/:id/capture-runs` | The note's runs, oldest first |
| `GET /v1/capture-runs/:id` | One owned run or 404 |
| `POST /v1/capture-runs/:id/save` | `Idempotency-Key` header; `{ workspaceId, projectId?, tasks, drafts }` with the edited items → `201 { run, tasks, drafts }`, or `200` for an identical retry; `409 RUN_ALREADY_SAVED`, `RUN_NOT_READY` or `IDEMPOTENCY_CONFLICT` |
| `GET /v1/drafts` | Active owned drafts, newest first; optional `?workspaceId=` and `?projectId=` filters |
| `GET /v1/drafts/:id` | Active owned draft or 404 |
| `POST /v1/drafts` | Required `workspaceId, kind, body`; optional `projectId, sourceNoteId, to, subject` |
| `PATCH /v1/drafts/:id` | Optional `workspaceId, projectId, kind, to, subject, body, used`; required `expectedRevision` |
| `DELETE /v1/drafts/:id` | Required `{ expectedRevision }`; soft archive |
| `GET /v1/settings/ai`, `PATCH /v1/settings/ai` | `{ textProvider?, apiKey?, removeApiKey?, keyProvider? }` → `{ textProvider, workersAiAvailable, hasOpenAiKey, hasAnthropicKey, configured }`. The OpenAI key is the account's one key, shared with transcription; keys are never returned |

A run is `{ id, noteId, noteRevision, workspaceId, projectId, status, provider, model, suggestions, errorCode, usage, saved, createdAt, updatedAt }` with `status` `ready | failed | pending | saved`. `suggestions` is `{ summary, tasks: [{ key, title, dueDate, dueTime, followUpDate, followUpTime, priority, responsiblePerson, waitingOn, isFollowUp }], drafts: [{ key, kind, to, subject, body }], destination: { workspaceId, projectId, confidence, reason } }`; a low-confidence destination has `projectId: null`. `usage` is `{ inputTokens, outputTokens, neurons }` (neurons for Workers AI only). A draft is `{ id, workspaceId, projectId, sourceNoteId, kind, to, subject, body, usedAt, revision, createdAt, updatedAt }`; Ordo never sends it.

## Archiving, deleting and related items

Details are in the [workspaces](src/domains/workspaces/workspaces.md#deleting-permanently) and [tasks](src/domains/tasks/tasks.md#related-items-and-links) concept notes. Archived workspaces and projects hide what is inside them from Home, lists, drafts and search; lists and search take `?includeArchived=1`.

| Method and path | Body / behavior |
|---|---|
| `GET /v1/workspaces/:id/delete-preview`, `GET /v1/projects/:id/delete-preview` | `{ name, projects, tasks, notes, drafts, captureRuns }`: what a permanent delete would remove |
| `DELETE /v1/workspaces/:id`, `DELETE /v1/projects/:id` | `{ confirmName, expectedRevision }` → `{ deleted: { projects, tasks, notes, drafts, captureRuns } }`; `400 CONFIRM_NAME_MISMATCH`, `409 REVISION_CONFLICT`, `409 LAST_WORKSPACE`; one batch, no orphans |
| `GET /v1/tasks/:id/related` | `{ sourceNote, linkedNotes, captureTasks, drafts }`; `?includeArchived=1` |
| `POST /v1/tasks/:id/links` | `{ noteId }` → `201` (or `200` if already linked) `{ taskId, noteId, createdAt }` |
| `DELETE /v1/tasks/:id/links/:noteId` | `204`, then `404` |

## Agent access and MCP

An assistant connects with a personal access token (`Authorization: Bearer ordo_pat_…`) that the owner creates and can revoke. The [agent access concept note](src/domains/agent-access/agent-access.md) has what a token may do, the MCP tools and how to connect Claude Code and Claude Desktop.

| Method and path | Body / behavior |
|---|---|
| `POST /v1/settings/agent-tokens` | Session only. `{ name, scopes: ["read"] or ["read","write"], expiresAt? }` → `201 { token, record }`; the token is shown only here. At most 20 active (`409 TOKEN_LIMIT`) |
| `GET /v1/settings/agent-tokens` | Session only. `[{ id, name, scopes, createdAt, expiresAt, lastUsedAt, revokedAt }]` |
| `DELETE /v1/settings/agent-tokens/:id` | Session only. Revokes; returns the record |
| `GET /v1/settings/agent-activity` | Session only. `?tokenId=&before=`; newest first, 100 a page; never content |
| `POST /api/mcp` | Token only. MCP over Streamable HTTP (JSON-RPC 2.0): `initialize`, `server/discover`, `ping`, `tools/list`, `tools/call` |

A token may use the read routes (with `read`) and, with `write`: create, edit, complete and archive tasks and notes, save captures, create workspaces and projects, and change a project's name, description and aliases. Anything else is `403 AGENT_NOT_ALLOWED`; a write with a read token is `403 INSUFFICIENT_SCOPE`. What a token creates has `origin: "agent"` and `createdByTokenId`; notes, workspaces and projects carry `origin` too.

Creating a workspace or project whose name an active one already has (ignoring case; for projects, in the same workspace) returns that one, `200` with `existing: true`, instead of a duplicate; a new one is `201` with `existing: false`. Both creates take an optional `Idempotency-Key` header. At most 50 active workspaces and 500 active projects (`409 LIMIT_REACHED`).
