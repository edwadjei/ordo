# Ordo API architecture

Ordo adopts the API concepts and layout from Edward's local `damsyn-ecommerce-api`, as requested on 21 October 2026. The reference was read-only: `docs/architecture.md`, the relevant `CLAUDE.md` sections, and identity/address controller, service, and repository examples. No secrets, environment files, commerce rules, deployment bindings, or application code were copied.

**Target:** a Hono app in one Cloudflare Worker, on D1, with Web Crypto adapters and check-on-save writes ([technical architecture](../../../docs/TECHNICAL.md), [platform spec](../../../docs/specs/02-cloudflare-platform.md)). **Implementation status:** this guide describes today's code, which composes the same boundaries on Fastify with embedded PostgreSQL and Node `crypto`. Where the target differs, it says so.

## Composition and explicit imports

`src/app.ts` is the composition root. It creates the HTTP app (Fastify today; Hono from Phase 1, with a Worker entry and a Node entry wiring bindings and secrets), wires concrete adapters into the owning leaf domain modules, installs platform HTTP behavior, registers controllers, and owns connection cleanup. It contains no business queries, route handlers, hierarchy rules, or fixture content.

```text
src/
  platform/       cross-cutting HTTP, errors, request identity, config, identifiers
  capabilities/   abstract runtime contracts for real cryptography/auth seams
  adapters/       concrete database, cryptography (Node today, Web Crypto from Phase 1), Gatekeeper, transcription
  domains/
    identity/     accounts, password sign-in, sessions
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
  → service: permissions, invariants, decisions, transaction boundaries
  → repository: owner-scoped database queries
  → concrete database adapter → shared packages/db → PGlite today / D1 binding from Phase 2
```

Controllers never call repositories or execute SQL. Services never execute Drizzle queries, read request cookies, or format HTTP framework responses. Repositories do not decide task completion, scope movement, cycles, or whether a sample-data request is allowed to run twice. The service makes those decisions and uses repository operations to perform them atomically.

`DatabaseAdapter.forOwner()` starts the PostgreSQL transaction and locks the owner's user row. The owning service decides when to call it, and passes the explicit transaction context to its own repository and any destination validation. This preserves the original transaction/cycle/idempotency guarantees across the modular split. The database remains concrete infrastructure; no pretend interchangeable database capability was introduced.

On D1 there is no owner lock. The service keeps the same decisions but expresses them as save preconditions that the repository writes into the statement itself: `revision` checks, ancestor-revision checks for hierarchy moves, `NOT EXISTS` active-children guards, unique idempotency keys, and one atomic `batch()` per multi-row operation (Phase 2).

Repositories import the specific `adapters/database/database.adapter.ts` wrapper. That wrapper exposes the shared tables, Drizzle query helpers, record types, and transaction surface. Concrete PGlite/postgres-js connection setup and migrations remain in `packages/db`. Services may import its **types** for transaction/context and record typing, following DAMSYN's documented concrete database type exception, but only modules/repositories import adapters at runtime.

## Capability ownership

| Abstract contract      | Concrete adapter                                                         | Owning domain                            |
| ---------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| `PasswordHasher`       | `NodePasswordHasher` using salted scrypt (legacy local accounts only; never in the Worker) | Identity                   |
| `SessionTokens`        | `NodeSessionTokens` using secure randomness and SHA-256 storage digests (Web Crypto from Phase 1) | Identity          |
| `OtpSecrets`           | `NodeOtpSecrets` for codes (HMAC-SHA256 with `OTP_HMAC_KEY` from Phase 1) | Identity                                |
| `SecretCipher`         | `FileSecretCipher` using AES-256-GCM (Web Crypto from Phase 1)           | Audio settings                           |
| `SessionAuthenticator` | `IdentityService`, resolving an active stored session to public identity | Identity; platform consumes the contract |
| `ContentHasher`        | `NodeContentHasher` using SHA-256 (Web Crypto from Phase 1)              | Tasks, for write-request fingerprints    |

These are actual runtime seams exercised by requests. Cryptography adapters are wired only by the owning domain's module. The platform guard receives `SessionAuthenticator`; it never imports IdentityService or a database repository. Password/session hashes stay inside identity persistence and do not enter the request actor, Home snapshot, or auth responses.

UUID generation is ownerless infrastructure in `platform/identifiers/new-id.ts`, not a vendor integration. No port is manufactured for the system clock, a string formatter, or a database we do not claim is interchangeable.

## Domain graph

```text
identity                     → its repository + password/session contracts
workspaces                   → its repository
 tasks ─────────────────────→ workspaces service (destination validation)
 notes ─────────────────────→ workspaces service (destination validation)
home                         → workspaces + tasks + notes services (read aggregation)
demo                         → home service (post-seed snapshot)
platform request guard       → SessionAuthenticator contract
```

Each arrow names the owning service, not its repository or provider. Tasks and notes pass the same transaction context when asking WorkspacesService to validate a destination; authorization is not a separate preflight read outside the write transaction. Home has no repository because it owns no independent data. Projects currently stay within Workspaces because their ownership and destination invariants are one small domain; split them into a nested module only if their own behavior warrants it.

The demo domain is a deliberate, narrow exception to normal table ownership: its fixture repository inserts synthetic rows across the core tables and updates the `users.demo_loaded` fixture marker. The service requires an authenticated user, holds that owner's transaction lock, and checks the marker before insertion. All generated rows carry that owner's ID. The endpoint is explicit and never runs during signup, startup, or ordinary capture. This exception is not permission for normal domains to write each other's tables.

## Platform behavior

- `platform/http/request-security.ts` checks configured browser origins, limits login/register attempts, resolves session identity through its contract, and enforces optional `X-Ordo-Account` queued-write protection. Logout remains outside sign-in throttling.
- `platform/http/error-handler.ts` maps expected failures and validation errors to the stable safe error envelope. No raw query, password, token, or content is exposed.
- `platform/http/request-context.ts` makes the authenticated **public** user available to controllers and validates UUID path IDs.
- `platform/http/session-cookie.ts` owns cookie parsing/formatting, keeping transport concerns out of identity service logic.
- `platform/config/api-config.ts` reads startup configuration and refuses the embedded local database fallback in production.

The platform imports no business domain or concrete adapter. It can depend on a capability contract whose implementation is supplied by composition.

## Deliberate differences from DAMSYN

1. **Hono and Drizzle, not NestJS and Prisma.** The owner requested comparable structure and concepts, not a NestJS/Prisma rewrite. Explicit factory modules take the place of Nest dependency injection metadata.
2. **Wire contracts stay stable.** Existing `/v1/auth`, `/v1/workspaces`, `/v1/projects`, `/v1/tasks`, `/v1/notes`, `/v1/home`, and `/v1/demo` routes and camelCase payloads are preserved. DAMSYN's audience/scope URL segments, response DTO envelopes, auth/token exchange, roles, and commerce-specific policies are not introduced.
3. **Shared DTO schemas stay in `packages/core`.** Browser and future native clients use the same TypeScript/Zod contract. Controllers own parsing; separate server DTO files would duplicate the source of truth at this stage.
4. **Database schema and migrations stay in `packages/db`.** The API adapter provides the domain persistence boundary without duplicating migrations. D1 migrations are applied with `wrangler d1 migrations apply`, never at Worker boot.
5. **No automatic provider breadth.** There are only the ports and adapters exercised by the current account/task flow. AI, storage, notifications, and native-token integrations wait for their actual slices.

## Verification and current limits

`test/architecture.test.ts` parses TypeScript imports to enforce platform isolation, runtime abstract capabilities, the documented domain graph, vendor access through adapters, thin controllers, and cryptography adapter ownership. The eight existing integration scenarios continue to exercise the same public API, including scope/owner rejection, cycles, idempotency, revision conflicts, session changes, persistence, and sign-out after throttling.

Hosted staging, audit trails, native authentication, background jobs, incremental sync, and OpenAPI are not implemented. Those limits remain in the API README and must not be mistaken for completed infrastructure.
