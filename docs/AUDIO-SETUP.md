# Audio setup

## Choose a provider in Ordo

Open **Settings** from the sidebar. Voice setup is optional and does not block tasks or notes.

| Provider | Setup | Cost | Where audio is processed |
|---|---|---|---|
| Cloudflare Workers AI Whisper (default) | None for the user; the Worker has an `AI` binding | Free allowance of 10,000 neurons per day, about 214 audio minutes. On the Workers Free plan, use beyond that fails until 00:00 UTC and is never billed | Cloudflare; audio stays within Cloudflare |
| OpenAI (your key) | Select OpenAI, enter your own key, Save, then Test connection | About $0.003 per minute, billed to your own OpenAI account | OpenAI; its charges and retention policy apply |
| Native on-device | Coming soon with the native apps | | Not implemented in the web app |

The Workers AI model is `@cf/openai/whisper-large-v3-turbo`; the OpenAI model is `gpt-4o-mini-transcribe`. Ordo never stores audio with either provider: the recording exists only in memory while the provider request runs. Local Whisper is not part of Ordo, because a Worker cannot run it; accounts that had it selected now use Workers AI (migration `0002_workers_ai_transcription.sql`).

**Implementation status:** Workers AI is built and tested with a fake `AI` binding only. Real Workers AI transcription is verified in Phase 3 on Edward's Cloudflare account; until then no real Cloudflare call has been made.

## Workers AI

The Worker calls the model through its `AI` binding (`"ai": { "binding": "AI" }` in `apps/api/wrangler.jsonc`). The recording is passed as a stream with its content type, so the Worker does not base64-encode it; encoding in JavaScript would cost about 4 ms of CPU per MiB against the Free plan's 10 ms per request. Accepted recordings are `audio/webm`, `audio/mp4`, `audio/ogg` and `audio/wav`, up to 20 MiB.

Ordo never switches provider on its own. If Workers AI cannot transcribe, the request fails with a specific message and nothing is sent to OpenAI:

| Situation | Response | Message |
|---|---|---|
| Daily free allowance used up (Workers AI error 3036) | `429 TRANSCRIPTION_ALLOWANCE_USED` | Today's free transcription is used up; it resets at midnight UTC, or add an OpenAI key in Settings. |
| No `AI` binding, or it cannot reach Cloudflare | `503 WORKERS_AI_UNAVAILABLE` | Cloudflare transcription isn't available on this server. Add an OpenAI key in Settings to transcribe here. |
| Workers AI out of capacity (3040) | `429 TRANSCRIPTION_BUSY` | Cloudflare transcription is busy. Please retry shortly. |
| Request too large for Workers AI (3006) | `413 PAYLOAD_TOO_LARGE` | This recording is too large to transcribe. Record a shorter clip. |
| Anything else | `502 TRANSCRIPTION_FAILED` | Transcription failed. Please record again and retry. |

Test connection for Workers AI checks only that the binding is available; it does not run a test transcription, because that would spend the daily allowance.

## Local development

The `AI` binding has no local simulator: it always runs on Cloudflare and needs a Cloudflare account, even under `wrangler dev`. So `npm run dev` runs `wrangler dev --local` (remote bindings disabled) and starts without a Cloudflare login. In development (`ORDO_ENV=development`) Ordo leaves Workers AI off (`ORDO_WORKERS_AI`, empty by default in `apps/api/.dev.vars`), Settings shows Cloudflare transcription as unavailable, and Record is shown only once the signed-in account has saved its own OpenAI key (which also needs `ORDO_CREDENTIAL_KEY`).

Someone logged in to Cloudflare can try Workers AI locally by running `wrangler dev` without `--local` from `apps/api` with `ORDO_WORKERS_AI=on`; that uses that account's daily allowance.

## Online keys

API keys belong to the signed-in account. Add, replace, or remove them in Settings. Keys are write-only to the client: GET returns a saved-key boolean, never the key. The key field clears after successful save or closing Settings, and is not placed in browser storage. New key entry requires HTTPS or localhost; ordinary LAN HTTP can still select Workers AI or remove a saved key.

Saved keys are encrypted with AES-256-GCM through Web Crypto and bound to their owner's identity. The master key is the 64-hex-character `ORDO_CREDENTIAL_KEY`: locally in `apps/api/.dev.vars`, hosted as a Worker secret. Protect and back it up separately from the database; losing it makes saved keys unreadable. Never commit or display keys. Global `OPENAI_API_KEY` is not inherited by accounts.

Test connection for OpenAI checks key authentication using the fixed models endpoint; this does not prove billing balance, transcription permissions, or audio quality. No real online key was entered or tested during this implementation.

## Record, transcribe, discard

Record shows the selected destination. Stop sends the temporary recording for transcription and discards audio after processing, failure, timeout, or cancellation. Only editable transcript text explicitly saved as a note persists. There is no file picker, recording history, audio playback, or persistent audio retry queue.

The recording captures a provider snapshot (`X-Ordo-Audio-Provider`: `workers_ai` or `openai`). If another tab changes settings before transcription, the API rejects the stale request with `409 AUDIO_SETTINGS_CHANGED`; it never silently sends a recording to a different provider. The user must check Settings and record again. Account-switch protections also apply. Processing has per-owner and per-isolate limits; these are not distributed quotas.

Microphone capture requires permission and a secure browser context. See [phone verification](PHONE-TESTING.md) for trusted HTTPS and actual-device checks.
