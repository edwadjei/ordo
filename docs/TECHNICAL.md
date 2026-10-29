# Ordo — Technical Architecture

**Scope:** Implement the MVP defined in [`PRODUCT.md`](./PRODUCT.md) on Cloudflare.

**Architectural principle:** **Fast deterministic core; AI is asynchronous, optional, and replaceable.**

**Implementation status:** Ordo is hosted as one Cloudflare Worker, `ordo`, at https://ordo.edward-dejaysblog.workers.dev on the Workers Free plan, with the D1 database `ordo` (check-on-save writes, code-only sign-in, FTS5 search) and Workers AI Whisper transcription. Locally, `npm run dev` runs the same Worker under `wrangler dev` on a local D1 copy. The [hosting runbook](HOSTING-RUNBOOK.md) records each hosting step. Where a section is not yet true of the running code, the [delivery ledger](PLAN.md) says so.

## 1. Architecture at a glance

Ordo runs as **one Cloudflare Worker on the Workers Free plan**. The same Worker serves the web app as static files and the API under `/api`, so the browser talks to a single origin and the session cookie stays first-party. The database is Cloudflare D1 (SQLite). There is no server to patch, no container, no object store, and no monthly bill.

**Diagram:** [Ordo, hosted on Cloudflare](diagrams/ordo-architecture.html) shows what runs where today: the Worker, D1, Workers AI and Worker secrets inside Cloudflare, and Gatekeeper (sign-in codes) and optional OpenAI outside it.

```text
   Ordo Web (browser)      Ordo for iOS / Android      Ordo for Mac
   Next.js static export   Expo (React Native)         Tauri 2 shell
            │                       │                       │
            │  same-origin /api     │  HTTPS + bearer token │
            └───────────┬───────────┴───────────────────────┘
                        │
            ┌───────────▼─────────────────────────────┐
            │  Cloudflare Worker (Free plan)          │
            │  ├─ static assets  (web app, free)      │
            │  └─ Hono API under /api                 │
            │       platform / capabilities /         │
            │       adapters / domains                │
            └───────┬──────────────┬──────────────────┘
                    │              │
             Cloudflare D1    Workers secrets
             (SQLite + FTS5)  + Web Crypto
                    │
          ┌─────────▼──────────┐
          │ Later: Queues/cron │  → AI adapter layer (OpenAI, Anthropic, …)
          │ for AI workers     │     with account-owned keys
          └────────────────────┘
          Agent access later: REST + MCP over the same authorized services
```

**UI and API must never block normal create/edit flows on an AI request.** Captures first become durable records; analysis is a separate job. Ordo stores no audio or uploaded files.

## 2. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Hosting | **Cloudflare Workers, Free plan** | $0/month; global edge; static assets served free; one plan switch (not a rewrite) if limits are ever hit |
| Web frontend | **Next.js + TypeScript + React**, built with `output: 'export'` | Static files served by the Worker; no Node server to run |
| Design system | **Tailwind CSS + shadcn/ui + Lucide** | Consistent primitives without a bespoke framework |
| UI state | **TanStack Query + small local store** | Cache, optimistic updates, lightweight ephemeral state |
| API | **Hono + TypeScript + Zod** on Workers | Small, fast, built for the Workers runtime; keeps the DAMSYN-style platform / capabilities / adapters / domains structure and every current route |
| Database | **Cloudflare D1 (SQLite) + Drizzle (`sqlite-core`)** | Serverless SQL that lives next to the Worker; free tier covers a personal workspace comfortably |
| Migrations | **`wrangler d1 migrations`** | Numbered SQL files applied deliberately; nothing runs at Worker boot |
| Search | **SQLite FTS5** tables kept current by triggers | Ranked full-text search without a separate service |
| Concurrency | **Check-on-save** (conditional writes on `revision`) + atomic D1 `batch()` | Correct saves without locks, interactive transactions, or Durable Objects |
| Read consistency | **D1 Sessions API** with a bookmark header carried by `packages/client` | Each client reads its own saves immediately |
| Sign-in | **Email/phone six-digit OTP** via Gatekeeper; sessions as random tokens | Code-only; no passwords in hosted Ordo |
| Cryptography | **Web Crypto only** (`crypto.subtle`, `getRandomValues`, `randomUUID`) | Available in Workers and Node alike; fits the CPU budget |
| Secrets | **Workers secrets**; account-owned provider keys encrypted with AES-GCM | Nothing secret in code, Git, or responses |
| Mac desktop | **Tauri 2** | Small desktop package using the system WebView |
| Mobile | **Expo (React Native) for iOS and Android** | Shared native codebase; same API; token sign-in |
| Editor | **Tiptap** | Restrained rich text, loaded only on editing screens |
| AI text | **Provider abstraction for OpenAI and Anthropic** | Account-owned keys and model switching |
| Transcription | **Workers AI Whisper** (`whisper-large-v3-turbo`) by default; account-owned OpenAI key optional | Free within the daily Workers AI allowance; audio is never stored |
| Background work | **Cloudflare Queues / cron** when AI workers arrive | No Redis, BullMQ, or separate worker host |
| Agent access | **REST endpoints + MCP server** over the same authorized services | Works with scripts and compatible AI clients |

Avoid introducing separate microservices, Elasticsearch, dedicated vector databases, Kafka, Kubernetes, Redis, object storage, or Durable Objects for v1.

## 3. Free-plan budget

Cloudflare's Free plan limits shape the design. Over a limit, requests fail until 00:00 UTC; nothing is ever billed.

| Resource | Free-plan limit | Design rule |
|---|---|---|
| Worker requests | 100,000 per day | Static asset requests do not count; API calls do. A personal workspace is far below this |
| CPU time per request | 10 ms (I/O wait not counted) | Every request stays well under 10 ms CPU; no scrypt/bcrypt, no heavy JSON work |
| Memory | 128 MB | JSON bodies capped at 150,000 bytes; transcription audio capped at 20 MiB and held only for the request |
| Subrequests per request | 50 | A request makes a handful of D1 calls plus at most one provider call |
| Cron triggers | 5 | Enough for later AI/cleanup jobs |
| D1 rows read | 5 million per day | Index every owner-scoped query; FTS5 keeps search reads small |
| D1 rows written | 100,000 per day | Writes are per user action; triggers for FTS add a few rows each |
| D1 storage | 5 GB | Text-only data; no audio or files |

Upgrade path: Workers Paid ($5/month) if a limit is reached. That is a plan change, not an architecture change.

## 4. Monorepo layout

```text
apps/
  web/                 # Next.js static export, served by the Worker as assets
  api/                 # Hono API: platform / capabilities / adapters / domains, Worker entry
  mobile/              # Expo iOS/Android client (after web)
  desktop/             # Tauri 2 wrapper (after mobile)
  mcp/                 # MCP adapter calling authorized domain services (later)
packages/
  core/                # Domain types, Zod validation, authorization rules
  db/                  # Drizzle sqlite-core schema, D1 migrations, FTS definitions
  client/              # Typed API client, retry queue, bookmark header
  ui/                  # Shared components and design tokens (when reused)
  config/              # Shared lint/build/TypeScript configs
```

A **modular monolith** API in one Worker is the default. Split only where there is a clear runtime or security need.

## 5. Core data model

All user-owned records carry an owner and workspace-bound access checks. Identifiers are text UUIDs generated with `crypto.randomUUID()`. Timestamps are ISO-8601 text in UTC. Date-only fields (`YYYY-MM-DD`) and their optional `HH:MM` times are stored in separate columns, exactly as today. Soft deletion/archive is used where sensible.

### SQLite notes

| Concern | How Ordo handles it in D1 |
|---|---|
| IDs | `text` primary keys holding UUIDs |
| Dates and instants | ISO text; compared lexically; the user's timezone is applied at presentation |
| Booleans | `integer` 0/1 through Drizzle's `mode: 'boolean'` |
| JSON | `text` columns validated by Zod on read and write |
| Uniqueness | Unique indexes on email, phone, owner-scoped idempotency keys, OTP challenge IDs, and session digests |
| Foreign keys | Declared and enforced; owner columns on every user-owned table |
| Value rules | `CHECK` constraints for status, priority, `HH:MM` times, and "a time needs its date" |
| Revisions | `revision integer not null default 1`, incremented on every successful update |

### Tables

The D1 schema keeps today's tables and columns, translated to SQLite types:

| Table | Columns | Notes |
|---|---|---|
| `users` | id, email, phone, display_name, timezone, email_verified_at, phone_verified_at, demo_loaded, created_at, updated_at | No password column: hosted sign-in is code-only |
| `sessions` | token_hash (primary key), user_id, expires_at | SHA-256 digest of the token; the row is deleted on sign-out |
| `otp_challenges` | contact (primary key), challenge_id, code_hash, expires_at, next_send_at, window_started_at, requests, attempts, ready, consumed, consumed_by | One row per email/phone; holds the current code and the contact's rate-limit window |
| `auth_throttle` | key (route + client IP), window_started_at, count | Per-IP limits for sign-in routes |
| `workspaces` | id, owner_user_id, name, color, revision, created_at, updated_at | |
| `projects` | id, owner_user_id, workspace_id, name, description, revision, created_at, updated_at | Composite keys keep a project inside its workspace |
| `tasks` | id, owner_user_id, workspace_id, project_id, parent_id, title, description, status, priority, due_date, due_time, follow_up_date, follow_up_time, responsible_person, waiting_on, completed_at, deleted_at, revision, created_at, updated_at | Null workspace and project = personal Inbox |
| `idempotency_keys` | id, owner_user_id, key, fingerprint, task_id, created_at | Unique on (owner_user_id, key) |
| `notes` | id, owner_user_id, workspace_id, project_id, title, body, deleted_at, revision, created_at, updated_at | |
| `audio_settings` | owner_user_id (primary key), provider, encrypted_api_key, created_at, updated_at | Ciphertext only |
| `tasks_fts`, `notes_fts`, `projects_fts` | FTS5 virtual tables | Kept current by insert/update/delete triggers |

Later feature streams add **conversations**, **people**, **drafts**, **captures**, **ai_jobs**, **ai_suggestions**, **entity_links**, **api_tokens**, and **audit_events** with the same ownership rules. Attachments are not part of Ordo: audio and files are never stored.

### Database invariants

- A project's workspace must match the workspace of its tasks and notes.
- A child task's workspace and project must match its parent's, including the null Inbox scope.
- A task cannot be its own ancestor; cycles are rejected.
- Relationships across workspaces are **rejected by default**. Any supported cross-workspace view aggregates at the authenticated user's layer, never by merging AI context.
- Every query is authorized server-side, including background jobs and MCP calls.
- Unscoped capture lives in the personal Inbox (null workspace and project, never a null owner).

### Important indexes

`tasks(owner_user_id, status, due_date)`, `tasks(owner_user_id, project_id, parent_id)`, `tasks(owner_user_id, follow_up_date, status)`, `projects(owner_user_id, workspace_id, name)`, `notes(owner_user_id, updated_at)`, plus the FTS5 tables. Add `updated_at` indexes to support incremental sync.

## 6. Saving safely: check-on-save

D1 has no row locks or interactive transactions, and Ordo does not use Durable Objects. Instead, every save checks its own preconditions as part of the write. D1 runs writes one at a time on the primary database, and a `batch()` runs as a single transaction that rolls back completely if any statement fails.

| Rule | Mechanism |
|---|---|
| Edits never overwrite a newer version | `UPDATE … WHERE id = ? AND owner_user_id = ? AND revision = ?`; zero rows changed → `409 REVISION_CONFLICT` ("changed elsewhere"), nothing written |
| Retried creates never duplicate | The task insert and its `idempotency_keys` row go in one `batch()`. A repeated key violates the unique constraint and rolls the batch back; the API then reads the stored key: same fingerprint returns the original task, a different one returns `409 IDEMPOTENCY_CONFLICT` |
| Multi-row writes are all-or-nothing | One `batch()` per operation, e.g. demo fixtures, or the sign-in batch below |
| Hierarchy stays valid | Ancestry is read (bounded to 500 IDs) and checked for cycles, scope, and archived parents. The write is conditional on the task's revision **and** the revisions of every ancestor read, so a concurrent move anywhere in that chain refuses one of the two saves |
| No orphaned children | Archive and destination moves include `NOT EXISTS` (active children) in the `UPDATE`; a subtask insert requires its parent to still be active (`INSERT … SELECT … WHERE` parent active) |
| A code works exactly once | Compare-and-set on `consumed = 0` (see section 8) |
| Demo fixtures load once | The batch starts with a conditional `demo_loaded` claim and every fixture insert depends on that claim |

This gives the same user-visible guarantees as the locked transaction used today without holding anything open across requests.

## 7. Search

Each searchable table has an FTS5 companion kept in sync by triggers, so the API never rebuilds indexes and never runs migrations at boot:

- `tasks_fts`: title, description, responsible_person, waiting_on.
- `notes_fts`: title, body.
- `projects_fts`: name, description.

`GET /v1/search?q=…` runs a parameterized `MATCH` with `bm25()` ranking, filters by owner and active rows, and returns at most 30 results with plain-text excerpts. Query text is quoted into plain search terms; it is never interpreted as SQL or raw FTS syntax. Token search with stemming is intentional; this is not fuzzy or semantic search.

## 8. Authentication and sessions

Hosted Ordo is **code-only**: email or Ghana phone, then a six-digit code delivered through Gatekeeper. There is no password login on the hosted platform. A legacy local password account converts at its first code sign-in, keeping its ID and data.

| Element | Design |
|---|---|
| OTP code | Six digits from `getRandomValues`; stored as **HMAC-SHA256(challenge ID + code, `OTP_HMAC_KEY`)**. HMAC fits the CPU budget, and it is safe because codes expire in five minutes, allow five attempts, and cannot be guessed offline without the Worker secret |
| Request limits | 60-second resend spacing and five sends per 15-minute window, enforced by **one upsert** on the contact's `otp_challenges` row (`INSERT … ON CONFLICT(contact) DO UPDATE … WHERE` the limits allow it). No row returned → `429 RATE_LIMITED`. Resending does not reset failed attempts |
| Verify, step 1 | One atomic attempt increment: `UPDATE otp_challenges SET attempts = attempts + 1 WHERE challenge_id = ? AND consumed = 0 AND ready = 1 AND expires_at > ? AND attempts < 5 RETURNING code_hash`. No row → refused |
| Verify, step 2 | Constant-time comparison of the HMAC of the submitted code with `code_hash` |
| Verify, step 3 | One `batch()`. It starts with the compare-and-set `UPDATE otp_challenges SET consumed = 1, consumed_by = ? WHERE challenge_id = ? AND consumed = 0`, using a fresh per-request value. Every later statement (create or link the account, mark the contact verified, delete old sessions on conversion, insert the new session) only takes effect where that challenge is claimed by this request's value. A second request with the same code claims nothing and writes nothing, so a code works exactly once |
| Session token | 32 random bytes (hex); stored as a SHA-256 digest; seven-day expiry; deleted on sign-out |
| Web transport | `ordo_session` cookie: HttpOnly, SameSite=Lax, Secure, Path=/, on the same origin. Every mutation's `Origin` must match a trusted origin |
| Native transport | Bearer token in `Authorization`, stored in Keychain/Keystore, revocable on the server; designed alongside the Hono port |
| Abuse control | Per-IP limits on sign-in routes stored in `auth_throttle`, keyed by `CF-Connecting-IP`, as one upsert per request. Sign-out is never throttled |
| Account guard | Optional `X-Ordo-Account` header; mismatch → `409 SESSION_CHANGED` |



## 9. Secrets and cryptography

- All cryptography uses Web Crypto: `crypto.subtle` for HMAC, SHA-256, and AES-GCM; `getRandomValues` and `randomUUID` for randomness and IDs.
- Worker secrets (`wrangler secret put`) hold `OTP_HMAC_KEY`, `ORDO_CREDENTIAL_KEY` (the credential master key), `GATEKEEPER_API_KEY`, and `GATEKEEPER_API_URL`. They never appear in code, Git, logs, screenshots, or responses. Documentation names them; only Cloudflare holds their values.
- Account-owned provider keys (for transcription or AI) are encrypted with AES-256-GCM, a fresh 96-bit nonce, and the owner ID as additional authenticated data. Only ciphertext is stored. Another account cannot use the ciphertext because decryption authenticates owner identity.
- The Worker uses no scrypt, bcrypt, or Argon2: they do not fit 10 ms CPU and are not needed for a code-only sign-in.



## 10. API design — REST v1

Browsers call `/api/...` on the Worker's origin, which maps to the API's `/v1/...` routes exactly as the local dev proxy does today, so paths and camelCase payloads stay unchanged. Controllers validate with the shared Zod schemas in `packages/core`.

| Route | Purpose |
|---|---|
| `GET /health`, `GET /v1/capabilities` | Public liveness and configuration availability |
| `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `GET /v1/auth/me`, `POST /v1/auth/logout` | Code-only sign-in and session lifecycle (the local build also keeps legacy `register`/`login` routes; hosted Ordo does not serve them) |
| `GET /v1/home` | Today, overdue, waiting, upcoming, inbox snapshot |
| `GET/POST /v1/workspaces`, `GET/PATCH /v1/workspaces/:id`, `GET/POST /v1/workspaces/:id/projects` | Workspaces and their projects |
| `POST /v1/projects`, `GET/PATCH /v1/projects/:id` | Project details |
| `GET/POST /v1/tasks`, `GET/PATCH/DELETE /v1/tasks/:id` | Tasks, subtasks, archive |
| `GET/POST /v1/notes`, `GET/PATCH/DELETE /v1/notes/:id` | Notes |
| `GET /v1/search?q=...` | Authorized cross-entity search |
| `GET/PATCH /v1/settings/audio`, `POST /v1/settings/audio/test` | Per-account transcription provider |
| `POST /v1/transcriptions` | Memory-only transcription; audio discarded |
| `POST /v1/demo` | Explicit fictional fixtures, once per account |
| Later: `/v1/conversations`, `/v1/captures`, `/v1/ai-jobs`, `/v1/sync/changes?cursor=…` | Intelligent capture and incremental sync |

**Guidelines:**

- Normal task creation must **not** call an LLM.
- `POST /v1/tasks` requires `title`, an `Idempotency-Key`, and an authorized destination (workspace or Inbox).
- PATCH and DELETE require `expectedRevision`; stale revisions are refused without writing.
- Commit selections must be atomic and idempotent so retried requests do not duplicate tasks.
- Long-running jobs use polling; SSE is not required for the basic task UI.
- Rate-limit agent and import endpoints; cap payload sizes.
- Every API response carries the `X-Ordo-Bookmark` header; clients send it back on their next request.

## 11. Read consistency and sync

D1 read replicas can lag briefly behind a write. Ordo uses the **D1 Sessions API**: each request opens a session from the bookmark the client last saw, and the response returns the new bookmark. `packages/client` stores and forwards that value in the `X-Ordo-Bookmark` header, so web and mobile always read their own saves. Sessions work whether or not read replication is switched on for the database.

**MVP approach: offline-capable capture, online source of truth.**

- Cache navigation and recently loaded items where safe.
- Store unsynced quick task captures in local durable storage with a sync queue and idempotency keys (localStorage today; platform storage on mobile).
- Detect conflicts: do not silently replace the user's edited content. Latest-write for simple non-overlapping metadata; an explicit conflict UI for concurrently edited bodies.
- Users must see the actual sync state; background sync is best-effort.

## 12. MCP interface — minimal and safe

Expose an MCP server backed by the **same authorized domain services** as REST. Example tools: `list_workspaces`, `list_projects`, `search_items`, `list_tasks`, `create_task`, `update_task`, `complete_task`, `create_note`, `create_conversation`, `get_project_context`, `create_capture`.

**Security:** each MCP client uses a short-lived OAuth flow or a revocable, scoped personal access token. Enforce scopes and workspace allowlists on the server; never rely on prompt instructions for access control. Reject ambiguous destinations instead of guessing. Token material must never enter agent context or logs. **MCP is not a database connection**: all operations go through validated, audited services with the same rules as the app.

## 13. AI processing pipeline

```text
User capture (text / live audio)
  → Durable capture record (text only; audio is transcribed in memory and discarded)
  → Queue or cron job (Cloudflare Queues / cron trigger)
  → Normalize text and metadata
  → Apply active workspace/project context and allowed project glossary
  → Selected provider (account-owned key)
  → Structured, schema-validated suggestions
  → Staged preview for user review
  → User edits/selects
  → Atomic commit: notes/tasks/drafts + provenance links
```

### Input handling

- **Text / pasted email:** store exact source and metadata; allow immediate manual save.
- **Audio:** record with visible state and explicit permission; the bytes exist only in memory while a transcription request runs, then are cleared. Transcription uses Workers AI Whisper by default (free within the daily allowance) or the account's own OpenAI key when chosen in Settings.
- **Files:** not stored by Ordo. Transcript import will accept text and process it as a capture.
- **Large inputs:** chunk and summarize asynchronously while preserving provenance; never drop names or dates silently.

### Provider abstraction

```ts
interface LanguageProvider {
  extractActions(input: ExtractionRequest): Promise<ExtractionResult>;
  draftMessage(input: DraftRequest): Promise<DraftResult>;
}
interface TranscriptionProvider {
  transcribe(input: AudioBytes): Promise<TranscriptResult>;
}
```

Support OpenAI and Anthropic text models with **account-owned API keys**. Transcription is a separate capability: not every text provider handles audio.

### Structured output validation

- Require Zod validation and server normalization before surfacing suggestions.
- Classify each suggestion: explicit action, suggested action, informational note, or draft.
- Confidence is advisory only, never a basis for automatic irreversible decisions.
- If uncertain about names, projects, dates, or ownership, return `null` + `needs_confirmation`.
- Meeting content is **data**, never instructions authorizing tool calls or cross-workspace access.
- LLM-generated JSON never writes to the database directly; commits go through normal authenticated validation.

### Relative dates

Supply `captured_at`, `user_timezone`, and an optional conversation date. Resolve "Friday" relative to the conversation date where reliably known; otherwise request confirmation.

## 14. Privacy and tenant isolation

1. Authenticate all users and agents; authorize every read, write, search, and job.
2. Store no audio or uploaded files. Only transcript text the user explicitly saves persists.
3. Encrypt in transit (Cloudflare TLS) and at rest (D1 storage plus AES-GCM for provider keys); audit key actions without logging raw content.
4. Never assemble AI prompts from other workspaces unless the user explicitly authorizes a narrowly scoped cross-workspace operation.
5. Maintain workspace-level AI controls: disabled, provider permitted, optional retention rules.
6. Show a clear notice before third-party AI processing of employer or confidential content; owning an API key does not grant approval to send employer data.
7. Support export, deletion, backup/restore (D1 Time Travel and exports), and revocation of agent tokens.
8. Keep temporary AI job artifacts on a restrictive default retention.

## 15. Performance budgets

| Metric | Target |
|---|---|
| Worker CPU per API request | < 10 ms hard limit; design for low single digits |
| Typical authenticated API read | < 300 ms p95 server response, excluding network variance |
| Input feedback | < 100 ms p95 on a modern Mac |
| Cached workspace/project navigation | < 300 ms p95 |
| Add task optimistic rendering | < 100 ms p95 |
| JS bundle | Monitor and minimize the initial route payload |
| AI processing | Clearly asynchronous with progress/retry; no pretend instantaneous SLA |

Instrument cold start, interaction latency, error rate, sync failures, and AI job outcomes without collecting content.

## 16. Platform-specific notes

### Web

Built with Next.js `output: 'export'` and served as Worker static assets. The API lives under `/api` on the same origin, so no CORS configuration is needed. During local development the Next dev server proxies `/api` to the API process. **Implementation status:** `npm run build` writes the export to `apps/web/out`, which `wrangler dev` serves locally; `npm run dev` runs Next dev on 3358 proxying `/api` to the Worker on 8788.

### iOS / Android (Expo)

Same REST API with bearer-token sign-in. Tokens live in Keychain/Keystore and can be revoked server-side. Feature-detect recording, file, and background constraints per platform; do not promise background recording without evidence.

### macOS (Tauri)

The shared web UI runs inside Tauri against the hosted API. Plan signing/notarization and explicit microphone permissions. Menu bar quick capture and shortcuts come after the core experience works.

## 17. Testing strategy

- **Domain tests:** hierarchy integrity, authorization, date interpretation, status transitions, cycles.
- **API contract tests:** schema validation, idempotency, revision conflicts, permission failures, token scopes. Phase 1 runs them in Node against the Hono app; Phase 2 runs them against a local D1 database.
- **Concurrency tests:** two writers on one record (one wins, one gets 409); a code used twice (second refused); retried create (one row).
- **AI tests:** fixture transcripts with explicit and ambiguous items, prompt injection, duplicates, date uncertainty.
- **Privacy/security tests:** IDOR attempts, cross-workspace search, leakage in logs, revoked tokens, key handling.
- **Budget tests:** CPU time per request measured in `wrangler dev`; row reads per endpoint checked against the free-plan table.

## 18. Build roadmap (vertical slices)

| Phase | Deliverable |
|---|---|
| Everyday core (merged to `main`, verified locally) | Workspaces/projects/tasks/subtasks/notes; My Day/Inbox/Waiting On/Upcoming; quick add, search; OTP sign-in; memory-only transcription |
| Hosting Phase 1 | Hono port, Web Crypto adapters, web static export; runs locally in Node on the existing database so all tests keep passing |
| Hosting Phase 2 | D1 schema and migrations, FTS5 search, check-on-save, sign-in rewrites, Worker entry and `wrangler dev`, local data import, local D1 test harness |
| Hosting Phase 3 | Staging on Edward's Cloudflare account with owner-approved deploys, backups, rollback point, and signed-in verification |
| Native mobile | Expo iOS (urgent) then Android against the hosted API |
| AI-assisted capture | Captures, async extraction via Queues/cron, validated staging, provenance, provider policies |
| Agent access and Mac | Documented REST, scoped MCP, audit trail, Tauri packaging |

## 19. Definition of done

Do **not** call the MVP complete unless a user can:

1. Open a polished, responsive Home and see **Add Task**, **Record**, **Quick Note**, **Upload Transcript**, and **AI Capture** immediately.
2. Jump into MTN and navigate 20+ projects without clutter or lag.
3. Create a task in seconds without configuring any AI key.
4. Capture an informal conversation and review linked task/draft suggestions.
5. Import and process a transcript without losing the original text.
6. Use task/subtask editing, notes, Waiting On, and My Day across workspaces.
7. Connect an authorized MCP client to create or update a task in an allowed project.
8. Verify that cross-workspace reads are blocked by default and sensitive content is not sent to an AI provider without permission.
9. Recover cleanly from offline changes, failed requests, and AI errors.
10. Use web, the native mobile app, and the packaged Mac app for the supported core workflows, all against the hosted Worker.

## 20. Implementation instructions

- Read `PRODUCT.md`, this file, and the [Cloudflare platform spec](specs/02-cloudflare-platform.md) before making changes. Treat UX simplicity and data isolation as acceptance criteria, not polish.
- Build **working vertical slices**, not static mocks.
- Keep every request under the CPU budget; measure in `wrangler dev` before claiming it.
- Preserve data provenance for AI-derived tasks and drafts.
- Never send email automatically or create large batches of AI suggestions without a review path.
- Document setup, secret names (never values), migration commands, privacy defaults, provider selection, and MCP client configuration.
- Measure responsiveness on a Mac-class device and at mobile widths before expanding scope.

**North star:** Capture instantly. Organize correctly. Act confidently. Stay out of the user's way.
