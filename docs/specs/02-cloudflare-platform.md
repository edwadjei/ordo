# Spec 02 — Ordo on Cloudflare

**Status:** Decided by Edward on 27 October 2026 ("aligned"; "I don't want to pay $5"). Documentation first, then Phase 1.

**Implementation status:** Phases 1 and 2 are delivered and Workers AI transcription is merged: Ordo runs as one Worker on D1 under `wrangler dev`. Phase 3 is prepared but not started. Edward chose one hosted deployment ("just ordo"): Worker `ordo` with D1 `ordo` at `https://ordo.edward-dejaysblog.workers.dev`, run with production care. Its settings are at the top level of `apps/api/wrangler.jsonc`, and the steps are in the [hosting runbook](../HOSTING-RUNBOOK.md). Nothing has been created on Cloudflare; each step on Edward's account runs only with his approval.

**References:** [Technical architecture](../TECHNICAL.md), [API architecture](../API-ARCHITECTURE.md), [everyday core spec](01-everyday-core.md), [decision register](../coordination/DECISIONS.md), [Phase 1 brief](../coordination/CLOUDFLARE-PHASE-1-BRIEF.md).

## Goal

Host Ordo for $0/month on the Cloudflare Workers Free plan with Cloudflare D1 as the database, without giving up any current route, contract, privacy rule, or test. The web app, API, and database live together on Cloudflare; native mobile and Mac clients use the same hosted API.

## Phases

| Phase | Scope | Runs on | Size |
|---|---|---|---|
| 1 — Hono port | Web Crypto adapters; framework-neutral HTTP layer; Hono app with a test shim replacing `app.inject`; secret cipher and transcription capability flags; Fastify removed; web static export with same-origin `/api`; bookmark header plumbing stubbed | Node locally, on the existing embedded database, so every test keeps passing | About five PRs ([brief](../coordination/CLOUDFLARE-PHASE-1-BRIEF.md)) |
| 2 — D1 | SQLite schema and `wrangler d1` migrations; FTS5 search; check-on-save; sign-in rewrites; Worker entry and `wrangler dev`; local data import; test harness on local D1; local-dev docs | `wrangler dev` with a local D1 database | Briefed after Phase 1 merges |
| 3 — Hosted staging | Worker and D1 on Edward's Cloudflare account; D1 restore point as backup; recorded rollback point; signed-in verification | Cloudflare Workers Free plan | Each deploy approved by Edward |

Specialists run on Opus 5.5 at medium effort under coordinated-development: a backend specialist (`apps/api`, `packages/core`, `packages/db`) and a web specialist (`apps/web`, `packages/client`). The coordinator owns docs, root tooling, and integration evidence. Edward approves every merge and deploy.

## Architecture

One Cloudflare Worker does three jobs:

| Job | How | Cost |
|---|---|---|
| Serve the web app | Next.js `output: 'export'` files uploaded as Worker static assets | Free; asset requests do not count toward the request limit |
| Serve the API | Hono app mounted under `/api`, same origin as the web app | Counts toward 100,000 requests/day |
| Talk to the database | D1 binding (SQLite) through Drizzle `sqlite-core` | Counts toward D1 row read/write limits |

No CORS is needed because the browser only ever talks to its own origin. The session cookie stays first-party. `/api/...` maps to the API's `/v1/...` routes, exactly as the local dev proxy does today, so no client path changes. Upgrade path: Workers Paid ($5/month) if a limit is hit; a plan switch, not a rewrite.

### Costs

| Item | Cost |
|---|---|
| Workers Free plan and D1 free tier | $0/month |
| Domain name (optional) | About $10/year; `*.workers.dev` costs nothing |
| Transcription and AI | Billed by each user's own provider account (account-owned keys) |

### Request flow

```text
Browser / app
  → Cloudflare edge (TLS)
  → Worker
     ├─ path does not start with /api  → static asset (web app)
     └─ path starts with /api
          → Hono router
          → platform: origin check, session resolution, IP throttle, account guard
          → domain controller: Zod validation
          → domain service: rules, revision checks
          → repository: Drizzle on the D1 binding (Sessions API with client bookmark)
          → response + D1 bookmark header
```

## Free-plan budget

Numbers are from Cloudflare's published Free-plan limits. Over a limit, requests fail until 00:00 UTC; nothing is billed.

| Resource | Limit | Ordo target |
|---|---|---|
| Worker requests | 100,000 / day | A personal workspace uses a few thousand API calls a day at most |
| CPU per request | 10 ms | Reads: < 3 ms. Writes: < 5 ms. OTP verify (HMAC + batch): < 5 ms. Search: < 5 ms |
| Memory | 128 MB | Body limit 150,000 bytes; transcription uploads capped at 20 MiB and streamed to the provider |
| Subrequests | 50 / request | At most ~6 D1 statements plus one provider call per request |
| Cron triggers | 5 | Reserved for later AI/cleanup jobs |
| D1 rows read | 5,000,000 / day | Every query filters by owner and uses an index; Home snapshot reads only active rows |
| D1 rows written | 100,000 / day | One user action = a handful of rows (entity + FTS trigger rows + idempotency/revision) |
| D1 storage | 5 GB | Text only; no audio or files |

Design rule: **every request must stay well under 10 ms CPU.** I/O wait does not count, so D1 and provider calls are fine; heavy hashing and large in-memory transforms are not.

## Design decisions and rules

### API: Hono on Workers

- Keep the DAMSYN-style `platform/`, `capabilities/`, `adapters/`, `domains/` structure and every current route, payload, and error code. Zod validation stays in `packages/core`.
- The HTTP layer is framework-neutral inside domains: controllers receive a small request/response abstraction and never import Hono types directly, so tests and the Node shim stay simple.
- The Worker entry (`apps/api/src/worker.ts`) wires the D1 binding, secrets, and the Hono app. A Node entry runs the same app locally.

### Database: D1 with Drizzle

- Schema in `packages/db/src/schema.ts` using `drizzle-orm/sqlite-core`. Text UUID IDs; ISO text timestamps; date-only `YYYY-MM-DD` plus separate `HH:MM` time columns as today.
- Migrations are numbered SQL files applied with `wrangler d1 migrations apply`. **No migrations run at Worker boot.**
- Search: FTS5 virtual tables (`tasks_fts` including `responsible_person` and `waiting_on`, `notes_fts`, `projects_fts`) kept in sync by insert/update/delete triggers. Queries use parameterized `MATCH` with `bm25()` ranking; archived rows are excluded; results are capped at 30.
- Drizzle's `mode: 'boolean'` for flags; JSON as validated text.

### Saving safely: check-on-save

No locks, interactive transactions, or Durable Objects.

| Case | Rule |
|---|---|
| Update or archive | `UPDATE … WHERE id = ? AND owner_user_id = ? AND revision = ?`. Zero rows → `409 REVISION_CONFLICT`, message "changed elsewhere", no write |
| Create with retry | Idempotency key is a unique constraint `(owner_user_id, key)`. Insert the task and the key row in one `batch()`. Same key, same fingerprint → return original (200). Different fingerprint → `409 IDEMPOTENCY_CONFLICT` |
| Hierarchy change | Read ancestry (bounded to 500 IDs) and check cycle, scope, and archived parent. The `UPDATE` is conditional on the task's revision and on the revisions of every ancestor read, so a concurrent move anywhere in that chain makes one of the two saves fail with `409 REVISION_CONFLICT` |
| Move/archive with children | The `UPDATE` includes `NOT EXISTS (active child)`. A subtask insert is `INSERT … SELECT … WHERE` the parent is still active and in the same destination. A refused statement returns `409 HAS_SUBTASKS` or `404`/`409` as today |
| Demo fixtures | The batch starts with `UPDATE users SET demo_loaded = 1 WHERE id = ? AND demo_loaded = 0`; each fixture insert is conditional on that claim, so a repeated request inserts nothing |
| Multi-row writes | One D1 `batch()` per operation (implicit transaction) |

### Sign-in: code-only

- Email or Ghana phone, six-digit code delivered by Gatekeeper. **Password login is not part of hosted Ordo.** A legacy local password account converts at its first successful code sign-in: it keeps its ID and data, and its old sessions are deleted. The Phase 2 import never copies password hashes.
- Code hash: `HMAC-SHA256(challengeId + code, OTP_HMAC_KEY)` using a Worker secret. Safe because codes expire in five minutes, attempts are capped at five, and nobody can test guesses offline without the secret. Fits the CPU budget where scrypt does not.
- Code requests: one upsert on the contact's `otp_challenges` row (`INSERT … ON CONFLICT(contact) DO UPDATE SET … WHERE` resend spacing has passed and the 15-minute window allows another send, `RETURNING challenge_id`). No row returned → `429 RATE_LIMITED`. Limits: 60-second spacing, five sends and five attempts per window; resending never resets attempts.
- Verify flow, three steps:
  1. One atomic attempt increment: `UPDATE otp_challenges SET attempts = attempts + 1 WHERE challenge_id = ? AND consumed = 0 AND ready = 1 AND expires_at > ? AND attempts < 5 RETURNING code_hash`. Zero rows → refused.
  2. Constant-time comparison of the HMAC of the submitted code with `code_hash`. Mismatch → refused (the attempt is already counted).
  3. One `batch()`. Its first statement is the compare-and-set `UPDATE otp_challenges SET consumed = 1, consumed_by = ? WHERE challenge_id = ? AND consumed = 0`, with a fresh random value for this request. Every following statement (create or link the account, mark the contact verified, delete old sessions on conversion, insert the new session) carries `WHERE EXISTS (SELECT 1 FROM otp_challenges WHERE challenge_id = ? AND consumed_by = ?)`. A second request using the same code claims nothing, writes nothing, and is refused, so a code works exactly once.
- Sessions: 32 random bytes, stored as a SHA-256 digest; seven-day expiry; deleted on sign-out.
- Per-IP limits for sign-in routes in the `auth_throttle` table, keyed by route and `CF-Connecting-IP`, as one upsert per request (12 per minute, as today). Sign-out is never throttled.
- Native clients: bearer token in `Authorization`, stored in Keychain/Keystore, revocable on the server; same `sessions` table, different transport.

### Secrets and cryptography

- Workers secrets: `OTP_HMAC_KEY`, `ORDO_CREDENTIAL_KEY`, `GATEKEEPER_API_KEY`, `GATEKEEPER_API_URL`. Names only in docs; values only in Cloudflare.
- Account-owned provider keys encrypted with AES-256-GCM via `crypto.subtle`, fresh 96-bit nonce, owner ID as additional authenticated data.
- Web Crypto only: `crypto.subtle`, `getRandomValues`, `randomUUID`. No Node `crypto` imports in the API.

### Transcription

- Audio is never stored (C20). Bytes exist in memory only while the provider request runs.
- Ordo transcribes with **Workers AI Whisper** (`@cf/openai/whisper-large-v3-turbo`) through the Worker's `AI` binding. It is free within the daily allowance of 10,000 neurons (about 214 audio minutes at 46.63 neurons per minute); on the Free plan, use beyond that fails until 00:00 UTC and is never billed, and the user sees a clear message.
- An account-owned OpenAI key (`gpt-4o-mini-transcribe`, $0.003 per minute, billed to that key) is an optional provider chosen in Settings. Ordo never switches provider silently.
- Workers AI always runs on Cloudflare, so local development without an account transcribes only with a saved OpenAI key. **Implementation status:** delivered ([Workers AI transcription brief](../coordination/WORKERS-AI-TRANSCRIPTION-BRIEF.md)); the hosted Worker turns it on with `ORDO_WORKERS_AI=on`.

### Read consistency

- D1 Sessions API: each request opens a session from the bookmark the client last saw and returns the new bookmark in a response header. `packages/client` stores the latest bookmark and sends it on the next request, so web and mobile read their own saves immediately.

### Background work

- Cloudflare Queues or cron triggers when AI workers arrive; availability on the Free plan is confirmed at that point. No Redis or BullMQ.

### Files

- None. Audio and file storage are excluded; there is no object store.

### Clients

- **Web:** Next.js static export, same-origin `/api`, dev proxy kept for local work.
- **Mobile (Expo iOS/Android):** same API; token sign-in designed alongside the Hono port.
- **Mac (Tauri):** unchanged in principle; targets the hosted API.

## Data import from the local database

Phase 2 provides a one-time import so Edward's local content moves to D1:

1. Export the local database tables to JSON (one file per table) with a small script in `packages/db`. Users, workspaces, projects, tasks, idempotency keys, notes, and audio settings are exported; sessions, OTP challenges, and password hashes are not, so everyone signs in again with a code.
2. Transform: timestamps to ISO text, booleans to 0/1, keep IDs and revisions. Encrypted provider keys are copied only if the same `ORDO_CREDENTIAL_KEY` is set as the Worker secret; otherwise they are dropped and the owner re-enters the key in Settings.
3. Load into a local D1 database with `wrangler d1 execute --local` in batches; FTS triggers populate the search tables.
4. Verify counts per table and a signed-in browser check against `wrangler dev`.
5. Repeat the same import against staging only when Edward approves.

## Testing strategy

| Phase | Where tests run | What they prove |
|---|---|---|
| Phase 1 | Node, against the Hono app through a test shim replacing `app.inject`, on the existing embedded database | Every current API test passes unchanged in behaviour; Web Crypto adapters match the old outputs for sessions and content hashes |
| Phase 2 | Node, against a local D1 database (Miniflare / `wrangler dev` test environment) | Same suites plus concurrency scenarios: two writers on one record, a code used twice, a retried create, a batch that must roll back |
| Phase 3 | Signed-in browser checks on staging | Real sign-in, saves, search, and reload against the hosted Worker; CPU time per request from Cloudflare observability |

## Acceptance scenarios

### Phase 1 — Hono port

- `npm test` passes with the Hono app and Web Crypto adapters; no Fastify dependency remains.
- `npm run dev` still starts web and API locally on the existing database; the signed-in browser journeys in the verification record still pass.
- `apps/web` builds with `output: 'export'`; the exported site, served next to the API, signs in and saves a task using same-origin `/api`.
- Secret-cipher and transcription capabilities are flagged so a server without a usable transcription provider reports it unavailable instead of failing.

### Phase 2 — D1

- `wrangler d1 migrations apply --local` creates the schema and FTS tables from the numbered files; the Worker never runs migrations itself.
- All API tests pass against local D1, including the concurrency scenarios above.
- Search returns ranked tasks (including people names), notes, and projects from FTS5.
- OTP sign-in works end-to-end in `wrangler dev` with an injected delivery transport; a reused code is refused.
- Local data import loads Edward's content into local D1 with matching counts.
- Local-dev documentation lets a fresh machine run `wrangler dev` without a Node API process.

### Phase 3 — hosted staging

The step-by-step procedure, with the approvals each step needs, is the [hosting runbook](../HOSTING-RUNBOOK.md).

- Edward approves account access and each deploy. Backups via D1 export/Time Travel; the rollback point is recorded in the ledger.
- Signed-in verification on staging: sign-in, task create/edit/complete, note save, search, reload.
- Observed CPU time per request and daily request/row counts recorded against the budget table.

## Risks

| Risk | Mitigation |
|---|---|
| A request exceeds 10 ms CPU (large Home snapshot, big note) | Measure in `wrangler dev`; paginate or trim the snapshot; keep payload caps |
| D1 replica lag shows a stale list after a save | Sessions API bookmark on every request from `packages/client` |
| Check-on-save misses a race the old row lock caught | Concurrency tests in Phase 2; every write is conditional on revision or a unique constraint |
| Free-plan daily limit reached | Requests fail until 00:00 UTC, never billed; switch to Workers Paid if it recurs |
| Gatekeeper or OpenAI outage | Clear error states; captures remain saveable without AI; audio is never stored, so nothing is lost silently |
| Secret loss (`ORDO_CREDENTIAL_KEY`) | Users re-enter provider keys; document the secret as backed up outside D1 |

## Open questions for Edward

1. **Queues on the Free plan:** confirm availability when AI workers start; fall back to cron triggers if not.
2. **Domain name:** use the `*.workers.dev` subdomain for now, or register a domain (~$10/year)?
3. **Mobile token design:** token lifetime, refresh behaviour, and a sign-out-everywhere control before the Expo client starts.
