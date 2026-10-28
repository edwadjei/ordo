# API architecture and concepts

**Direction:** Adapt the organization and concepts of Edward's local `damsyn-ecommerce-api` to Ordo. Keep Ordo's personal-workspace model and current HTTP contract. The API is a Hono app in one Cloudflare Worker on D1 ([technical architecture](TECHNICAL.md)).

**Implementation status:** the code today hosts these boundaries on Hono in Node with embedded PostgreSQL and Web Crypto adapters. Phase 2 moves persistence to D1 with check-on-save writes ([platform spec](specs/02-cloudflare-platform.md)).

## Four boundaries

| Area | Owns | Must not become |
|---|---|---|
| `apps/api/src/platform` | Configuration, request security, safe errors, session-cookie transport, health, and a small framework-neutral request/response layer | A home for task/workspace business rules or imports from a domain |
| `apps/api/src/capabilities` | Abstract-class ports for passwords, sessions, hashing, OTP delivery/secrets, audio providers, encrypted credentials, and transcription | Empty future integrations or a generic port for every implementation detail |
| `apps/api/src/adapters` | Concrete Web Crypto implementations, Gatekeeper, transcription providers, and database access | Product workflows or a global bag of services |
| `apps/api/src/domains` | Identity, workspaces/projects, tasks, notes, home aggregation, and explicit fictional fixtures | Controllers containing database queries or a single all-purpose service |

`app.ts` composes the specific modules and registers shared HTTP behavior; a Worker entry (and a Node entry for local work) wires bindings and secrets into it. It no longer contains the task/note/workspace route implementations. Dependencies are passed explicitly; there is no implicit global service registry.

## Inside a domain

Use the familiar `name.controller.ts`, `name.service.ts`, `name.repository.ts`, and `name.module.ts` shape. These are ordinary TypeScript classes/functions, rather than NestJS decorators. Controllers use the platform's request/response layer, so no domain imports Hono types. A domain only needs a repository if it owns persistence: Home aggregates through the owning services and has none.

- **Controller:** parse/validate the wire contract, resolve the authenticated actor, call the service, and map the HTTP response.
- **Service:** orchestrate the operation, decide its save preconditions (expected revision, idempotency, hierarchy), apply domain rules, and call specific repositories or owning services.
- **Repository:** express owner-scoped persistence queries, including conditional writes and atomic batches, using the concrete database adapter.
- **Module:** explicitly construct dependencies and register its controller.
- **Concept note:** explain the vocabulary, ownership, non-obvious decisions, and failure behavior alongside the domain.

Do not add conceptual `transport/`, `application/`, or `use-cases/` directory trees. Split by a meaningful resource when needed. Comments are not a substitute for the concept notes.

## Domain ownership

| Domain | Concept and responsibility | Source concept note |
|---|---|---|
| Identity | Code sign-in, contact verification, server sessions, and revocation (plus legacy local password conversion) | `apps/api/src/domains/identity/identity.md` |
| Workspaces | Owned portfolio contexts and their projects; authoritative scope validation | `apps/api/src/domains/workspaces/workspaces.md` |
| Tasks | Tasks, parent/child containment, status, dates, idempotent creation, revision-aware edits, archive | `apps/api/src/domains/tasks/tasks.md` |
| Notes | Plain-text notes and revision-aware saving in an owned destination | `apps/api/src/domains/notes/notes.md` |
| Home | Authorized aggregation of workspace/project, task, and note reads through their services | `apps/api/src/domains/home/home.md` |
| Demo | Explicit once-per-account fictional fixtures; not normal production business writes | `apps/api/src/domains/demo/demo.md` |

Tasks and Notes ask Workspaces for scope validation. Home asks Workspaces, Tasks, and Notes for authorized lists. Demo is a documented fixture-orchestration exception that creates example records transactionally, then uses Home to return the current view. These dependencies are explicit, not permission to query another domain's tables from arbitrary services.

## Saving and tenant boundaries

Every user-owned record has an explicit owner. Personal Inbox records may have null workspace/project, but never an absent owner. The server derives ownership from authentication, not from request bodies or the account-precondition header.

D1 has no row locks or interactive transactions, so every save carries its own preconditions (**check-on-save**): updates are conditional on the stored `revision`, hierarchy writes are conditional on the revisions of the ancestors that were checked, idempotency keys are unique constraints, and multi-row writes go in one atomic `batch()`. A refused condition returns the same `409` codes clients already handle. Validation and the write must stay together: a check performed earlier and not repeated in the write's `WHERE` clause would weaken the guarantee even if the folder names looked right. Rules and examples are in the [platform spec](specs/02-cloudflare-platform.md#saving-safely-check-on-save).

**Implementation status:** today an owner transaction locks the user's PostgreSQL row, and reads, scope/parent validation, cycle detection, revision checks, writes, and idempotency records share that transaction. Check-on-save replaces it in Phase 2, with concurrency tests on local D1.

Controllers use strict shared validation from `packages/core`. Responses omit private persistence ownership and credential material. The public identity supplied to request handlers contains no password hash. Workspace isolation is enforced by queries and services, not by prompt instructions or UI filtering.

## Real ports, real adapters

Session material uses `SessionTokens` (random bytes, SHA-256 digest). Code sign-in uses `OtpSecrets` (random six-digit codes, HMAC-SHA256 with a Worker secret) and `OtpDelivery` (Gatekeeper). Task idempotency fingerprints use `ContentHasher` (SHA-256). Provider keys use the `SecretCipher` (AES-GCM). All of these are Web Crypto adapters. Platform request security depends on `SessionAuthenticator`; Identity supplies that behavior without Platform importing Identity. `PasswordHasher` exists only to convert legacy local password accounts and is never part of the Worker.

**Implementation status:** these adapters use Web Crypto (HMAC-SHA256 for codes). Node `crypto` remains only to verify legacy scrypt passwords, which hosted Ordo does not serve.

The database is a concrete adapter over the shared Drizzle schema in `packages/db`, bound to D1 in the Worker. There is no invented `DatabaseProvider` port suggesting the database is interchangeable.

AI and transcription ports are introduced with their actual features. There is no storage port: Ordo stores no audio or files.

## What differs from DAMSYN

- Use Hono, Zod, and Drizzle on D1; do not adopt NestJS, Prisma, Bun, Clerk, or DAMSYN's infrastructure.
- Ordo is personal-first. Do not import vendor/customer/admin commerce scopes, payment concepts, or permission catalogues.
- Preserve the existing `/v1` resource routes and camelCase fields. Folder restructuring does not silently rename the API consumed by web and future mobile clients.
- Keep shared contracts/schema/client packages in the monorepo; domain concept documentation stays beside its owning API code.
- Hosted staging, generated OpenAPI, pagination, audit events, native-client authentication, and incremental sync remain release work.

## Verification and deeper reference

The API suite retains its original behavior regressions and adds TypeScript-AST import-boundary checks. These catch Platform depending on domains, SDK usage escaping adapters, and unapproved cross-domain imports. They complement integration tests; architecture checks do not prove authentication or persistence by themselves.

The detailed implementation guide is `apps/api/docs/architecture.md`, with endpoint contracts in `apps/api/README.md`. See [local development](LOCAL-DEVELOPMENT.md), [the build plan](coordination/BUILD-PLAN.md), and [the delivery ledger](PLAN.md) for runnable checks and actual evidence.

## Authentication, search, and audio extension

Identity owns expiring single-use OTP challenges and Gatekeeper delivery through capability adapters. Search owns ranked full-text queries over the current owner's active task/note/project content: SQLite FTS5 in the Cloudflare design, PostgreSQL full-text indexes in today's local build. Transcriptions owns bounded in-memory audio processing through a configured provider. No storage adapter, audio-file route, recording history, or stored audio metadata exists; only returned transcript text can be saved through Notes. See each domain concept note under `apps/api/src/domains`. No provider key or raw provider error is returned to clients. Today's transcription concurrency guards and sign-in rate buckets are per process; on Workers the sign-in limits live in D1, and transcription limits are per isolate.

Audio Settings owns per-account provider selection and encrypted key references. Transcriptions calls its owning service to resolve the selected provider, with a required provider snapshot before any key decryption or audio send. The server-side credential cipher and local decoder/provider details remain in adapters. See [audio setup](AUDIO-SETUP.md).
