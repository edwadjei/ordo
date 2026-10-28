# Cloudflare Phase 2 brief

**Owner decisions:** Ordo is hosted on Cloudflare Workers (Free plan) with D1 ([C25](DECISIONS.md)). Edward: "Proceed with PH 2", 28 October 2026. Edward wants each phase delivered as **one single PR**.

**Read first:** [Cloudflare platform spec](../specs/02-cloudflare-platform.md) (the design rules in "Design decisions and rules", "Data import" and the Phase 2 acceptance scenarios are binding), [technical architecture](../TECHNICAL.md), [API architecture](../API-ARCHITECTURE.md), [local development](../LOCAL-DEVELOPMENT.md), and the [Phase 1 brief](CLOUDFLARE-PHASE-1-BRIEF.md) for conventions.

**Goal of Phase 2:** Ordo runs locally as **one Worker under `wrangler dev`**, serving the static web export and the Hono API on a **local D1 database**, with every API test passing against D1. Embedded PostgreSQL is removed. Nothing is deployed and no Cloudflare account or resource is created; that is Phase 3.

## Staffing and order

| Role | Model | Owns | When |
|---|---|---|---|
| Backend specialist | Opus 5.5, medium effort | `apps/api`, `packages/core`, `packages/db`, the Worker entry and its Wrangler configuration, the local data import script | First |
| Web specialist | Opus 5.5, medium effort | `apps/web`, `packages/client` | After the backend branch exists; builds on it |
| Coordinator | Opus 5.5 | `docs/`, root tooling, combining, integration evidence, running the import on Edward's data | Throughout |

All work lands on one branch, `edw/cf-phase-2`, as a series of focused commits, and becomes **one PR into `main`**. The backend specialist creates the branch from `main` and pushes; the web specialist continues on the same branch after the backend reports. Do not open separate PRs.

## Rules

- Load the `coordinated-development` skill as a specialist. Commits as `edwadjei <edd.net49@gmail.com>`; no AI attribution anywhere. Never merge or deploy.
- Never run `wrangler login`, `wrangler deploy`, `wrangler d1 create` against a real account, or anything that needs a Cloudflare account. Use `--local` for every D1 command.
- Do not touch `.env`, the real `.data/ordo`, or processes on ports 3318/4318. Verify with fictional data on separate ports (backend 8788, web 3358).
- Check Wrangler, D1, Drizzle `sqlite-core`, Miniflare and Hono APIs with Context7 before using them; pin exact versions.
- Every request must stay inside the Free plan's **10 ms CPU** budget. No scrypt or other deliberately slow work on any request path.
- Run and report: `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, `npm run docs:check`. Update concept notes, workspace READMEs and [local development](../LOCAL-DEVELOPMENT.md) to describe what the code now does.

## Backend specialist

Suggested commit order; each commit leaves the tree building and tested.

1. **D1 schema and migrations.** Rewrite `packages/db` for `drizzle-orm/sqlite-core` (text UUIDs, ISO text timestamps, date + `HH:MM` fields, all current tables and constraints including the task time and name-length rules). One fresh numbered migration set under `packages/db/migrations` applied with `wrangler d1 migrations apply --local`, including FTS5 tables and triggers for tasks (with responsible and waiting-on names), notes and projects, plus the `auth_throttle` table and `otp_challenges.consumed_by`. Remove PGlite, `postgres` and migration-at-boot code.
2. **Test harness on local D1.** Run the existing `node:test` suites against a local D1 binding (Miniflare in Node is the preferred route; justify any runner change). Each test gets an isolated database with migrations applied. Account setup in tests goes through the code sign-in flow with an injected delivery transport.
3. **Check-on-save.** Replace the owner-lock transaction helper with the spec's rules at every call site: conditional updates on `revision` (409 `REVISION_CONFLICT`), unique idempotency keys inside `batch()`, ancestor-revision conditions on hierarchy moves, `NOT EXISTS` active-children guards, conditional subtask inserts, the demo-fixture claim. Add concurrency tests for each rule.
4. **Sign-in on D1.** Code request as one upsert (429 when no row returns); verify in the spec's three steps with the `consumed_by` compare-and-set so a code works exactly once; `auth_throttle` upserts keyed by route and `CF-Connecting-IP`. **Remove password registration and login entirely** (routes, service code, scrypt verifier): hosted Ordo is code-only and the import never copies password hashes. Add tests for replayed codes, attempt limits, resend spacing and throttling.
5. **Search on FTS5.** Parameterized `MATCH` with `bm25()` ranking, archived rows excluded, 30-result cap, people names searchable. Keep the existing response shape.
6. **Worker entry and Wrangler.** `apps/api/src/worker.ts` exporting the Hono app; `apps/api/wrangler.jsonc` with the D1 binding, `nodejs_compat` only if a dependency needs it, static assets from `apps/web/out` with `/api/*` routed to the Worker and mapped to `/v1/*`, and secrets read from bindings (`OTP_HMAC_KEY`, `ORDO_CREDENTIAL_KEY`, `GATEKEEPER_API_KEY`, `GATEKEEPER_API_URL`) with `.dev.vars` for local values (git-ignored; provide `.dev.vars.example` with names only). D1 Sessions: open a session from the request's `X-Ordo-Bookmark` and return the latest bookmark in the response header. Local code delivery: Gatekeeper when configured; otherwise a **development-only console transport**, enabled only when `ORDO_ENV=development` and refused in any other environment.
7. **Local data import.** A script that reads an exported copy of the embedded database (users, workspaces, projects, tasks, idempotency keys, notes, audio settings; never sessions, codes or password hashes), transforms it per the spec and loads it into local D1 in batches with per-table counts. Develop and test it against a fictional fixture. **Do not run it on Edward's real `.data`**; the coordinator does that with his approval.

Report when the branch is pushed: head commit, what each commit does, check results with counts, the commands to run Ordo locally, and anything you could not verify (including CPU timing per route if you measured it).

## Web specialist

Starts from the pushed `edw/cf-phase-2` after the backend reports.

1. **Local development on the Worker.** `npm run dev` gives a working app against `wrangler dev`: either Next.js dev proxying `/api` to the Worker, or a built export served by the Worker, documented clearly. Remove anything that only served the Node API.
2. **Bookmarks.** Confirm the client stores and returns the bookmark the Worker now sends. If D1 bookmarks are ordered, keep the newest when responses arrive out of order; cite the documentation.
3. **Signed-in browser journeys on `wrangler dev`:** code sign-in with the console transport, load examples, create, edit (time and people), complete, note save, search, Waiting On, reload persistence, sign-out. Desktop and 390px screenshots under `design/evidence/cf-phase-2/`.

Report: head commit, what changed, checks, screenshots, and what you did not verify.

## Done criteria for Phase 2

- No PGlite, PostgreSQL driver, password routes or Node API entry remain.
- `wrangler dev` serves the web app and API from one origin on a local D1 database; migrations apply with `wrangler d1 migrations apply --local`.
- All checks pass; API tests run against local D1, including the new concurrency and sign-in tests.
- Signed-in browser journeys pass on `wrangler dev`, with screenshots.
- The import script loads a fictional fixture with matching counts.
- Docs describe the new local setup; nothing claims hosting is live.
