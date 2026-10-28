# Transcriptions

`POST /v1/transcriptions` accepts temporary raw audio in memory and returns `{transcript}`. No audio, metadata, recording history, file attachment or transcript is stored by this endpoint. The user may explicitly save the reviewed text through the notes API. The old capture upload/list/download endpoints do not exist.

Authentication, trusted mutation origin, and expected-account checks apply. Supported media headers are `audio/webm`, `audio/mp4`, `audio/ogg`, and `audio/wav`, with a 20 MiB encoded-input limit and basic container-signature validation. Invalid/empty/oversized input is rejected. Request buffers are cleared on success, failure, validation rejection, missing provider, cancellation and timeout. Browser/provider runtime copies are released normally; this does not promise forensic memory erasure by the operating system.

One provider call per account and two calls globally may run concurrently in an isolate. The server deadline is 65 seconds and adapter deadlines are 60 seconds. Client disconnection aborts provider work and releases request memory: the controller passes the framework-neutral `request.signal`, which the Workers runtime aborts when the client goes away. The route declares its raw audio content types and 20 MiB limit to the HTTP layer; JSON elsewhere is limited to 150,000 bytes. Exceptions never expose provider payloads. These bounds are per isolate, not distributed quotas.

Provider choice comes from the authenticated owner's [audio settings](../audio-settings/audio-settings.md) and the `X-Ordo-Audio-Provider` snapshot (`workers_ai` or `openai`). There is no fallback between providers. Tests can inject an explicit transcriber or `null` to disable processing deterministically. Global `OPENAI_API_KEY` is not a fallback for user accounts.

## Workers AI Whisper (default)

`WorkersAiTranscriber` calls `@cf/openai/whisper-large-v3-turbo` through the Worker's `AI` binding with `task: "transcribe"` and a 60-second abort signal. The model accepts either a base64 string or `{ body, contentType }`; Ordo passes the request buffer as a one-chunk stream with the recording's content type. Base64 encoding in JavaScript was measured at about 4 ms of CPU per MiB (86 ms for 20 MiB, in Node 22 on the development Mac), which would exceed the Free plan's 10 ms CPU budget for anything over about 2 MiB; streaming leaves only copying and the provider round trip, and the inference itself runs on Cloudflare's GPUs rather than in the Worker. The transcript is read from `text`, or from `transcription_info.text` as in the model page's example, and trimmed.

Workers AI errors carry an internal code in the message ([Workers AI errors](https://developers.cloudflare.com/workers-ai/platform/errors/)). They become specific API failures, with the provider's own message never passed on:

| Workers AI | Response |
|---|---|
| 3036, daily free allocation used | `429 TRANSCRIPTION_ALLOWANCE_USED`: "Today's free transcription is used up; it resets at midnight UTC, or add an OpenAI key in Settings." |
| 3040, capacity temporarily exceeded | `429 TRANSCRIPTION_BUSY`: "Cloudflare transcription is busy. Please retry shortly." |
| 3006, request too large | `413 PAYLOAD_TOO_LARGE`: "This recording is too large to transcribe. Record a shorter clip." |
| "Binding AI needs to be run remotely" (`wrangler dev --local`) | `503 WORKERS_AI_UNAVAILABLE`: "Cloudflare transcription isn't available on this server. Add an OpenAI key in Settings to transcribe here." |
| anything else | `502 TRANSCRIPTION_FAILED`: "Transcription failed. Please record again and retry." |

Without a usable binding the service returns `503 WORKERS_AI_UNAVAILABLE` before any call. On the Workers Free plan the allowance is 10,000 neurons per day (about 214 audio minutes at 46.63 neurons per minute) and resets at 00:00 UTC; usage beyond it fails and is never billed. Tests use a fake binding and fictional audio; real Workers AI transcription is verified in Phase 3.

## Optional OpenAI provider

A user's encrypted key enables a fixed HTTPS OpenAI multipart audio request with model `gpt-4o-mini-transcribe` and JSON text output. Audio leaves Cloudflare only when the user selects this provider and explicitly transcribes. External provider data handling is separate from Ordo's no-storage policy. Provider failures and responses are not logged. Tests use fictional audio and mocked transports; real OpenAI transcription has not been verified.

Sources: [Workers AI Whisper large v3 turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [OpenAI transcription API](https://developers.openai.com/api/docs/api-reference/audio/createTranscription).

## On Cloudflare

Hosted Ordo transcribes with Workers AI by default, or with the account's own OpenAI key when selected; audio is held in memory only for the request and never stored. Concurrency limits are per isolate, not global. Under `npm run dev` (`wrangler dev --local`) Workers AI is off and reports unavailable, so local transcription needs a saved OpenAI key; see the [audio setup guide](../../../../../docs/AUDIO-SETUP.md#local-development).
