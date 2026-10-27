# Audio settings

Audio settings belong to one account. `GET /v1/settings/audio` returns only `provider`, `localAvailable`, `hasApiKey`, and `configured`. A missing row defaults to `local_whisper`. Readiness checks the Mac/server's loopback Whisper health endpoint and ffmpeg executable; this is server-local processing, not offline/on-device processing on a phone.

`PATCH /v1/settings/audio` selects `local_whisper` or `openai`, optionally replaces `apiKey`, or explicitly removes it with `removeApiKey`. Secrets never appear in responses. New key submissions require HTTPS or exact localhost/loopback origin; changing a provider or removing a stored key remains possible over trusted LAN HTTP. Mutation origin and expected-account guards still apply. No global OpenAI environment credential is used as a fallback for another account.

Keys are encrypted with AES-256-GCM, a fresh 96-bit nonce, and the owner ID as authenticated context. Only ciphertext is stored in the database. The server master key is either the 64-hex-character `ORDO_CREDENTIAL_KEY` or a lazily generated 32-byte owner-only file at `.data/secrets/audio-key`; protect and back up this key separately from the database. Losing it requires users to add their provider keys again. Deployments must explicitly persist/protect this file or supply the environment key; no secrets belong in Git, client code, screenshots, request logs or exception messages.

`POST /v1/settings/audio/test` tests the saved selection. Local tests readiness only; OpenAI tests the key with a fixed HTTPS `GET /v1/models` request, without audio or inference billing. This verifies credential acceptance, not transcription-model availability or sufficient balance. Concurrent tests for one owner are limited. Provider errors are sanitized.

The owning service resolves the account's chosen transcriber for each transcription. The web client snapshots `X-Ordo-Audio-Provider` when recording starts; a missing snapshot or mismatch with saved settings returns `409 AUDIO_SETTINGS_CHANGED` before creating a cloud adapter, preventing an unnoticed provider change in another tab from sending a local recording externally. Another account cannot use that key, including by copying the ciphertext because the encryption authenticates owner identity. Settings changes never create recordings, files, or transcripts. Transcript text is returned temporarily; only an explicit user save creates a note.

## On Cloudflare

The master key is only the `ORDO_CREDENTIAL_KEY` Worker secret; there is no key file. Encryption uses AES-256-GCM through Web Crypto with the same nonce and owner-binding rules, so ciphertext stays compatible. Hosted Ordo uses the account's own OpenAI key; local Whisper is a local-Mac development option and reports unavailable on the Worker. Workers AI Whisper is an open option for Edward.

**Implementation status:** today encryption uses Node `crypto` and the local key-file fallback described above. Web Crypto is Phase 1; the Worker secret is set in Phase 3.
