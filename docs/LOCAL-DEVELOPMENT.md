# Local development

**Scope:** Running Ordo on your own machine. No cloud deployment or native app is implied by these commands.

**Implementation status:** today the API runs on Hono in Node with embedded PostgreSQL (PGlite), and the web app runs on the Next.js dev server with a `/api` proxy; `npm run build` also produces a static export of the web app. Hosted Ordo is one Cloudflare Worker with D1 ([technical architecture](TECHNICAL.md)). Phase 2 moves local development to `wrangler dev` with a local D1 database.

## Today and the target

| Concern | Today (local) | Target (Cloudflare) |
|---|---|---|
| API | Hono in Node on `127.0.0.1:4318` | Hono in the Worker under `/api` |
| Web | Next.js dev server on `127.0.0.1:3318`, proxying `/api/*` to `/v1/*`; `npm run build` writes a static export to `apps/web/out` | Static export served by the Worker, which answers `/api` itself (Phase 2); the dev proxy stays for local work |
| Database | Embedded PostgreSQL in `.data/ordo` | D1; locally a `wrangler dev` D1 database from Phase 2 |
| Migrations | Applied by the API at startup, with checksums | `wrangler d1 migrations apply`; nothing runs at Worker boot |
| Search | PostgreSQL full-text indexes | SQLite FTS5 tables kept in sync by triggers |
| Sign-in | Email/phone OTP; legacy password accounts still sign in | Code-only; legacy accounts convert at first code sign-in |
| Secrets | Optional root `.env`; credential key file fallback in `.data/secrets` | Workers secrets set with `wrangler secret put` |

## Start Ordo

Use Node.js 22.23.2, as recorded in `.nvmrc`. From the repository root:

```bash
npm ci
npm run dev
```

Open [Ordo Web](http://127.0.0.1:3318). The API listens on `127.0.0.1:4318`; the web app proxies `/api` requests to `/v1` on that API so authentication stays on the browser's app origin. Both servers bind to loopback in the local configuration.

No Docker, cloud account, AI key, or `.env` file is required for this local setup. Today embedded PostgreSQL persists application data in repository `.data/ordo`. Keep one API process per data directory. Stop with Ctrl+C so database state closes cleanly. Do not delete `.data` when updating dependencies; it contains local account data.

Sign in with email or a Ghana phone number and a six-digit OTP. Gatekeeper delivery requires a privately configured key and URL; unavailable delivery shows Coming soon. Existing password accounts remain accessible, and successful first email OTP verification converts that account to passwordless access. Automated tests use injected delivery and never send real messages. Workspaces start empty. The sample-data action explicitly creates fictional MTN, DAMSYN, Dorsh, and Personal examples for the signed-in account; no real project data is imported.

Individual servers can be started with `npm run dev:api` and `npm run dev:web`. To check the static export instead of the dev server, run `npm run build --workspace @ordo/web` and then `npm run serve:export --workspace @ordo/web`, which serves `apps/web/out` on port 3318 (`WEB_PORT` overrides) and forwards `/api/*` to the API's `/v1/*` the way the Worker will; stop `dev:web` first or choose another port. The combined `npm run dev` script loads optional repository-root `.env` before launching both processes. The API also loads optional root `.env` when started individually; web-only commands use their process environment.

## Configuration names

The root `.env.example` contains only non-secret local defaults. Set real credentials privately and never commit a populated `.env`.

| Name | Purpose |
|---|---|
| `API_PORT` | Local API port, default 4318 |
| `ORDO_API_URL` | API origin used by the Next.js dev proxy and `serve:export`; default `http://127.0.0.1:4318` |
| `WEB_PORT` | Port for `npm run serve:export --workspace @ordo/web`; default 3318 |
| `ORDO_DATA_DIR` | Optional embedded database path; default repository `.data/ordo` |
| `DATABASE_URL` | Today only: optional standard PostgreSQL connection that bypasses the embedded database; unverified and not part of the Cloudflare design |
| `TRUSTED_ORIGINS` | Exact browser origins permitted for writes; defaults to localhost/127.0.0.1 on port 3318 |
| `NODE_ENV` | Today, production mode requires `DATABASE_URL` and explicit trusted origins; the session cookie becomes Secure |

Hosted Worker secrets (names only): `OTP_HMAC_KEY`, `ORDO_CREDENTIAL_KEY`, `GATEKEEPER_API_KEY`, `GATEKEEPER_API_URL`. The D1 database is a Worker binding, not a connection string. Native token sign-in is designed alongside the Hono port.

## Checks and documentation

```bash
npm run typecheck
npm test
npm run build
npm run docs:check
```

The CI workflow runs these checks from a fresh dependency install. Its existence does not mean GitHub has run it; record actual hosted results after a PR exists. Local API integration tests use isolated databases and temporary directories, not the running user's data.

Documentation source is Markdown in `docs/`. `npm run docs:check` generates the local site and validates its links. Open `docs/html/index.html` directly, or use the already-running local documentation preview when available. Generated HTML is ignored by Git.

## API and migration reference

The API workspace guide is `apps/api/README.md`; shared types and validation live in `packages/core/src/index.ts`. Request/response shapes and current limitations are documented there alongside the implementation. The SQLite schema is `packages/db/migrations/0001_initial.sql` and the corresponding Drizzle schema is `packages/db/src/schema.ts`.

Numbered files are applied with `wrangler d1 migrations apply ordo --local` for development and, with Edward's approval, against staging; an applied file is never edited. The Worker never runs migrations itself. Every shared-environment migration needs the owner's approval, a D1 restore point, and the rollback gates in the engineering method.

## Phase 2 local workflow: the API on `wrangler dev`

The backend half of Phase 2 has landed: the API is one Worker under `wrangler dev` on a local D1 database, and the Node API, PGlite and password sign-in are gone. A fresh machine runs it without a Node API process (no Cloudflare account or login is needed; everything is `--local`):

```bash
npm ci
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm run db:migrate:local --workspace @ordo/api
npm run build --workspace @ordo/web
npm run dev --workspace @ordo/api
```

Open `http://127.0.0.1:8788`: the Worker serves the static export from `apps/web/out` and answers `/api/*` (as `/v1/*`) on the same origin. Sign in with any email address; with `ORDO_ENV=development` and no Gatekeeper values, the code is printed in the `wrangler dev` terminal and nothing is sent. The local D1 database lives in `apps/api/.wrangler/state` (git-ignored). Variable names and the development defaults are listed in the API guide, `apps/api/README.md` ("Configuration"). The web dev-server workflow on top of the Worker (and the root `npm run dev`, which still starts the Next.js dev server proxying to the old port 4318) is the web half of Phase 2.

A one-time import moves content from the old `.data/ordo` into local D1: export a copy with `packages/db/scripts/export-embedded.mjs` from a pre-Phase-2 checkout, then load it with `npm run db:import:local --workspace @ordo/api -- --from <export folder>`, which checks counts per table. See `apps/api/README.md` ("Moving content from the old embedded database") and the [platform spec](specs/02-cloudflare-platform.md#data-import-from-the-local-database).

## Current release limits

This build is local development, not a hosted release. Hosted staging is Phase 3. Today's sign-in throttle is per process in memory; the hosted design stores it in D1 keyed by `CF-Connecting-IP`. Contact linking/recovery and native-client authentication need further work. Recording-to-transcription uses temporary memory only; Ordo stores no audio or uploaded files. AI extraction and transcript imports show Coming soon. MCP, native mobile packages, and Mac packaging remain separate slices. See [phone verification](PHONE-TESTING.md) for HTTPS requirements and the actual-device checklist.

## Delivery and audio settings

`GATEKEEPER_API_KEY` and `GATEKEEPER_API_URL` enable OTP delivery. HTML email branding is enabled by default; `GATEKEEPER_EMAIL_HTML=false` selects the plain-text fallback. Audio settings default to local Whisper on this Mac; optional online keys are entered per account in Settings. Local Whisper is a local-Mac development option only: hosted Ordo uses the account's own OpenAI key and reports local Whisper as unavailable. See [audio setup](AUDIO-SETUP.md). These credentials are server-only. There is no audio data directory or file storage. Recording bytes exist only in memory while a transcription request is processed, then are cleared on success, failure, or timeout. The configured provider receives audio for transcription; provider-side retention is governed separately by that provider. Only transcript text explicitly saved as a note persists in the database. Provider calls are not part of automated tests.

`ORDO_TLS_KEY`, `ORDO_TLS_CERT`, and optional `ORDO_HTTPS_PORT` configure the local phone HTTPS proxy. Certificate/device trust is not installed automatically. API origin checks still require the exact HTTPS origin in `TRUSTED_ORIGINS`.
