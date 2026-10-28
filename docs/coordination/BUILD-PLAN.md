# Active build plan — Ordo on Cloudflare

**Updated:** 27 October 2026.

**Authorization:** Edward chose Cloudflare Workers (Free plan) with D1: "aligned" and "I don't want to pay $5", 27 October 2026 (C25, C26). Build authorization is not merge or deploy approval; Edward approves each merge and each deploy.

**Method:** coordinated-development. The coordinator writes briefs and checks PRs; specialists build in PRs; Edward approves.

**Implementation status:** the local build runs the Hono API in Node on embedded PostgreSQL (PGlite), with the Next.js dev server proxying `/api` and the web build producing a static export. Phase 1 is delivered; the remaining choices below are Phase 2 and 3 targets.

## Working choices

| Area | Choice |
|---|---|
| Hosting | One Cloudflare Worker on the Workers Free plan ($0/month): web app as static assets, API under `/api` on the same origin |
| API | Hono + TypeScript + Zod, keeping the platform/capabilities/adapters/domains structure and every current route and contract |
| Database | Cloudflare D1 with Drizzle `sqlite-core`; `wrangler d1 migrations`; text UUIDs; ISO text timestamps; date-only plus separate `HH:MM` times |
| Saving | Check-on-save: conditional writes on `revision`, unique idempotency keys, atomic `batch()`; no locks, interactive transactions, or Durable Objects |
| Search | SQLite FTS5 tables kept in sync by triggers |
| Sign-in | Code-only email/phone OTP via Gatekeeper; HMAC-SHA256 with a Worker secret; random session tokens stored as SHA-256 |
| Crypto and secrets | Web Crypto only; Workers secrets; AES-GCM for account-owned provider keys |
| Development | Node 22.23.2 and npm workspaces; Phase 1 runs in Node on the existing embedded database; Phase 2 adds `wrangler dev` with local D1 |
| Ownership model | Every user-owned row has an owner; the personal Inbox is null workspace and project, never a null owner |
| Dates and views | Date-only `YYYY-MM-DD` values; account timezone for presentation; My Day shows due/overdue work and due follow-ups; parent completion leaves children unchanged |
| Mobile | React Native + Expo + TypeScript, iOS first, against the hosted API with token sign-in; Mac (Tauri) later |

## Work allocation

All specialists run on Opus 5.5 at medium effort.

| Area | Specialist | Owned paths | Phase 1 deliverable |
|---|---|---|---|
| API/domain/database | Backend | `apps/api`, `packages/core`, `packages/db` | Web Crypto adapters; framework-neutral HTTP layer; Hono app and test shim; capability flags; Fastify removed (PRs 1–3) |
| Web/client | Web | `apps/web`, `packages/client` | Static export with same-origin `/api`; bookmark header plumbing stubbed (PRs 4–5) |
| Coordination | Coordinator | Root tooling, `docs`, `design`, integration checks | Briefs, PR checks, evidence, merges on Edward's word |

Specialists work on their own `edw/` branches from `main` with separate file ownership. No specialist changes another's paths or root dependencies without telling the coordinator. The full brief is the [Cloudflare Phase 1 brief](CLOUDFLARE-PHASE-1-BRIEF.md).

## Sequence and checks

1. Edward reviews the hosting documentation PR.
2. Backend PRs 1–3 and web PRs 4–5 proceed in parallel. Each runs `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run docs:check`, with screenshots.
3. The coordinator checks each PR and puts it to Edward with a plain summary; merges happen on his word.
4. After Phase 1 merges, re-verify the signed-in journeys on `npm run dev` and on the static export, then brief Phase 2 (D1).
5. After Phase 2 merges and passes on local D1, prepare Phase 3: Edward approves Cloudflare account access and the deploy; record the D1 restore point and rollback point; verify signed in on staging.
6. Native mobile follows hosted staging.
