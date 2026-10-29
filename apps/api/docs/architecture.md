# Ordo API architecture

Ordo adopts the API concepts and layout from Edward's local `damsyn-ecommerce-api`, as requested on 21 October 2026. The reference was read-only: `docs/architecture.md`, the relevant `CLAUDE.md` sections, and identity/address controller, service, and repository examples. No secrets, environment files, commerce rules, deployment bindings, or application code were copied.

A Hono app in one Cloudflare Worker, on D1, with Web Crypto adapters and check-on-save writes ([technical architecture](../../../docs/TECHNICAL.md), [platform spec](../../../docs/specs/02-cloudflare-platform.md)). **Implementation status:** Phase 2; this guide describes the code as it runs under `wrangler dev` on a local D1 database. Nothing is deployed yet.

## Composition and explicit imports

`src/app.ts` is the composition root. It builds a framework-neutral `HttpPipeline` (guards, routes, close hooks) and hands it to `adapters/http/hono-host.ts`, which mounts it on a Hono app (routes under `/v1`, plus `/health`). Building it does no I/O. It wires concrete adapters into the owning leaf domain modules, installs platform HTTP behavior and registers controllers. It contains no business queries, route handlers, hierarchy rules, or fixture content.

`src/worker.ts` is the only entry. It reads bindings through `platform/config/worker-config.ts`, picks the code transport (Gatekeeper, or the development-only console transport), builds the app once per isolate, and handles each request: anything outside `/api` goes to the static-asset binding; `/api/<path>` is rewritten to `/v1/<path>` (`/api/health` to `/health`), a D1 Sessions API session is opened from the `X-Ordo-Bookmark` header (`adapters/http/worker-routing.ts`), the request runs with that session bound to the `DatabaseAdapter`, and the response carries the session's latest bookmark. The Worker module exports only its handler, because workerd treats every named export as an entrypoint.

```text
src/
  platform/       cross-cutting HTTP, errors, request identity, config, identifiers
  capabilities/   abstract runtime contracts for real cryptography/auth seams
  adapters/       concrete database, cryptography (Web Crypto), HTTP host and Worker routing, Gatekeeper and console code transports, secrets, transcription
  domains/
    identity/     accounts, code sign-in, sessions, sign-in throttle
    workspaces/   workspace/project ownership and destination validation
    tasks/        task lifecycle, nesting, retry idempotency
    notes/        scoped text notes and revision-guarded editing
    home/         aggregate reads through owning services
    demo/         explicitly requested fictional fixture orchestration
```

Each implemented domain keeps `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, and, where it owns persistence, `<name>.repository.ts`. The sibling `<name>.md` is the concept note: decisions, invariants, and exceptions belong there rather than explanatory comments distributed through production files. There are no empty provider/storage/AI domains, generic use-case folders, or global provider registries.

Modules are explicit factories rather than NestJS decorators. A leaf module returns its owning service and controller-registration function; it does not re-export sibling providers. The root names the exact services needed for each cross-domain dependency. No aggregator barrel or global lookup hides which domain supplies a capability.

## Inside a domain

```text
HTTP request
  → controller: actor context, schema parsing, HTTP status/cookie translation
  → service: permissions, invariants, decisions, save preconditions
  → repository: owner-scoped database queries
  → concrete database adapter → shared packages/db → Drizzle on the request's D1 session
```

Controllers never call repositories or execute SQL. Services never execute Drizzle queries, read request cookies, or format HTTP framework responses. Repositories do not decide task completion, scope movement, cycles, or whether a sample-data request is allowed to run twice. The service makes those decisions and states them as save preconditions that the repository writes into the statement.

`DatabaseAdapter.use()` returns the current request's Drizzle database. The Worker binds each request's D1 session with `DatabaseAdapter.run()` (an `AsyncLocalStorage` scope, hence the `nodejs_als` compatibility flag; nothing else from Node is used), so services are built once per isolate and repositories always read and write through the right session. Outside a request scope it falls back to the database given at construction (tests and tooling).

There is no owner lock and no interactive transaction on D1. The service keeps the same decisions but expresses them as save preconditions that the repository writes into the statement itself: `revision` checks, ancestor-revision checks for hierarchy moves, `NOT EXISTS` active-children guards, unique idempotency keys, guarded `INSERT … SELECT … WHERE` inserts (`insertWhere()`, which carries the rows as one JSON parameter because D1 allows at most 100 bound parameters), and one atomic `batch()` per multi-row operation. A guarded write that changes nothing is reported as the matching conflict; nothing partial is ever written. `packages/db` replaces Drizzle's D1 `batch()` with an equivalent that binds raw `sql` statements correctly (drizzle-orm 0.45.4 cannot). The database remains concrete infrastructure; no pretend interchangeable database capability was introduced.

Repositories import the specific `adapters/database/database.adapter.ts` wrapper. That wrapper exposes the shared tables, Drizzle query helpers, record types, the request-scoped database and `insertWhere()`. The schema, migrations and the D1 wrapper (`createDatabase()`) remain in `packages/db`. Services may import its **types** for record typing, following DAMSYN's documented concrete database type exception, but only modules/repositories import adapters at runtime.

## Capability ownership

| Abstract contract      | Concrete adapter                                                                           | Owning domain                            |
| ---------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `SessionTokens`        | `WebSessionTokens`: 32 random bytes as hex, SHA-256 hex storage digests (Web Crypto)       | Identity                                 |
| `OtpSecrets`           | `WebOtpSecrets`: unbiased six-digit codes, HMAC-SHA256 with `OTP_HMAC_KEY` (Web Crypto)    | Identity                                 |
| `SecretCipher`         | `WebSecretCipher` AES-256-GCM with the `ORDO_CREDENTIAL_KEY` secret (Web Crypto)           | Audio settings                           |
| `SessionAuthenticator` | `IdentityService`, resolving an active stored session to public identity                   | Identity; platform consumes the contract |
| `ContentHasher`        | `WebContentHasher` using SHA-256 hex (Web Crypto)                                          | Tasks, for write-request fingerprints    |
| `SignInThrottle`       | `IdentitySignInThrottle`: one D1 upsert per sign-in request in `auth_throttle`             | Identity; platform consumes the contract |
| `OtpDelivery`          | `GatekeeperOtpDelivery`, or `ConsoleOtpDelivery` only with `ORDO_ENV=development`          | Identity (chosen by the Worker entry)    |
| `AudioProviders`       | `ConfiguredAudioProviders`: Workers AI through the `AI` binding, and the account's OpenAI key | Audio settings                        |
| `Transcriber`          | `WorkersAiTranscriber` (`@cf/openai/whisper-large-v3-turbo`) or `OpenAiTranscriber`        | Transcriptions, via audio settings       |

These are actual runtime seams exercised by requests. Cryptography adapters are wired only by the owning domain's module. The platform guard receives `SessionAuthenticator`; it never imports IdentityService or a database repository. Session hashes stay inside identity persistence and do not enter the request actor, Home snapshot, or auth responses.

UUID generation is ownerless infrastructure in `platform/identifiers/new-id.ts`, not a vendor integration. No port is manufactured for the system clock, a string formatter, or a database we do not claim is interchangeable.

## Domain graph

```text
identity                     → its repository + session/throttle/code contracts
workspaces                   → its repository
 tasks ─────────────────────→ workspaces service (destination validation)
 notes ─────────────────────→ workspaces service (destination validation)
home                         → workspaces + tasks + notes services (read aggregation)
demo                         → home service (post-seed snapshot)
platform request guard       → SessionAuthenticator + SignInThrottle contracts
```

Each arrow names the owning service, not its repository or provider. Tasks and notes ask WorkspacesService to validate a destination before their write. That read cannot go stale (workspaces and projects are never deleted, and a project never changes workspace), and composite foreign keys enforce the same ownership in the database. Home has no repository because it owns no independent data. Projects currently stay within Workspaces because their ownership and destination invariants are one small domain; split them into a nested module only if their own behavior warrants it.

The demo domain is a deliberate, narrow exception to normal table ownership: its fixture repository inserts synthetic rows across the core tables and updates the `users.demo_loaded` fixture marker. The service requires an authenticated user; the repository's single batch claims the marker first (`demo_loaded = 0` → 1 with a fresh `demo_claim`) and every fixture insert is conditional on that claim. All generated rows carry that owner's ID. The endpoint is explicit and never runs during signup, startup, or ordinary capture. This exception is not permission for normal domains to write each other's tables.

## Platform behavior

- `platform/http/http.ts` is the framework-neutral HTTP surface: `HttpRequest` (method, path, params, query, headers, cookies, parsed JSON or raw bytes, client IP, an abort signal for client disconnect, and the resolved actor), `HttpReply` (status, headers, `Set-Cookie`), and `HttpRoutes`, the only thing a module's `register` receives. Handlers return the JSON body. It also fixes the 150,000-byte JSON body limit; a raw-body route (transcription audio) declares its accepted content types and its own limit. Nothing under `platform/`, `domains/` or `capabilities/` imports an HTTP framework; `test/architecture.test.ts` enforces this.
- `adapters/http/hono-host.ts` mounts the pipeline on Hono. Guards run first, before the body is read, on every request including unknown routes (which then return `404 NOT_FOUND` in the error envelope). Bodies: JSON up to 150,000 bytes (prototype keys rejected), plain text, or a route's declared raw content types up to that route's limit (20 MiB for transcription audio); oversized is 413, malformed is 400, other media types are 415. Client disconnect aborts `request.signal`. The sign-in throttle reads the client address from `CF-Connecting-IP`, which Cloudflare's edge sets (and `wrangler dev` sets locally).
- `GET /v1/capabilities` (composed in `app.ts`) adds `transcriptionProviders: { workersAi, openai }` and `credentialStorage` to the existing flags. `workersAi` is true when the Worker has a usable `AI` binding (and `ORDO_WORKERS_AI` leaves it on); `openai` and `credentialStorage` are true only when the secret cipher has a usable master key. `recording` and `transcription` are true when Workers AI is usable or the signed-in caller's account has a saved OpenAI key: the route stays public, and the request guard resolves a session there only if a cookie is present.
- `platform/http/request-security.ts` is a request guard that checks configured browser origins, limits code sign-in attempts through the `SignInThrottle` contract, resolves session identity through its contract, and enforces optional `X-Ordo-Account` queued-write protection. Logout remains outside sign-in throttling.
- `platform/http/error-handler.ts` maps expected failures, validation errors and host body errors to the stable safe error envelope. No raw query, password, token, or content is exposed.
- `platform/http/request-context.ts` makes the authenticated **public** user available to controllers and validates UUID path IDs.
- `platform/http/session-cookie.ts` owns cookie parsing/formatting, keeping transport concerns out of identity service logic.
- `platform/config/worker-config.ts` validates the Worker's variables and secrets; outside `ORDO_ENV=development` it refuses to run without `OTP_HMAC_KEY` and `TRUSTED_ORIGINS`.
- `platform/time/iso-now.ts` formats timestamps as ISO UTC text, the format every timestamp column uses.

The platform imports no business domain or concrete adapter. It can depend on a capability contract whose implementation is supplied by composition.

## Deliberate differences from DAMSYN

1. **Hono and Drizzle, not NestJS and Prisma.** The owner requested comparable structure and concepts, not a NestJS/Prisma rewrite. Explicit factory modules take the place of Nest dependency injection metadata.
2. **Wire contracts stay stable.** Existing `/v1/auth` code sign-in, `/v1/workspaces`, `/v1/projects`, `/v1/tasks`, `/v1/notes`, `/v1/home`, and `/v1/demo` routes and camelCase payloads are preserved. DAMSYN's audience/scope URL segments, response DTO envelopes, auth/token exchange, roles, and commerce-specific policies are not introduced.
3. **Shared DTO schemas stay in `packages/core`.** Browser and future native clients use the same TypeScript/Zod contract. Controllers own parsing; separate server DTO files would duplicate the source of truth at this stage.
4. **Database schema and migrations stay in `packages/db`.** The API adapter provides the domain persistence boundary without duplicating migrations. D1 migrations are applied with `wrangler d1 migrations apply`, never at Worker boot.
5. **No automatic provider breadth.** There are only the ports and adapters exercised by the current account/task flow. AI, storage, notifications, and native-token integrations wait for their actual slices.

## Verification and current limits

`test/architecture.test.ts` parses TypeScript imports to enforce platform isolation, runtime abstract capabilities, the documented domain graph, vendor access through adapters, thin controllers, cryptography adapter ownership, no Node `crypto` anywhere, and that the only Node import is `node:async_hooks` in the database adapter. `test/web-crypto.test.ts` proves the Web Crypto adapters match the former Node output for session digests and content fingerprints and decrypt provider keys saved by the former cipher. The integration suites run on isolated local D1 databases and add concurrency scenarios for every check-on-save rule, sign-in replay/limit/throttle cases, FTS5 search, and the Worker entry with bookmarks.

Hosted staging (Phase 3), audit trails, native authentication, background jobs, incremental sync, and OpenAPI are not implemented. Those limits remain in the API README and must not be mistaken for completed infrastructure.
