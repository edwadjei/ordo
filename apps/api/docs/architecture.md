# Ordo API architecture

Ordo adopts the API concepts and layout from Edward's local `damsyn-ecommerce-api`, as requested on 21 October 2026. The reference was read-only: `docs/architecture.md`, the relevant `CLAUDE.md` sections, and identity/address controller, service, and repository examples. No secrets, environment files, commerce rules, deployment bindings, or application code were copied.

## Composition and explicit imports

`src/app.ts` is the composition root. It creates the Fastify instance, wires concrete adapters into the owning leaf domain modules, installs platform HTTP behavior, registers controllers, and owns connection cleanup. It contains no business queries, route handlers, hierarchy rules, or fixture content.

```text
src/
  platform/       cross-cutting HTTP, errors, request identity, config, identifiers
  capabilities/   abstract runtime contracts for real cryptography/auth seams
  adapters/       concrete database and Node cryptography implementations
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
  → concrete database adapter → shared packages/db → PostgreSQL driver
```

Controllers never call repositories or execute SQL. Services never execute Drizzle queries, read request cookies, or format Fastify responses. Repositories do not decide task completion, scope movement, cycles, or whether a sample-data request is allowed to run twice. The service makes those decisions and uses repository operations to perform them atomically.

`DatabaseAdapter.forOwner()` starts the PostgreSQL transaction and locks the owner's user row. The owning service decides when to call it, and passes the explicit transaction context to its own repository and any destination validation. This preserves the original transaction/cycle/idempotency guarantees across the modular split. The database remains concrete infrastructure; no pretend interchangeable database capability was introduced.

Repositories import the specific `adapters/database/database.adapter.ts` wrapper. That wrapper exposes the shared tables, Drizzle query helpers, record types, and transaction surface. Concrete PGlite/postgres-js connection setup and migrations remain in `packages/db`. Services may import its **types** for transaction/context and record typing, following DAMSYN's documented concrete database type exception, but only modules/repositories import adapters at runtime.

## Capability ownership

| Abstract contract      | Concrete adapter                                                         | Owning domain                            |
| ---------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| `PasswordHasher`       | `NodePasswordHasher` using salted scrypt                                 | Identity                                 |
| `SessionTokens`        | `NodeSessionTokens` using secure randomness and SHA-256 storage digests  | Identity                                 |
| `SessionAuthenticator` | `IdentityService`, resolving an active stored session to public identity | Identity; platform consumes the contract |
| `ContentHasher`        | `NodeContentHasher` using SHA-256                                        | Tasks, for write-request fingerprints    |

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

1. **Fastify and Drizzle remain.** The owner requested comparable structure and concepts, not a NestJS/Prisma rewrite. Explicit factory modules take the place of Nest dependency injection metadata.
2. **Wire contracts stay stable.** Existing `/v1/auth`, `/v1/workspaces`, `/v1/projects`, `/v1/tasks`, `/v1/notes`, `/v1/home`, and `/v1/demo` routes and camelCase payloads are preserved. DAMSYN's audience/scope URL segments, response DTO envelopes, auth/token exchange, roles, and commerce-specific policies are not introduced.
3. **Shared DTO schemas stay in `packages/core`.** Browser and future native clients use the same TypeScript/Zod contract. Controllers own parsing; separate server DTO files would duplicate the source of truth at this stage.
4. **Database schema and migrations stay in `packages/db`.** The API adapter provides the domain persistence boundary without duplicating migrations or changing applied checksums.
5. **No automatic provider breadth.** There are only the ports and adapters exercised by the current account/task flow. AI, storage, notifications, and native-token integrations wait for their actual slices.

## Verification and current limits

`test/architecture.test.ts` parses TypeScript imports to enforce platform isolation, runtime abstract capabilities, the documented domain graph, vendor access through adapters, thin controllers, and cryptography adapter ownership. The eight existing integration scenarios continue to exercise the same public API, including scope/owner rejection, cycles, idempotency, revision conflicts, session changes, persistence, and sign-out after throttling.

This refactor does not add production deployment readiness, audit trails, native authentication, background jobs, incremental sync, OpenAPI, or a full standard-PostgreSQL environment verification. Those limits remain in the API README and must not be mistaken for completed infrastructure.
