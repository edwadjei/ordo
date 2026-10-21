# Personal AI Workspace — Technical Architecture

**Version:** 1.0  
**Scope:** Implement the MVP defined in [`PRODUCT.md`](./PRODUCT.md)  
**Architectural principle:** **Fast deterministic core; AI is asynchronous, optional, and replaceable.**

## 1. Architecture at a glance

```text
           Next.js / React UI (responsive web + PWA)
                         │
              Tauri 2 macOS shell
                         │
                  HTTPS / SSE
                         │
                  Fastify API
              ┌──────────┼───────────┐
              │          │           │
         PostgreSQL   Object      Background
         + Drizzle    Storage       Workers
              │          │           │
              │          └─────┬─────┘
              │                │
              │        AI Adapter Layer
              │     ┌──────┼──────────┐
              │  OpenAI  Anthropic  Local*
              │           Models
              │
        Agent Integration
        REST API + MCP Server
```

`*` Local model / local transcription is **optional and capability-dependent**, not an assumption that every user device can run an effective model.

**UI and API must never block normal create/edit flows on an AI request.** Captures first become durable local or server records; analysis is a separate job.

## 2. Recommended technology stack

| Layer | Choice | Why |
|---|---|---|
| Web frontend | **Next.js + TypeScript + React** | Shared responsive UI, established ecosystem |
| Design system | **Tailwind CSS + shadcn/ui + Lucide** | Consistent polished primitives without a large bespoke framework |
| UI state | **TanStack Query + small local store (e.g. Zustand)** | Cache, optimistic updates, lightweight ephemeral state |
| Mac desktop | **Tauri 2** | Small desktop package using system WebView; assess OS WebView differences |
| Mobile MVP | **Responsive installable PWA** | Single codebase; audio/file support tested across Safari/Chrome |
| API | **Fastify + TypeScript + Zod** | Compact, typed, fast JSON endpoints |
| Persistence | **PostgreSQL + Drizzle ORM** | Relational integrity for hierarchy, source linkage, workspace isolation |
| Search | **PostgreSQL full-text/trigram indexes** | Good MVP search without a separate vector service |
| Background work | **Redis-backed queue (BullMQ) or Postgres job queue** | Resumable extraction/transcription; choose one, not both |
| Attachments | **S3-compatible private object store** | File/recording storage with signed URLs and lifecycle policies |
| Editor | **Tiptap** | Restrained rich text, loaded only on editing screens |
| Auth | **Session/OIDC-compatible solution** | Secure web and desktop authentication |
| AI text | **Provider abstraction for OpenAI and Anthropic** | BYOK and model switching |
| Transcription | **Whisper-compatible hosted endpoint; optional local implementation** | Start reliable; add device-specific local support later |
| Agent access | **REST endpoints + MCP server** | Works with scripts and compatible AI clients |
| Deployment | **Single region API + Postgres + object store** | Operationally simple MVP |

Avoid introducing separate microservices, Elasticsearch, dedicated vector databases, Kafka, or Kubernetes for v1.

## 3. Monorepo layout

```text
apps/
  web/                 # Next.js web, PWA, shared responsive experience
  desktop/             # Tauri 2 wrapper and OS-specific integrations
  api/                 # Fastify API
  worker/              # AI processing, transcription and imports
  mcp/                 # MCP adapter calling authorized domain API
packages/
  ui/                  # Shared components and design tokens
  db/                  # Drizzle schema, migrations, repositories
  core/                # Domain types, validation, authorization rules
  ai/                  # Provider adapters, prompts, extractors, schemas
  client/              # Typed API client
  config/              # Shared lint/build/TypeScript configs
```

A **modular monolith** API is the default. Split workers or MCP deployments only where there is a clear runtime/security need.

## 4. Core data model

All user-owned records include ownership and workspace-bound access checks. Use UUID/ULID identifiers, UTC timestamps in storage, user timezone for presentation, explicit `created_at` / `updated_at`, and soft deletion/archive where sensible.

### Tables

**users** — id, email, display_name, timezone, preferences_json, created_at.  
**workspaces** — id, owner_user_id, name, slug, icon, description, ai_policy, created_at, archived_at.  
**projects** — id, workspace_id, name, aliases_json, description, status, favorite_rank, created_at, archived_at.  
**tasks** — id, workspace_id, project_id nullable, parent_task_id nullable, title, description, status, priority nullable, due_at nullable, follow_up_at nullable, owner_person_id nullable, waiting_on_person_id nullable, source_kind, source_id nullable, sort_key, created_by_actor, completed_at nullable, created_at, updated_at, deleted_at nullable.  
**notes** — id, workspace_id, project_id nullable, title, content_json, plain_text, source_kind nullable, source_id nullable, created_at, updated_at, deleted_at nullable.  
**conversations** — id, workspace_id, project_id nullable, title, kind (`meeting`, `informal`, `dictation`, `email_paste`, `other`), occurred_at nullable, people_json, raw_text, summary nullable, recording_attachment_id nullable, created_at.  
**people** — id, workspace_id, display_name, email nullable, organization nullable, metadata_json.  
**drafts** — id, workspace_id, project_id nullable, source_conversation_id nullable, kind (`email`, `message`, `other`), subject nullable, content, status (`draft`, `used`, `discarded`), created_at, updated_at.  
**attachments** — id, workspace_id, project_id nullable, original_filename, mime_type, object_key, size_bytes, checksum, status, created_at.  
**captures** — id, workspace_id nullable, project_id nullable, kind, text nullable, attachment_id nullable, processing_status, created_at, updated_at.  
**ai_jobs** — id, workspace_id nullable, capture_id, kind, provider, model, status, input_version, result_json nullable, error_code nullable, started_at nullable, completed_at nullable.  
**ai_suggestions** — id, ai_job_id, suggestion_kind, proposed_json, user_edited_json nullable, decision (`pending`, `accepted`, `rejected`), committed_entity_type nullable, committed_entity_id nullable.  
**entity_links** — id, workspace_id, from_type, from_id, to_type, to_id, relation (`source`, `related`, `generated_from`) .  
**api_tokens** — id, user_id, label, token_hash, scopes_json, allowed_workspace_ids_json, expires_at, last_used_at, revoked_at.  
**audit_events** — id, actor_type, actor_id, workspace_id, action, entity_type, entity_id, safe_metadata_json, created_at.

### Database invariants

- A project's workspace must match its task/note/conversation workspace.
- Child task's workspace must match the parent task; if project-bound, match the parent project's scope.
- A task cannot be its own ancestor; prevent cycles.
- Relationships across workspaces are **rejected by default**. Any explicitly supported cross-workspace view aggregates at the authenticated user's layer, not by merging AI context.
- Every query is authorized server-side, including background jobs and MCP calls.
- Dates store instants when precise and preserve original human expressions/assumptions in the capture when relevant.
- Unscoped capture can live in a personal Inbox rather than fabricating a project.

### Important indexes

`tasks(workspace_id, status, due_at)`, `tasks(workspace_id, project_id, parent_task_id)`, `tasks(follow_up_at, status)`, `projects(workspace_id, name)`, plus PostgreSQL text-search indexes for project names, task titles, and note/conversation text. Add `updated_at` indexes to support incremental sync.

## 5. API design — REST v1

Use `/v1/...` paths, OpenAPI documentation, typed request/response schemas, pagination, consistent errors, idempotency for writes, and per-route authorization.

| Route | Purpose |
|---|---|
| `GET/POST /v1/workspaces` | List and create workspace |
| `GET/PATCH /v1/workspaces/:id` | Read/update workspace |
| `GET/POST /v1/workspaces/:id/projects` | Projects in a workspace |
| `GET/PATCH /v1/projects/:id` | Project details |
| `GET/POST /v1/tasks` | Filter/create tasks |
| `GET/PATCH/DELETE /v1/tasks/:id` | View/update/archive task |
| `POST /v1/tasks/:id/complete` | Explicit completion |
| `GET/POST /v1/notes` | Notes |
| `GET/PATCH /v1/notes/:id` | Note editing |
| `GET/POST /v1/conversations` | Source conversations |
| `GET /v1/conversations/:id` | Source + linked results |
| `GET/POST /v1/drafts` | Drafts |
| `POST /v1/captures` | Capture text or attach a prepared upload |
| `POST /v1/attachments/upload-url` | Scoped signed upload |
| `POST /v1/captures/:id/process` | Start analysis/transcription job |
| `GET /v1/ai-jobs/:id` | Job status and proposed suggestions |
| `POST /v1/ai-jobs/:id/commit` | Atomically save **selected** edited suggestions |
| `GET /v1/home` | Today, overdue, waiting, upcoming, inbox |
| `GET /v1/search?q=...` | Authorized cross-entity search |
| `GET /v1/sync/changes?cursor=...` | Incremental sync, including tombstones |

**Guidelines:**

- `GET /v1/tasks` filters: `workspace_id`, `project_id`, `status`, `due_before`, `follow_up_before`, `parent_task_id`, `assignee`, `cursor`.
- `POST /v1/tasks` requires `title` and an authorized destination: workspace ID or verified personal Inbox scope. Project ID is optional.
- Normal task creation must **not** call an LLM.
- Commit selections must be transactional and idempotent so retried requests do not duplicate tasks.
- Long-running jobs should use polling or SSE for progress; SSE is not required for basic task UI.
- Rate-limit agent and import endpoints; cap payload sizes.

## 6. MCP interface — minimal and safe

Expose an MCP server, initially backed by the **same authorized domain services** as REST. Example tools:

| Tool | Effect |
|---|---|
| `list_workspaces` | Only authorized workspaces |
| `list_projects` | Project discovery in a specified workspace |
| `search_items` | Scoped search for tasks, notes, conversations |
| `list_tasks` | Query tasks by workspace/project/status |
| `create_task` | Add task, optional parent / project |
| `update_task` | Edit task fields |
| `complete_task` | Explicitly complete a task |
| `create_note` | Add note in authorized scope |
| `create_conversation` | Store a conversation summary/source |
| `get_project_context` | Summarized authorized context, not raw indiscriminate data |
| `create_capture` | Submit free-form text for optional AI review pipeline |

**Security:** Each MCP client uses a short-lived OAuth flow or a revocable, **scoped personal access token** (only when a transport/client necessitates it). Enforce scopes and workspace allowlists on the server, never rely on prompt instructions for access control. Reject ambiguous destinations instead of guessing. Token material must never enter agent context or application logs. Prefer explicit user approval for bulk or destructive actions.

**MCP is not just a database connection.** All operations go through validated, audited services with the same rules as the app.

## 7. AI processing pipeline

```text
User capture (text/audio/file)
  → Durable capture record + private attachment (if any)
  → Extraction/transcription worker
  → Normalize text and metadata
  → Apply active workspace/project context + allowed project glossary
  → Selected provider or local model
  → Structured, schema-validated suggestions
  → Staged preview for user review
  → User edits/selects
  → Transactional commit: notes/tasks/drafts + provenance links
```

### Input handling

- **Text / pasted email:** store exact source and metadata; allow immediate manual save.
- **Audio:** record with clear visible state; browser/device permissions; upload privately or run supported local transcription. Do not imply access to system audio or third-party calls without permissions/integration.
- **Files:** validate MIME and extension, size and page/time limits. Ingestion must safely extract supported text formats; encrypted/scanned documents may need separate later support. Treat imported content as untrusted.
- **Large inputs:** asynchronously chunk and summarize for extraction while preserving source provenance; avoid dropping names or dates silently.

### Provider abstraction

Define interfaces such as:

```ts
interface LanguageProvider {
  extractActions(input: ExtractionRequest): Promise<ExtractionResult>;
  draftMessage(input: DraftRequest): Promise<DraftResult>;
}
interface TranscriptionProvider {
  transcribe(input: AudioRef): Promise<TranscriptResult>;
}
```

Support OpenAI and Anthropic text models with **user-supplied API keys**. Transcription capability is a separate adapter: do not assume every text provider or local model supports audio. Allow model selection per workspace subject to workspace policy.

### Structured output validation

- Require Zod/JSON schema validation and server normalization before surfacing suggestions.
- Classify each suggestion: **explicit action**, **suggested action**, **informational note**, or **draft**.
- Return confidence **only as an advisory signal**, not as a basis for automatic irreversible decisions.
- Link each task to a source span or reference when available.
- If uncertain about names, projects, dates, or ownership, return `null` + `needs_confirmation`.
- Prevent prompt injection: meeting content is **data**, never instructions authorizing tool calls or cross-workspace access.
- Never let LLM-generated JSON directly execute database writes; commit through normal authenticated validation.

### Relative dates

Supply `captured_at`, `user_timezone`, and an optional conversation date. Resolve “Friday” relative to the conversation date where reliably known; otherwise request confirmation. Persist the precise timestamp only after confirmation where ambiguity matters.

### BYOK secrets

- Preferred MVP: user enters keys in settings, encrypt at rest server-side using a managed encryption key and envelope encryption; access only within authorized worker paths.
- For a single-device Mac-only experiment, an OS keychain is an option, but it does not solve cross-device BYOK securely on its own.
- Never expose saved keys to frontend JavaScript after initial submission, URLs, analytics, logs, or MCP prompts.
- Include key testing, revocation, provider disable, and provider-specific data handling notice.

## 8. Privacy and tenant isolation

Because workspaces may contain sensitive business content:

1. Authenticate all users and agents; authorize every read, write, search, file, and job operation.
2. Use private buckets with short-lived signed URLs; validate uploads, content type, size, and malware risk before downstream processing.
3. Encrypt in transit and at rest; audit key actions while avoiding logging raw content.
4. Do not assemble AI prompts using material from other workspaces unless the user explicitly authorizes a narrowly scoped cross-workspace operation.
5. Maintain workspace-level AI controls: disabled, provider permitted, and optional data-retention rules.
6. Show a clear notice before third-party AI processing of employer/confidential information. Confirm organizational policy permits processing; user ownership of an API key **does not** grant approval to send employer data.
7. Support export, deletion, backup/restore, and revocation of agent tokens.
8. Set restrictive default data retention for temporary AI job artifacts and signed uploads; preserve sources only per user-configured policy.

## 9. Offline, synchronization, and responsiveness

**MVP approach: offline-capable capture, online source of truth.**

- Cache navigation and recently loaded items where safe.
- Store unsynced quick text captures/tasks in local durable storage (IndexedDB for web/PWA, platform storage for Mac) with a sync queue and idempotency keys.
- Record audio locally until a successful upload when the platform supports it, with storage warnings and explicit retry/delete options.
- Server-assigned revisions/`updated_at` and a change cursor enable incremental sync.
- Detect conflicts: do not silently replace the user's edited content. Start with latest-write for simple non-overlapping metadata and an explicit conflict UI for concurrently edited bodies.
- Background sync is best-effort; browser/mobile restrictions mean users must see the actual sync state.
- Load the Home shell instantly from cached state while fetching fresh data. Defer heavyweight editor, AI panels and transcript viewers until opened.

**Performance budgets (engineering goals, to measure on real devices):**

| Metric | Target |
|---|---|
| Input feedback | <100 ms, p95 on modern Mac |
| Cached workspace/project navigation | <300 ms, p95 |
| Add task optimistic rendering | <100 ms, p95 |
| Typical authenticated API reads | <300 ms server response, p95 excluding network variance |
| JS bundle | Monitor and minimize initial route payload; set budgets after baseline |
| AI processing | Clearly asynchronous, with progress/retry; no pretend instantaneous SLA |

Instrument cold-start, interaction latency, error rate, sync failures and AI job outcomes without collecting content in telemetry.

## 10. Platform-specific notes

### macOS / Tauri

- Shared Next.js UI runs inside Tauri; use a deployment/packaging approach compatible with Tauri's webview, including authenticated API connections and asset handling.
- Provide app signing/notarization planning and explicit microphone/file permissions.
- Optional menu bar quick capture and system-wide shortcuts should be implemented after the core experience works; handle shortcut collisions and permissions gracefully.
- Test recent supported macOS versions for recording and drag-and-drop behavior.

### Web / PWA / mobile

- Fully responsive Home and capture flows; installability where supported.
- iOS/Safari and Android/Chrome have different recording, file, quota, and background-processing constraints. Feature-detect and offer safe fallbacks.
- Do not rely on background audio recording surviving a locked phone, browser suspension, or a terminated PWA.

## 11. Testing strategy

- **Domain tests:** hierarchy integrity, workspace authorization, date interpretation, status transitions, nested task cycles.
- **API contract tests:** schema validation, pagination, idempotency, permission failures, token scopes.
- **AI tests:** fixture transcripts with explicit and ambiguous items, quoted instructions/prompt injections, misclassification, duplicate extraction, date uncertainty.
- **End-to-end tests:** Home quick actions, Mac shortcuts, workspaces with 20+ projects, transcript upload → preview → commit, offline draft → reconnect, MCP create → UI refresh.
- **Privacy/security tests:** IDOR attempts, cross-workspace search, upload abuse, leakage in logs, revoked tokens, BYOK secret handling.
- **Performance tests:** cold launch, large project lists, heavy notes, poor connectivity, long uploads.

## 12. Build roadmap (deliver vertical slices)

### Phase 0 — UI prototype and architecture decisions

Implement clickable Mac-sized Home + mobile Home with left sidebar, prominent action tiles, project navigation, task side panel and command search. Confirm keyboard behavior and design tokens. Set up monorepo, DB migrations, auth, CI.

### Phase 1 — Fast everyday workflow

CRUD workspaces/projects/tasks/subtasks/notes; My Day/Inbox/Waiting On/Upcoming; quick add, filtering, search; optimistic UI and basic durable offline capture. **Shippable without any AI.**

### Phase 2 — AI-assisted capture

Conversations and captures, recording, selected import formats, asynchronous transcription/extraction, validated staging, project suggestions, draft generation and provenance. Enable BYOK/provider policies.

### Phase 3 — Agent access and Mac polish

Documented REST API, scoped MCP server, audit trail, Tauri packaging, shortcuts, mobile PWA reliability and sync hardening. End-to-end QA using realistic multi-workspace fixtures.

## 13. Definition of done

Do **not** call the MVP complete unless a user can:

1. Launch a polished, responsive Home page and see **Add Task**, **Record**, **Quick Note**, **Upload Transcript** and **AI Capture** immediately.
2. Jump into MTN and navigate a list of 20+ projects without clutter or lag.
3. Create a task in seconds without configuration of any AI key.
4. Capture an informal conversation and review linked task/draft suggestions.
5. Import and process a transcript without losing the original text.
6. Use task/subtask editing, notes, Waiting On and My Day across workspaces.
7. Connect an authorized MCP client to create/update a task in an allowed project.
8. Verify that cross-workspace reads are blocked by default and sensitive content is not sent to an AI provider without permission.
9. Recover cleanly from offline changes, failed uploads and AI errors.
10. Use web, packaged Mac app and mobile PWA for the supported core workflows.

## 14. Implementation instructions for the coding agent

- Read `PRODUCT.md` and this file before making changes. Treat UX simplicity and data isolation as acceptance criteria, not polish items.
- Build **actual working vertical slices**, not static dashboard-only mocks.
- Start with the Home layout and its **visible quick-action controls**, then wire those actions into real persistence.
- Favor small components, clear boundaries and progressive disclosure; no heavyweight PM features without a documented requirement.
- Add seed fixtures for MTN (20+ sample projects), DAMSYN, Dorsh and Personal; clearly mark all sample data as fictional.
- Preserve data provenance for AI-derived tasks and drafts.
- Never send email automatically or create large batches of AI suggestions without a review path.
- Document setup, environment variables, migration/seed commands, privacy defaults, provider selection and MCP client configuration.
- Measure responsiveness on a Mac-class device and at mobile widths; optimize before expanding scope.

**North star:** Capture instantly. Organize correctly. Act confidently. Stay out of the user's way.
