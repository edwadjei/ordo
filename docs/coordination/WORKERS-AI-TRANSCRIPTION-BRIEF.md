# Workers AI transcription brief

**Owner decision:** Edward, 28 October 2026: "Workers AI Whisper". Ordo transcribes recordings with **Cloudflare Workers AI Whisper** by default. An account-owned OpenAI key stays available as an optional provider in Settings. Local Whisper is not part of Ordo, because a Worker cannot run it. Delivered as **one PR** from branch `edw/workers-ai-transcription`.

**Read first:** [Cloudflare platform spec](../specs/02-cloudflare-platform.md), [technical architecture](../TECHNICAL.md), [audio setup](../AUDIO-SETUP.md), `apps/api/README.md`, `apps/api/src/domains/audio-settings/audio-settings.md`, `apps/api/src/domains/transcriptions/transcriptions.md`.

## Why Workers AI

| | Workers AI Whisper (default) | OpenAI (optional) |
|---|---|---|
| Model | `@cf/openai/whisper-large-v3-turbo` | `gpt-4o-mini-transcribe` (unchanged) |
| Cost | Free allowance of 10,000 neurons per day, about 214 audio minutes at 46.63 neurons per minute. On the Free plan, usage beyond that fails until 00:00 UTC and is never billed | $0.003 per minute, billed to the account's own key |
| Setup | None for the user; an `AI` binding on the Worker | User saves an OpenAI key in Settings |
| Data | Audio stays within Cloudflare | Audio goes to OpenAI |

Audio is still never stored (C20): the bytes exist only in memory while the provider request runs.

## Staffing and order

| Role | Model | Owns | When |
|---|---|---|---|
| Backend specialist | Opus 5.5, medium effort | `apps/api`, `packages/core`, `packages/db`, API concept notes, `docs/AUDIO-SETUP.md` | First; creates the branch from `main` |
| Web specialist | Opus 5.5, medium effort | `apps/web`, `packages/client` | After the backend pushes |
| Coordinator | Opus 5.5 | Decision register, architecture and spec lines, combining, the PR | Throughout |

Both load the `coordinated-development` skill as specialists. One shared branch, focused commits as `edwadjei <edd.net49@gmail.com>`, **no AI attribution**, **no GitHub PR** (the coordinator opens one), no force-push. Never use a real Cloudflare account, never deploy, never touch `.env`, `apps/api/.dev.vars` in the main checkout, or real data. Check Workers AI, Wrangler and Hono APIs with Context7 first. Run `format:check`, `typecheck`, `test`, `build`, `docs:check` and report actual results.

## Backend specialist

1. **Provider.** Add `workers_ai` as a transcription provider using the Worker's `AI` binding and `@cf/openai/whisper-large-v3-turbo`. Check the model's input format (it may need base64 audio rather than raw bytes) and supported audio types against the docs; keep the 20 MiB request limit and the Free plan's 10 ms CPU budget in mind (base64 encoding of large audio may be CPU-heavy: measure or reason about it and report).
2. **Settings and defaults.** Providers become `workers_ai` (default) and `openai`. Remove `local_whisper` from code, settings, capabilities and the database. The schema change is a new migration (`0002_…`), never an edit to `0001_initial.sql`; SQLite cannot alter a CHECK constraint, so rebuild the table and map existing `local_whisper` rows to `workers_ai`.
3. **Errors.** When the daily Workers AI allowance is exhausted or the binding is missing, return a clear, specific error the web can show ("Today's free transcription is used up; it resets at midnight UTC, or add an OpenAI key in Settings"). Never fall back to OpenAI silently.
4. **Capabilities.** `/v1/capabilities` reports `recording` and `transcription` true when the `AI` binding is present or an OpenAI key is saved; `transcriptionProviders` reports `workersAi` and `openai`.
5. **Local development.** Workers AI bindings always run on Cloudflare, even under `wrangler dev`, so they need an account. Without one, local transcription reports unavailable unless an OpenAI key is saved. Configure `wrangler.jsonc` so `npm run dev` still starts without a Cloudflare login, and document this clearly.
6. **Tests** with a fake `AI` binding: success, input conversion, allowance-exhausted error, missing binding, provider selection, migration mapping of old rows.
7. **Docs:** `docs/AUDIO-SETUP.md`, the audio-settings and transcriptions concept notes, `apps/api/README.md`.

## Web specialist

1. **Settings:** provider choice shows "Cloudflare (free, built in)" as the default and "OpenAI (your key)" as the option, with the cost and data notes from the table above in plain words. Remove local Whisper wording and setup hints.
2. **Recording:** show the backend's specific errors, including the daily-allowance message; keep "Coming soon" only where transcription is genuinely unavailable.
3. **Screenshots** (desktop and 390px) of Settings and the recorder states under `design/evidence/workers-ai-transcription/`.

## Done criteria

- Workers AI is the default provider; OpenAI works with a saved key; local Whisper is gone from code, data and docs.
- All checks pass, including the new tests and the migration.
- `npm run dev` still starts without a Cloudflare account.
- Real Workers AI transcription is verified in Phase 3 on Edward's account; the PR says so plainly.
