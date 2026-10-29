# Hosting runbook

**Scope:** Hosting Ordo on Cloudflare (Phase 3 of the [Cloudflare platform spec](specs/02-cloudflare-platform.md)). There is one hosted deployment, Worker `ordo` with D1 database `ordo`, at `https://ordo.edward-dejaysblog.workers.dev`. This runbook covers creating the database, applying migrations, setting secrets, deploying, checking, measuring CPU time and rolling back.

**Status (29 October 2026):** Steps 1 to 3 are done: D1 `ordo` (id `fa30bd33-275d-4120-8d0e-a6a50887687d`, region WEUR) has migrations 0001–0003, and Worker `ordo` is live. In step 4 only `OTP_HMAC_KEY` is set; `ORDO_CREDENTIAL_KEY`, `GATEKEEPER_API_KEY` and `GATEKEEPER_API_URL` wait for Edward. Signed-out checks passed; the signed-in checks and their CPU measurement wait for sign-in. Restore point, versions and evidence are in the [delivery ledger](PLAN.md#release-record) and [verification](coordination/VERIFICATION.md#hosted-ordo-on-cloudflare-29-october-2026). The hosted settings live at the top level of `apps/api/wrangler.jsonc`.

**Edward's decisions (29 October 2026):** one deployment only ("just ordo, I don't want to be running 2"), on the free `workers.dev` address, run with production care. Only Edward signs in for now, with real codes through his Gatekeeper key. He keeps a copy of `ORDO_CREDENTIAL_KEY` in his password manager.

**Approval rule:** every step marked **[Edward's OK]** creates or changes something on Edward's Cloudflare account. It runs only on Edward's own word for that step, given in the session that runs it. An approval relayed by another agent is not enough. The account also holds unrelated resources (the Worker `worker-purple-shape-21fe` and the zone `damsyn.com`); nothing in this runbook touches them.

## What is hosted

| Thing | Value |
|---|---|
| Account | Edward [DEJAYSBLOG], Workers Free plan |
| Worker | `ordo`, at `https://ordo.edward-dejaysblog.workers.dev` only (preview URLs off) |
| D1 database | `ordo`, binding `DB`; migrations from `packages/db/migrations` |
| Workers AI | Binding `AI`; Whisper transcription on (`ORDO_WORKERS_AI=on`) |
| Plain variables | `ORDO_ENV=production`, `ORDO_WORKERS_AI=on`, `TRUSTED_ORIGINS=https://ordo.edward-dejaysblog.workers.dev` |
| Secrets | `OTP_HMAC_KEY`, `ORDO_CREDENTIAL_KEY`, `GATEKEEPER_API_KEY`, `GATEKEEPER_API_URL` (names only; values live only in Cloudflare, plus Edward's own copy of `ORDO_CREDENTIAL_KEY`) |
| Logs | Workers Logs (observability on): CPU and wall time per request, 200,000 events a day, kept 3 days |
| Cost | $0 on the Workers Free plan. Over a limit, requests fail until 00:00 UTC and nothing is billed |

Any `ORDO_ENV` other than `development` is hosted. Codes are sent for real through Gatekeeper (there is no console code sender), cookies are Secure, and `/api` refuses to start without `OTP_HMAC_KEY` and `TRUSTED_ORIGINS`. Until `OTP_HMAC_KEY` is set, every `/api` route (including `/api/health`) answers 500 while the web pages load.

### Local development is unaffected

The same configuration file runs `npm run dev`:

- **Database:** `wrangler dev --local` and the `--local` D1 commands use `preview_database_id` (the old placeholder id), so the local database in `apps/api/.wrangler/state` stays the same one it was before hosting.
- **Settings:** `apps/api/.dev.vars` (created from `.dev.vars.example`) sets `ORDO_ENV=development`, an empty `TRUSTED_ORIGINS` and an empty `ORDO_WORKERS_AI`. Its values override the hosted `vars`, so local work stays in development mode. If a `.dev.vars` lacks one of those names, the hosted value applies: local writes are then refused, or the API reports a missing key. Nothing is sent anywhere.

## Before every command

Wrangler 4 needs Node 22. From a new terminal:

```bash
nvm use 22.23.2
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler whoami
```

`whoami` must show the account "Edward [DEJAYSBLOG]". The main checkout must be on `main` with this configuration merged.

## Step 1: create the D1 database [Edward's OK]

```bash
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler d1 create ordo
```

This creates one empty database for $0. Copy the printed `database_id` into `d1_databases[0].database_id` in `apps/api/wrangler.jsonc` by pull request; the id is not secret. Steps 2 onwards run only after that pull request is merged.

## Step 2: restore point, then migrations [Edward's OK]

Record the Time Travel restore point first, then apply:

```bash
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler d1 time-travel info ordo --json
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler d1 migrations list ordo --remote
cd /Users/edwadjei/projects/ordo && npm run db:migrate:remote --workspace @ordo/api
```

Record the bookmark from the first command in the [delivery ledger](PLAN.md) as the restore point. D1 Time Travel can restore any minute within the retention window, which is 7 days on the Free plan. Then check:

```bash
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler d1 migrations list ordo --remote
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler d1 execute ordo --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

No migrations should be pending, and the list should show the Ordo tables and FTS tables. Every later migration repeats this step: restore point first, then apply. Applied migration files are never edited, and the Worker never runs migrations itself.

## Step 3: deploy [Edward's OK]

Deploy from a clean, detached worktree of exactly `origin/main`, never from a working copy:

```bash
git -C /Users/edwadjei/projects/ordo fetch origin
git -C /Users/edwadjei/projects/ordo worktree add --detach /Users/edwadjei/projects/ordo-deploy origin/main
cd /Users/edwadjei/projects/ordo-deploy && npm ci && git rev-parse HEAD
cd /Users/edwadjei/projects/ordo-deploy/apps/api && npx wrangler versions list --json
cd /Users/edwadjei/projects/ordo-deploy && npm run deploy
git -C /Users/edwadjei/projects/ordo worktree remove /Users/edwadjei/projects/ordo-deploy
```

- `git rev-parse HEAD` prints the commit being deployed. `versions list` shows the live version, which is the **rollback point**. Record both in the ledger before deploying. On the first deploy `versions list` reports that the Worker does not exist, so there is no earlier version.
- `npm run deploy` runs typecheck, tests and the full build (including the web static export in `apps/web/out`), and deploys only if all of them pass.
- The account's `workers.dev` subdomain (`edward-dejaysblog`) already exists, so the deploy does not register one.
- Wrangler's binding table prints `env.DB (00000000-…)`, the local `preview_database_id`. That is display only: Wrangler 4.153 uploads `database_id` for a deploy and uses the preview id only for local development.

## Step 4: secrets [Edward's OK, one per secret]

Each `secret put` creates and deploys a new Worker version straight away. Values are never printed, committed or pasted into chat.

`OTP_HMAC_KEY` is generated and passed straight in, so nobody sees it. Losing it only invalidates codes in flight.

```bash
cd /Users/edwadjei/projects/ordo/apps/api && openssl rand -hex 32 | npx wrangler secret put OTP_HMAC_KEY
```

`ORDO_CREDENTIAL_KEY` is kept by Edward. He generates it, saves it in his password manager, then pastes it at the prompt:

```bash
openssl rand -hex 32
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler secret put ORDO_CREDENTIAL_KEY
```

Then clear the terminal so the key does not stay on screen. With the saved copy, accounts' encrypted provider keys survive if the secret ever has to be set again.

Edward pastes the Gatekeeper values at the prompts himself. Afterwards, `secret list` shows the names only; all four must be there:

```bash
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler secret put GATEKEEPER_API_KEY
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler secret put GATEKEEPER_API_URL
cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler secret list
```

`TRUSTED_ORIGINS` is a plain variable in `wrangler.jsonc`, reviewed by pull request, because it is not secret.

## Step 5: checks

Signed out (read-only):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ordo.edward-dejaysblog.workers.dev/
curl -s https://ordo.edward-dejaysblog.workers.dev/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://ordo.edward-dejaysblog.workers.dev/api/auth/me
curl -s https://ordo.edward-dejaysblog.workers.dev/api/capabilities
```

| Request | Expected | Proves |
|---|---|---|
| `/` | 200 | The web app (static assets) is served |
| `/api/health` | `{"status":"ok"}` | The Worker runs and its configuration loads (without `OTP_HMAC_KEY` it answers 500) |
| `/api/auth/me` | 401 | Secrets and variables loaded and the route exists. A 500 means a configuration problem; a 404 means a routing problem |
| `/api/capabilities` | Workers AI transcription available | The `AI` binding is wired |

Signed in (sends a real code to Edward, so it needs his OK): sign in, create, edit and complete a task, save a note, search, reload, and transcribe a short recording with Workers AI. Only Edward signs in. An agent checking signed-in behaviour works in Edward's session, or Edward gives it the code himself. Record results, and anything not checked, in [verification evidence](coordination/VERIFICATION.md).

## Step 6: CPU time against the budget

The Free plan allows 10 ms CPU per request. Ordo targets reads under 3 ms, and writes, code verification and search under 5 ms. I/O wait does not count.

1. During the signed-in check, stream invocations:

   ```bash
   cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler tail ordo --format json
   ```

   The same invocations, with CPU time, appear in the Cloudflare dashboard under Workers & Pages → `ordo` → Observability.
2. Exercise each route at least five times: `GET /api/home`, `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `POST /api/notes`, `GET /api/search`, `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `GET /api/auth/me`, and transcription.
3. Record median and maximum CPU ms per route against the [free-plan budget](specs/02-cloudflare-platform.md#free-plan-budget), together with the day's request count and the D1 rows read and written:

   ```bash
   cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler d1 info ordo
   ```

A route over its target goes to the API specialist with the numbers.

## Rollback

- **Code:** roll back to the version id recorded in step 3 with `wrangler rollback`, run from `apps/api`. The exact command, with the real id, goes into the ledger at deploy time. Rollback needs Edward's OK and is reported with the reason.
- **First deploy:** there is no earlier version. The undo is deleting the Worker, which needs Edward's OK:

  ```bash
  cd /Users/edwadjei/projects/ordo/apps/api && npx wrangler delete
  ```

- **Data:** restore D1 only when a migration or a bad write damaged data. Use `wrangler d1 time-travel restore ordo` with the bookmark recorded in step 2; the exact command goes into the ledger with that bookmark. A restore overwrites everything written since the restore point, so it needs Edward's OK and a note of what is lost.

## Not part of this runbook

- Importing local data into the hosted database (spec, "Data import"). That is a separate step with its own approval.
- A custom domain. Ordo stays on `workers.dev` until Edward decides otherwise.
- Deploying from CI. Deploys are manual; CI deploys would need a Cloudflare API token stored as a GitHub secret, which is an account and secret change for later.
