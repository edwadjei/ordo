# Ordo — implementation approach

**Status:** Platform order (C09) and hosting stack (C25) confirmed by Edward; the remaining items below are proposals.

**Baseline:** [Product brief](PRODUCT.md), [technical architecture](TECHNICAL.md), and the [Cloudflare platform spec](specs/02-cloudflare-platform.md).

**Principle:** Ship the reliable everyday workflow before adding intelligence.

## What we are building

A personal workspace for independent portfolios. My Day aggregates authorized work; each workspace isolates its projects, tasks, notes, and source material. A quick task should take one or two interactions. Work remains usable without a configured AI provider. Captures become durable before optional asynchronous analysis, and the user reviews generated suggestions before saving them.

Use Ordo, Ordo Web, Ordo for Mac, Ordo Mobile, Ordo AI, and Ordo MCP as the product names. Avoid team administration, workflow builders, email sending, and passive meeting capture in v1.

## Platform delivery

Edward confirmed **responsive web first → native iOS urgently next → macOS** on 21 October 2026. This supersedes the earlier PWA-first mobile decision and the original briefs’ platform sequence.

| Platform | Delivery scope and order | Delivery responsibility |
|---|---|---|
| Ordo Web | Browser experience for desktop and laptop | Web specialist |
| Ordo for iOS | Second, urgent: native app with phone-specific capture/navigation, shared API, and durable local capture; framework/distribution undecided | iOS specialist |
| Ordo for Mac | Third: packaged Mac app with verified authentication, permissions, and supported core workflows | Desktop specialist |
| Ordo for Android | Included in shared mobile delivery, with iOS prioritized; Android must not delay the iOS release | Mobile specialist |
| Installable PWA | Not the native mobile deliverable; responsive phone-browser access remains part of web | Not currently scheduled |

Responsive phone-browser design and verification start in the web core slice. Native iOS is a separate deliverable immediately afterwards, sharing authorized API/domain contracts. Do not substitute PWA installability for native iOS delivery. Choose the iOS framework before deciding which UI or validation code can be reused. AI/MCP completion and Mac packaging do not block beginning iOS.

For responsive web, verify phone-browser layout, touch capture, saving, and recovery on stated browsers/devices. For native iOS, verify installation/distribution, secure authentication, lifecycle changes, offline capture, synchronization, and accessibility on real devices. Add microphone/file permission and interruption checks when capture integrations land. Do not promise background recording without implementation evidence.

## Delivery options

| Option | Benefit | Cost or risk |
|---|---|---|
| **Selected platform order: responsive web → native iOS → Mac** | Exercises persistence and authorization early; preserves one domain boundary for web, Mac, and MCP | Requires authentication and local database decisions up front |
| Device-only Mac prototype first | Quickly explores capture on one machine | Delays cross-device authorization and creates a later persistence/sync transition |
| Build web, desktop, AI, and MCP together | Shows the full ambition early | Multiplies integration and review work before the everyday workflow is proven |

Edward selected the first platform order, including urgent native iOS. The other options are recorded alternatives, not active plans. Do not automatically inherit NestJS/Prisma or other stacks from the reference projects.

## Proposed boundaries

Follow the supplied monorepo shape, introducing directories only when they contain working code:

| Area | Responsibility | Introduce |
|---|---|---|
| `apps/web` | Responsive Home, navigation, capture, editing, and visible save state | Foundation/core |
| `apps/api` | Hono API in one Cloudflare Worker: authentication, authorization, validated REST, and deterministic domain services | Foundation/core; Hono in hosting Phase 1 |
| `packages/core` | Shared domain contracts, validation, hierarchy rules | Foundation/core |
| `packages/db` | Drizzle `sqlite-core` schema, D1 migrations, FTS5 definitions, and test fixtures | Foundation/core; D1 in hosting Phase 2 |
| `packages/client` | Typed calls to the same authorized API | Core |
| `packages/ui`, `packages/config` | Shared UI tokens and configuration where there is actual reuse | As needed |
| `packages/ai` and Queue/cron consumers in the Worker | Transcript import, provider adapters, staged suggestions | Intelligent capture |
| `apps/mcp` | Scoped agent adapter using the same domain API | Agent slice |
| `apps/mobile` (proposed) | React Native + Expo iOS/Android client against the shared API; iOS leads design/testing/release | Immediately after responsive web |
| `apps/desktop` | Mac shell and explicit OS integrations | After native iOS |

## Stack and hosting

Ordo runs as one Cloudflare Worker on the Workers Free plan: Next.js static export for the web app, Hono + Zod for the API under `/api`, and D1 with Drizzle `sqlite-core` for data (C25). Background work uses Cloudflare Queues or cron when AI workers arrive. Expo builds iOS/Android and Tauri 2 the Mac app. Exact versions and library integration are checked against Context7 during implementation. Native iOS distribution and desktop asset delivery are decided in their own phases. No dependency is selected merely because another project uses it.

| Phase | What changes | Where it runs |
|---|---|---|
| 1 | Hono port, Web Crypto adapters, web static export | Node locally, on the existing embedded database |
| 2 | D1 schema, FTS5, check-on-save, code-only sign-in, Worker entry, data import | `wrangler dev` with local D1 |
| 3 | Hosted staging | Edward's Cloudflare account, with his approval per deploy |

**Implementation status:** the local build runs the Hono API in Node on embedded PostgreSQL (Phase 1 done); D1 is Phase 2 and hosting is Phase 3.

The trade-off is deliberate: the Free plan allows 10 ms CPU per request and D1 has no interactive transactions. Ordo therefore keeps every request light (HMAC rather than scrypt, indexed owner-scoped queries) and saves with check-on-save rules instead of row locks. In return hosting costs nothing, and a limit is never billed; at worst requests fail until 00:00 UTC, and Workers Paid ($5/month) is a plan switch, not a rewrite.

## First build sequence

1. Review [the everyday core spec](specs/01-everyday-core.md) and settle the foundation scope/design decisions with Edward. The coordinator then prepares the task sequence and standalone specialist briefs under coordinated-development.
2. Review a clickable responsive web Home layout at laptop and phone widths: obvious capture actions, workspace/project navigation, task pane, focus behavior, and search. No supplied visual reference is assumed.
3. Establish the smallest runnable web/API/database foundation with authentication, scoped access, CI, and documented local setup.
4. Deliver one complete flow: create a task from Home, persist it, reload it, edit it, complete it, and see write failures accurately.
5. Extend that flow to workspaces, projects, subtasks, notes, derived daily views, search, and durable offline text capture.
6. The coordinator checks the specialist PRs and verification evidence before proposing integration to Edward.
7. Deliver native iOS next as the urgent platform, reusing the authorized API; resolve its framework and distribution path before implementation.
8. Proceed to macOS after iOS. Scope AI/MCP feature work through separate briefs without making their completion a prerequisite for starting iOS.

The technical brief groups prototype and infrastructure as Phase 0. The ledger splits documentation from that engineering foundation so this kickoff cannot be mistaken for a completed app scaffold.

## Contracts that need deliberate design

- **Inbox ownership:** global unsorted captures can have no workspace. Specify how an authenticated personal Inbox owns and authorizes tasks/captures without inventing a workspace or permitting ownerless rows. Define moves into workspaces and their audit/provenance behavior before schema work.
- **Task hierarchy:** enforce matching workspace/project and reject cycles, including reparenting. Decide whether completing a parent leaves children open; the draft spec proposes explicit independent completion.
- **My Day:** the briefs describe aggregation but do not specify manual selection or scheduling. The draft proposes due/overdue tasks and due follow-ups, with upcoming and undated work accessible elsewhere.
- **Offline durability:** define revisions, tombstones, local storage ownership, idempotent retries, and conflict handling before claiming offline support. A signed-out user's local data must not leak into another session.
- **Native iOS:** choose framework, authentication/session handling, durable local storage, distribution path, and supported OS/device targets before I2.
- **Desktop packaging (later):** resolve packaged assets and API authentication during the Mac phase. Preserve client-independent APIs now; Mac packaging decisions do not block web/iOS.

## AI and privacy boundary

Keep normal writes deterministic. Background jobs receive only authorized source and context, apply workspace provider policy, and produce validated suggestions. Selected edited suggestions commit atomically in one D1 batch with provenance and idempotency. A failed provider leaves the original source and manual editing intact.

Untrusted transcripts are data. They cannot authorize tool calls or access other workspaces. No automatic email sending. Store no audio or files (C20), keep provider keys out of clients/logs, and require the appropriate data-processing authorization before any external AI request.

## Evidence before expanding scope

Prove user-visible journeys and boundary failures: persistence after reload, cross-owner denial, project/workspace containment, cycles, duplicate write retries, save failure, and keyboard use. Later slices add recording failure, provider failure, reviewed AI commit, source linkage, scoped/revoked agent tokens, and native iOS/Mac checks as those clients are delivered. Performance figures in the briefs are targets until measured on a stated device and dataset.

## Shared mobile stack recommendation

Edward included Android while keeping an iOS bias. Recommend React Native + Expo + TypeScript in `apps/mobile`, sharing mobile screens and domain/API logic where appropriate. Preserve platform-specific navigation, permissions, keyboard behavior, and native UI details. iOS leads design, real-device testing, and release readiness; Android receives its own compatibility checks and must not hold up iOS. macOS remains after the priority mobile delivery. Exact Android release timing is not decided.

Keep the responsive web client separate. Share transport-neutral contracts, validation, and API client logic where compatible; web DOM components and native controls are not automatically interchangeable. Framework adoption and distribution details remain proposals until settled with Edward.

Documentation checked: [Expo core concepts](https://docs.expo.dev/core-concepts/), [platform-specific modules](https://docs.expo.dev/router/advanced/platform-specific-modules/), and Context7 `/websites/expo_dev` platform-specific UI guidance.
