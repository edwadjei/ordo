# Local development

**Scope:** Running Ordo on your own machine. No cloud deployment or native app is implied by these commands.

**Implementation status:** Ordo runs locally as one Cloudflare Worker under `wrangler dev` on a local D1 database: the Worker serves the web app's static export and answers `/api` itself. For day-to-day web work the Next.js dev server runs beside it and proxies `/api` to the Worker. Local work uses no Cloudflare account. Hosting is Phase 3: one Worker `ordo` at `https://ordo.edward-dejaysblog.workers.dev`, configured at the top level of the same `apps/api/wrangler.jsonc`. Local work keeps its own database (`preview_database_id`) and settings (`.dev.vars` overrides the hosted `vars`). Every step on the account is in the [hosting runbook](HOSTING-RUNBOOK.md). Nothing is hosted yet.

## Local and hosted

| Concern | Local (`npm run dev`) | Hosted (Phase 3, [runbook](HOSTING-RUNBOOK.md)) |
|---|---|---|
| API | Hono in the Worker under `wrangler dev` on `127.0.0.1:8788`; `/api/*` is mapped to `/v1/*` | The same Worker under `/api` |
| Web | Next.js dev server on `127.0.0.1:3358` with hot reload, proxying `/api/*` to the Worker; the Worker also serves the last static export (`apps/web/out`) on 8788 | Static export served by the Worker |
| Database | Local D1 in `apps/api/.wrangler/state` (ignored by Git) | D1 |
| Migrations | `wrangler d1 migrations apply ordo --local`, run by `npm run dev` before it starts the servers | `npm run db:migrate:remote --workspace @ordo/api` (D1 `ordo`) after a Time Travel restore point; nothing runs at Worker boot |
| Search | SQLite FTS5 tables kept in sync by triggers | The same |
| Sign-in | Code only; with no Gatekeeper values the code prints in the terminal | Code only, delivered by Gatekeeper |
| Secrets | `apps/api/.dev.vars` (ignored by Git; names in `.dev.vars.example`) | Workers secrets set with `wrangler secret put`; `ORDO_ENV`, `ORDO_WORKERS_AI` and `TRUSTED_ORIGINS` are plain `vars` in `wrangler.jsonc` (overridden locally by `.dev.vars`) |

## Start Ordo

Use Node.js 22.23.2, as recorded in `.nvmrc`. From the repository root:

```bash
npm ci
npm run dev
```

Open [Ordo Web](http://127.0.0.1:3358). `npm run dev` creates `apps/api/.dev.vars` from the example if it is missing, applies any new local D1 migrations, then starts two processes and stops both on Ctrl+C:

- `wrangler dev` on `127.0.0.1:8788`: the API on local D1, plus the static export from `apps/web/out`.
- `next dev` on `127.0.0.1:3358`: the web app with hot reload. It forwards `/api/*` unchanged to the Worker, so the browser uses one origin and an HttpOnly first-party session cookie, and the `X-Ordo-Bookmark` header passes through in both directions.

Sign in with any email address. With `ORDO_ENV=development` and no Gatekeeper values in `.dev.vars`, the six-digit code is printed in the terminal (`[ordo dev] Sign-in code for a•••@example.test: …`) and nothing is sent. There are no passwords. Automated tests use injected delivery and never send real messages. Workspaces start empty; the sample-data action creates fictional MTN, DAMSYN, Dorsh, and Personal examples for the signed-in account only.

No Docker, cloud account, `wrangler login`, AI key, or root `.env` file is needed. `npm run dev` no longer reads a root `.env`; local Worker settings live only in `apps/api/.dev.vars`.

### Checking the built export on the Worker

The Worker serves whatever is in `apps/web/out` on port 8788, as hosted Ordo will. To check it with the current code:

```bash
npm run build --workspace @ordo/web
npm run dev
```

Then open `http://127.0.0.1:8788`. If `apps/web/out` does not exist yet, `npm run dev` creates it empty so `wrangler dev` can start; port 3358 still works. The export has a single page and no client-side routes, so the Worker's `404-page` handling is enough; single-page fallback routing is not needed.

### The service worker

The built export registers a service worker (`apps/web/public/sw.js`) so Ordo opens offline; `next dev` on 3358 never registers it. On 8788 it keeps the last export it saw: after rebuilding, reload once for the new page, or clear it in the browser's developer tools (Application → Service workers → Unregister, and Clear storage). It never caches `/api`. To check offline opening, load `http://127.0.0.1:8788` once, then switch the browser to offline and reload.

### Running the pieces separately

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm run db:migrate:local --workspace @ordo/api
npm run dev --workspace @ordo/api
npm run dev --workspace @ordo/web
```

Run the last two in separate terminals. `npm run dev:api` and `npm run dev:web` from the root are shortcuts for them; neither applies migrations.

## Configuration names

| Name | Where | Purpose |
|---|---|---|
| `ORDO_API_URL` | Environment of `next dev` | Worker origin for the dev proxy; default `http://127.0.0.1:8788`. Not exposed to the browser |
| `ORDO_ENV` | `apps/api/.dev.vars` | `development` enables the console code transport, a temporary OTP key when `OTP_HMAC_KEY` is empty, non-Secure cookies and the local trusted origins |
| `TRUSTED_ORIGINS` | `apps/api/.dev.vars` | Exact browser origins permitted for writes; empty in development means `127.0.0.1` and `localhost` on ports 8788 and 3358 |
| `OTP_HMAC_KEY`, `ORDO_CREDENTIAL_KEY`, `GATEKEEPER_API_KEY`, `GATEKEEPER_API_URL` | `apps/api/.dev.vars` locally; Worker secrets when hosted | See the API guide, `apps/api/README.md` ("Configuration") |
| `ORDO_FAKE_TEXT_AI` | `apps/api/.dev.vars` | `on` answers Process with AI with a deterministic fake model, so the capture journey runs locally without AI calls; refused unless `ORDO_ENV=development` |

### AI capture without real AI

Workers AI cannot run under `wrangler dev --local`, and own-key providers cost money, so local AI capture uses a fake model. Set `ORDO_FAKE_TEXT_AI=on` (with `ORDO_ENV=development`) in `apps/api/.dev.vars` and restart `npm run dev`. Every provider choice in Settings then gets the fake model, which makes no network call and answers from the note's own text:

- a summary from the first sentence;
- up to three tasks from the first sentences, the first due tomorrow with high priority;
- when the note has at least two sentences and a capitalised name inside a sentence, the last task becomes a follow-up waiting on that name, due tomorrow;
- one email draft about the first task;
- a high-confidence destination when a project name or alias of the chosen workspace appears in the text, otherwise low confidence with no project.

Runs record the model as `ordo-development-fake`. The Worker refuses to start with `ORDO_FAKE_TEXT_AI=on` outside development.

Ports 8788 (Worker) and 3358 (web) are set in `apps/api/wrangler.jsonc` and `apps/web/package.json`. The D1 database is a Worker binding, not a connection string. Native token sign-in is designed alongside the Hono port.

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

Numbered files are applied with `wrangler d1 migrations apply ordo --local` for development and, with Edward's approval, against the hosted `ordo` database (`npm run db:migrate:remote --workspace @ordo/api`, see the [hosting runbook](HOSTING-RUNBOOK.md)); an applied file is never edited. The Worker never runs migrations itself. Every shared-environment migration needs the owner's approval, a D1 restore point, and the rollback gates in the engineering method.

## Moving content from the old embedded database

A one-time import moves content from the old `.data/ordo` into local D1: export a copy with `packages/db/scripts/export-embedded.mjs` from a pre-Phase-2 checkout, then load it with `npm run db:import:local --workspace @ordo/api -- --from <export folder>`, which checks counts per table. See `apps/api/README.md` ("Moving content from the old embedded database") and the [platform spec](specs/02-cloudflare-platform.md#data-import-from-the-local-database).

## Current release limits

This build is local development, not a hosted release. Hosting is Phase 3 ([hosting runbook](HOSTING-RUNBOOK.md)). The sign-in throttle is stored in D1 (`auth_throttle`) keyed by route and `CF-Connecting-IP`. Contact linking/recovery and native-client authentication need further work. Recording-to-transcription uses temporary memory only; Ordo stores no audio or uploaded files. Pasted emails and transcript files (`.txt`, `.md`, `.vtt`, `.srt`) are read in the browser and saved as note text only; AI extraction shows Coming soon. MCP, native mobile packages, and Mac packaging remain separate slices. See [phone verification](PHONE-TESTING.md) for HTTPS requirements and the actual-device checklist.

## Delivery and audio settings

`GATEKEEPER_API_KEY` and `GATEKEEPER_API_URL` enable OTP delivery. HTML email branding is enabled by default; `GATEKEEPER_EMAIL_HTML=false` selects the plain-text fallback. Audio settings default to Workers AI Whisper, which needs a Cloudflare account and is therefore off under local `npm run dev` (`ORDO_WORKERS_AI`); to transcribe locally, choose OpenAI and save a key in Settings. See [audio setup](AUDIO-SETUP.md). These credentials are server-only. There is no audio data directory or file storage. Recording bytes exist only in memory while a transcription request is processed, then are cleared on success, failure, or timeout. The configured provider receives audio for transcription; provider-side retention is governed separately by that provider. Only transcript text explicitly saved as a note persists in the database. Provider calls are not part of automated tests.

`ORDO_TLS_KEY`, `ORDO_TLS_CERT`, and optional `ORDO_HTTPS_PORT` configure the local phone HTTPS proxy. Certificate/device trust is not installed automatically. API origin checks still require the exact HTTPS origin in `TRUSTED_ORIGINS`.
