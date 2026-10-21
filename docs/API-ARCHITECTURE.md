# API architecture and concepts

**Direction:** Adapt the organization and concepts of Edward's local `damsyn-ecommerce-api` to Ordo. Keep Ordo's personal-workspace model and current HTTP contract.

## Four boundaries

| Area | Owns | Must not become |
|---|---|---|
| `apps/api/src/platform` | Configuration, request security, safe errors, session-cookie transport, health, and shared HTTP helpers | A home for task/workspace business rules or imports from a domain |
| `apps/api/src/capabilities` | Abstract-class ports for password hashing, session tokens, session authentication, and content hashing | Empty future integrations or a generic port for every implementation detail |
| `apps/api/src/adapters` | Concrete Node cryptography and database access/transaction context | Product workflows or a global bag of services |
| `apps/api/src/domains` | Identity, workspaces/projects, tasks, notes, home aggregation, and explicit fictional fixtures | Controllers containing database queries or a single all-purpose service |

`app.ts` composes the specific modules and registers shared HTTP behavior. It no longer contains the task/note/workspace route implementations. Dependencies are passed explicitly; there is no implicit global service registry.

## Inside a domain

Use the familiar `name.controller.ts`, `name.service.ts`, `name.repository.ts`, and `name.module.ts` shape. These are ordinary TypeScript classes/functions around Fastify, rather than NestJS decorators. A domain only needs a repository if it owns persistence: Home aggregates through the owning services and has none.

- **Controller:** parse/validate the wire contract, resolve the authenticated actor, call the service, and map the HTTP response.
- **Service:** orchestrate the operation, own its transaction, apply domain rules, and call specific repositories or owning services.
- **Repository:** express owner-scoped persistence queries using the concrete database adapter and any supplied transaction context.
- **Module:** explicitly construct dependencies and register its controller.
- **Concept note:** explain the vocabulary, ownership, non-obvious decisions, and failure behavior alongside the domain.

Do not add conceptual `transport/`, `application/`, or `use-cases/` directory trees. Split by a meaningful resource when needed. Comments are not a substitute for the concept notes.

## Domain ownership

| Domain | Concept and responsibility | Source concept note |
|---|---|---|
| Identity | Local account credentials, server sessions, authentication, and revocation | `apps/api/src/domains/identity/identity.md` |
| Workspaces | Owned portfolio contexts and their projects; authoritative scope validation | `apps/api/src/domains/workspaces/workspaces.md` |
| Tasks | Tasks, parent/child containment, status, dates, idempotent creation, revision-aware edits, archive | `apps/api/src/domains/tasks/tasks.md` |
| Notes | Plain-text notes and revision-aware saving in an owned destination | `apps/api/src/domains/notes/notes.md` |
| Home | Authorized aggregation of workspace/project, task, and note reads through their services | `apps/api/src/domains/home/home.md` |
| Demo | Explicit once-per-account fictional fixtures; not normal production business writes | `apps/api/src/domains/demo/demo.md` |

Tasks and Notes ask Workspaces for scope validation. Home asks Workspaces, Tasks, and Notes for authorized lists. Demo is a documented fixture-orchestration exception that creates example records transactionally, then uses Home to return the current view. These dependencies are explicit, not permission to query another domain's tables from arbitrary services.

## Transactions and tenant boundaries

Every user-owned record has an explicit owner. Personal Inbox records may have null workspace/project, but never an absent owner. The server derives ownership from authentication, not from request bodies or the account-precondition header.

An owner transaction locks the user's database row. Task reads, scope/parent validation, cycle detection, revision checks, writes, and idempotency records use that same transaction context. This preserves the original race protections when splitting the code into modules. Moving validation outside the transaction would weaken the architecture even if the folder names looked right.

Controllers use strict shared validation from `packages/core`. Responses omit private persistence ownership and credential material. The public identity supplied to request handlers contains no password hash. Workspace isolation is enforced by queries and services, not by prompt instructions or UI filtering.

## Real ports, real adapters

Password hashing and verification use the `PasswordHasher` port with Node scrypt. Session material uses `SessionTokens` with cryptographic randomness and hashing. Platform request security depends on `SessionAuthenticator`; Identity supplies that behavior without Platform importing Identity. Task idempotency fingerprints use `ContentHasher` backed by SHA-256.

The database is a concrete adapter over the shared Drizzle connection and schema in `packages/db`. It provides a transaction context and owner locking. There is no invented `DatabaseProvider` port suggesting PostgreSQL will be swapped for an unrelated storage model.

AI, transcription, and storage ports will be introduced with their actual features. No empty provider folders are presented as implemented integrations.

## What differs from DAMSYN

- Keep Fastify, Zod, Drizzle, and the current PostgreSQL schema; this restructuring does not adopt NestJS, Prisma, Bun, Clerk, or DAMSYN's infrastructure.
- Ordo is personal-first. Do not import vendor/customer/admin commerce scopes, payment concepts, or permission catalogues.
- Preserve the existing `/v1` resource routes and camelCase fields. Folder restructuring does not silently rename the API consumed by web and future mobile clients.
- Keep shared contracts/schema/client packages in the monorepo; domain concept documentation stays beside its owning API code.
- External PostgreSQL, production operational hardening, generated OpenAPI, pagination/full-text API search, audit events, native-client authentication, and incremental sync remain release work.

## Verification and deeper reference

The API suite retains its original behavior regressions and adds TypeScript-AST import-boundary checks. These catch Platform depending on domains, SDK usage escaping adapters, and unapproved cross-domain imports. They complement integration tests; architecture checks do not prove authentication or persistence by themselves.

The detailed implementation guide is `apps/api/docs/architecture.md`, with endpoint contracts in `apps/api/README.md`. See [local development](LOCAL-DEVELOPMENT.md), [the build plan](coordination/BUILD-PLAN.md), and [the delivery ledger](PLAN.md) for runnable checks and actual evidence.
