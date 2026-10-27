# Cloudflare Phase 1 brief

**Owner decision:** Ordo is hosted on Cloudflare Workers (Free plan) with D1. Edward: "aligned" and "I don't want to pay $5", 27 October 2026 ([C25](DECISIONS.md)).

**Read first:** [technical architecture](../TECHNICAL.md), [Cloudflare platform spec](../specs/02-cloudflare-platform.md), [API architecture](../API-ARCHITECTURE.md), [local development](../LOCAL-DEVELOPMENT.md), and the repository `README.md`.

**Goal of Phase 1:** port the API to Hono with Web Crypto adapters and build the web app as a static export, **while everything keeps running locally in Node on the existing embedded database**, so every current test and browser journey still passes. D1 is Phase 2. Nothing is deployed in Phase 1, and no Cloudflare account or resource is created.

## Staffing and reporting

| Role | Model | Owns | Reports to |
|---|---|---|---|
| Backend specialist | Opus 5.5, medium effort | `apps/api`, `packages/core`, `packages/db` | Coordinator session |
| Web specialist | Opus 5.5, medium effort | `apps/web`, `packages/client` | Coordinator session |
| Coordinator | Opus 5.5 | `docs/`, root tooling, integration evidence | Edward |

Each specialist loads the `coordinated-development` skill as a specialist. Do not edit another specialist's paths; if you need a change there, ask the coordinator. Root `package.json` and the lockfile change only through your own workspace's dependency install, and you tell the coordinator when you do.

## Rules for both specialists

- Branch `edw/<topic>` from an up-to-date `main`, one branch per PR. Open PRs into `main`.
- Commits as `edwadjei <edd.net49@gmail.com>`. No AI attribution in commits or PR descriptions: no `Co-Authored-By` for an AI, no "Generated with" line.
- Never merge or deploy; Edward approves each merge. Do not create Cloudflare resources or accounts.
- Run every check before reporting, and state the actual results: `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, `npm run docs:check`.
- Do not touch `.env`, `.data`, or running processes (the servers on ports 3318 and 4318 belong to another tool). Verify on a separate stack with its own `ORDO_DATA_DIR`, for example ports 3328/4328. Use fictional test data only.
- Every PR includes screenshots, and UI PRs include desktop and narrow-mobile screenshots (C16).
- Check library APIs (Hono, `@hono/node-server`, Next.js static export) with Context7 before using them.
- Update the relevant concept note (`apps/api/src/domains/*/*.md`), workspace README, and [local development](../LOCAL-DEVELOPMENT.md) when behaviour changes. Describe what the code does; do not claim D1 or hosting is live.

## Backend specialist

Goal: the API runs on Hono with Web Crypto adapters, is framework-neutral inside platform and domains, and has no Fastify dependency, while still running in Node against the existing embedded database.

### PR 1 — Web Crypto adapters

Replace Node `crypto` in `apps/api/src/adapters/cryptography/*` and `platform/identifiers/new-id.ts` with `crypto.subtle`, `getRandomValues`, and `randomUUID`:

- `SessionTokens`: 32 random bytes as hex; SHA-256 hex digest. The digest format must match today's so existing local sessions keep working.
- `ContentHasher`: SHA-256 hex, identical output to today, so stored idempotency fingerprints still match.
- `OtpSecrets`: six-digit code from `getRandomValues` without modulo bias; hash with `HMAC-SHA256(challengeId + code, OTP_HMAC_KEY)`. Read the key from the environment; locally, follow the credential cipher's pattern (lazily generated owner-only key file under the data directory); in production refuse to start without the secret. Challenges hashed with scrypt expire within five minutes, so no data migration is needed.
- `PasswordHasher` stays only to verify legacy local accounts until they convert. Its scrypt implementation may remain as a Node-only adapter that the future Worker entry never imports; say so in the identity concept note.
- Secret cipher (`adapters/secrets/file-secret-cipher.ts`): AES-256-GCM through `crypto.subtle`, byte-compatible with today's ciphertext so saved provider keys still decrypt. Add a test that decrypts a value produced by the current implementation.
- Keep the architecture test's rule that cryptography lives in adapters and is wired only by the owning module.

### PR 2 — Framework-neutral HTTP layer

Define a small request/response abstraction in `apps/api/src/platform/http`: method, path params, query, headers, parsed JSON or raw body, cookie read/write, status, JSON response. Move controllers and platform guards (origin check, session resolution, sign-in throttle, `X-Ordo-Account` guard, error envelope, body limits) onto it, still hosted by Fastify in this PR. Module `register` functions use a small route-registration interface instead of `FastifyInstance`. After this PR nothing under `domains/` or `platform/` imports a framework type (every controller and module imports `FastifyInstance` today); extend the architecture test to enforce that.

### PR 3 — Hono app, test shim, capability flags, Fastify removed

- Mount the controllers on a Hono app at `/v1`. The Node entry uses `@hono/node-server` on `127.0.0.1:4318`, so the web dev proxy is unchanged. In Phase 2 the Worker serves the same app under `/api`.
- Replace `app.inject` in tests with a shim that calls `app.request()` and returns `{ statusCode, json(), headers, cookies }`, so test bodies change as little as possible. Every existing API test passes; do not weaken an assertion to make it pass.
- Keep the body limits (150,000 bytes JSON; 20 MiB transcription audio), the transcription concurrency limits, and client-disconnect cancellation.
- `GET /v1/capabilities` reports transcription provider availability and whether the secret cipher is configured. Local Whisper is reported available only when its loopback health check succeeds; on a runtime without it the flag is false and Settings shows Coming soon instead of an error.
- Delete the Fastify dependency and every Fastify-specific code path. `npm run dev:api` starts the Hono app in Node and still uses the embedded database through `packages/db`.
- Update `apps/api/README.md`, `apps/api/docs/architecture.md`, and the identity, tasks, and transcriptions concept notes to describe Hono and Web Crypto, and keep their "today: embedded PostgreSQL; D1 in Phase 2" status lines accurate.

Do not change the `packages/db` schema or migrations in Phase 1; the D1 schema is Phase 2 work.

## Web specialist

Goal: the web app builds as static files the Worker can serve, talks to the API on the same origin under `/api`, and is ready to carry the D1 bookmark header.

### PR 4 — Static export and same-origin `/api`

- Set `output: 'export'` in `apps/web/next.config.ts`. Remove or replace anything that needs a Node server at request time (rewrites in production builds, server actions, route handlers, server `headers()`/`cookies()`). Every page must render as static HTML plus client JavaScript; `npm run build --workspace @ordo/web` produces `apps/web/out`.
- The browser client calls `/api/...` relative to its own origin everywhere; no absolute API URL in browser code.
- Keep local development working unchanged: `npm run dev` still proxies `/api/*` to the API's `/v1/*` (the dev server may keep its rewrite while the export build omits it). Document that the Worker serves `/api` itself in Phase 2.
- Verify by serving `apps/web/out` with a simple static server that forwards `/api` to a scratch API, then perform the signed-in journeys: sign in with an injected code, create/edit/complete a task, save a note, search, reload. Desktop and narrow-mobile screenshots in the PR.

### PR 5 — Bookmark header plumbing (stubbed)

- In `packages/client`, read an `X-Ordo-Bookmark` response header when present, keep the latest value per account in memory and in localStorage beside the existing account-keyed queue, and send it on the next request.
- The API does not emit the header until Phase 2; the client must behave exactly as today when it is absent.
- Add client tests for store-and-forward, per-account separation, and clearing on sign-out.
- Update `apps/web/README.md` with the export build, the same-origin `/api` rule, the dev proxy, and the bookmark header.

## Done criteria for Phase 1

- No Fastify dependency in the repository. `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run docs:check` all pass.
- `npm run dev` runs web and API locally on the existing embedded database; the signed-in browser journeys in the verification record still pass.
- The static export signs in and saves a task through same-origin `/api`.
- No Node `crypto` import remains in code the Worker entry will use; the only Node-only cryptography is the legacy password verifier.
- Existing local sessions, idempotency fingerprints, and saved provider keys keep working after the adapter change.
- Concept notes and READMEs describe current behaviour and name D1 as Phase 2 rather than claiming it.

## Report format

Reply to the coordinator in plain English, in this order:

1. PR link, branch → base, and confirmation that commits use the required identity with no AI attribution.
2. What changed, per file area, and why.
3. Checks run and their actual results (test counts, build output).
4. Browser evidence: journeys performed and screenshots attached to the PR.
5. What it needs to reach users (nothing beyond merge in Phase 1, or say otherwise).
6. Anything you could not verify, any behaviour that differs from this brief, and questions for Edward.
