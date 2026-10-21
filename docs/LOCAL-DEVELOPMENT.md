# Local development

**Scope:** First responsive web core. No cloud deployment or native app is implied by these commands.

## Start Ordo

Use Node.js 22.23.2, as recorded in `.nvmrc`. From the repository root:

```bash
npm ci
npm run dev
```

Open [Ordo Web](http://127.0.0.1:3318). The API listens on `127.0.0.1:4318`; the web app proxies `/api` requests to `/v1` on that API so authentication stays on the browser's app origin. Both servers bind to loopback in the local configuration.

No Docker, external database account, AI key, or `.env` file is required for this local setup. Embedded PostgreSQL persists application data in repository `.data/ordo`. Keep one API process per data directory. Stop with Ctrl+C so database state closes cleanly. Do not delete `.data` when updating dependencies; it contains local account data.

Sign in with email or a Ghana phone number and a six-digit OTP. Gatekeeper delivery requires a privately configured key and URL; unavailable delivery shows Coming soon. Existing password accounts remain accessible, and successful first email OTP verification converts that account to passwordless access. Automated tests use injected delivery and never send real messages. Workspaces start empty. The sample-data action explicitly creates fictional MTN, DAMSYN, Dorsh, and Personal examples for the signed-in account; no real project data is imported.

Individual servers can be started with `npm run dev:api` and `npm run dev:web`. The combined `npm run dev` script loads optional repository-root `.env` before launching both processes. The API also loads optional root `.env` when started individually; web-only commands use their process environment.

## Configuration names

The root `.env.example` contains only non-secret local defaults. Set real credentials privately and never commit a populated `.env`.

| Name | Purpose |
|---|---|
| `API_PORT` | Local API port, default 4318 |
| `ORDO_API_URL` | API origin used by the Next.js proxy; default `http://127.0.0.1:4318` |
| `ORDO_DATA_DIR` | Optional embedded database path; default repository `.data/ordo` |
| `DATABASE_URL` | Optional standard PostgreSQL connection; bypasses embedded local database |
| `TRUSTED_ORIGINS` | Exact browser origins permitted for writes; defaults to localhost/127.0.0.1 on port 3318 |
| `NODE_ENV` | Production requires external PostgreSQL and explicit trusted origins; session cookie becomes Secure |

The external PostgreSQL driver uses the same schema but has not been exercised against a separate server here. Do not call that deployment path verified merely because embedded PostgreSQL passes tests. Native mobile authentication and distribution will be designed in the mobile slice.

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

The API workspace guide is `apps/api/README.md`; shared types and validation live in `packages/core/src/index.ts`. Request/response shapes and current limitations are documented there alongside the implementation. The baseline SQL is `packages/db/migrations/0001_core.sql` and the corresponding Drizzle schema is `packages/db/src/schema.ts`.

The first local startup initializes that schema and records its checksum. An applied migration is not silently edited or replayed. A future shared-environment migration requires the owner's approval and the backup/rollback gates in the engineering method. Concurrent multi-replica initialization is not a verified migration strategy.

## Current release limits

This build is local development, not a hosted release. Production proxy-aware abuse controls, contact linking/recovery, operational backup/restore, native-client authentication, and multi-instance migrations need release work. Recording upload/playback and configurable transcription are implemented for a single server. AI extraction and transcript imports show Coming soon. MCP, native mobile packages, and Mac packaging remain separate slices. See [phone verification](PHONE-TESTING.md) for HTTPS requirements and the actual-device checklist.

## Delivery and audio settings

`GATEKEEPER_API_KEY` and `GATEKEEPER_API_URL` enable OTP delivery. `OPENAI_API_KEY` enables transcription; otherwise the UI shows Coming soon. These credentials are server-only. Recording files default to private `.data/captures`, separate from `.data/ordo` PostgreSQL state. Back up both for recovery. The configured provider receives audio only after an explicit transcription request. Provider calls are not part of automated tests.

`ORDO_TLS_KEY`, `ORDO_TLS_CERT`, and optional `ORDO_HTTPS_PORT` configure the local phone HTTPS proxy. Certificate/device trust is not installed automatically. API origin checks still require the exact HTTPS origin in `TRUSTED_ORIGINS`.
