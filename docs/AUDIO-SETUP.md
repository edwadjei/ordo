# Audio setup

## Choose a provider in Ordo

Open **Settings** from the sidebar. Voice setup is optional and does not block tasks or notes.

| Provider | Setup | Where audio is processed |
|---|---|---|
| Local Whisper (default) | Start the local runtime and test the connection | This Mac/server; a phone browser still uses this server |
| OpenAI API | Select OpenAI, enter your own key, Save, then Test connection | OpenAI; provider charges and retention policy apply |
| Native on-device | Coming soon with the native apps | Not implemented in the web app |

Hosted Ordo runs on a Cloudflare Worker, where local Whisper is not available: it uses the account's own OpenAI key, and Settings shows local Whisper as unavailable there. Local Whisper is a development option on a local Mac. Workers AI Whisper is an open option for Edward ([platform spec](specs/02-cloudflare-platform.md#open-questions-for-edward)). **Implementation status:** today only the local build exists.

The installed local runtime and model were exercised using a public speech sample. This does not mean a real phone microphone or its HTTPS connection was tested. Model/language quality depends on the selected model and audio; no general accuracy or latency claim is made.

## Local Whisper

The current Mac has whisper-server, FFmpeg, and an English base model installed. From the repository root:

```bash
npm run dev:whisper
npm run dev
```

The first command starts the managed local engine, or reports that it is already ready. It uses loopback port 4316 and the existing model at the current user's `.cache/whisper/ggml-base.en.bin`. The API checks decoder availability and `/health` readiness before enabling Record. The second command starts the API/web app; run these in separate terminals if starting fresh.

Optional server configuration names: `ORDO_WHISPER_URL` (default `http://127.0.0.1:4316`), `ORDO_WHISPER_BIN`, `ORDO_WHISPER_MODEL`, and `ORDO_FFMPEG_PATH`. The managed launcher accepts only a loopback origin. If installing elsewhere, configure actual executable/model paths privately in `.env`. No automatic package or model download occurs.

FFmpeg decodes input through stdin/stdout with pipe-only protocols; the decoded waveform is sent to local Whisper in memory. The server must never run with `--convert`, because that mode writes temporary audio files. Native server output is suppressed so transcripts do not become terminal/file logs. Model weights and executable files are software assets; Ordo does not store recorded audio.

## Online keys

API keys belong to the signed-in account. Add, replace, or remove them in Settings. Keys are write-only to the client: GET returns a saved-key boolean, never the key. The key field clears after successful save or closing Settings, and is not placed in browser storage. New key entry requires HTTPS or localhost; ordinary LAN HTTP can still select local Whisper or remove a saved key.

Saved keys are encrypted with AES-256-GCM and bound to their owner's identity. The server uses private `ORDO_CREDENTIAL_KEY` (64 hex characters) when provided, otherwise a mode-0600 local master-key file at `.data/secrets/audio-key`. Protect/back up the master key separately with the database; losing it makes saved keys unreadable. Hosted Ordo reads the master key only from the `ORDO_CREDENTIAL_KEY` Worker secret. Never commit or display keys. Global `OPENAI_API_KEY` is not inherited by accounts.

Test connection uses the saved configuration. For local Whisper it checks the decoder and ready engine. For OpenAI it checks key authentication using the fixed models endpoint; this does not prove billing balance, transcription permissions, or audio quality. No real online key was entered or tested during this implementation.

## Record, transcribe, discard

Record shows the selected destination. Stop sends the temporary recording for transcription and discards audio after processing, failure, timeout, or cancellation. Only editable transcript text explicitly saved as a note persists. There is no file picker, recording history, audio playback, or persistent audio retry queue.

The recording captures a provider snapshot. If another tab changes settings before transcription, the API rejects the stale request; it never silently switches local audio to the cloud. The user must check Settings and record again. Account-switch protections also apply. Processing has per-owner/global process limits; these are not distributed quotas.

Microphone capture requires permission and a secure browser context. See [phone verification](PHONE-TESTING.md) for trusted HTTPS and actual-device checks.
