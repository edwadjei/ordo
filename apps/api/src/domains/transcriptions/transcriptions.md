# Transcriptions

`POST /v1/transcriptions` accepts temporary raw audio in memory and returns `{transcript}`. No audio, metadata, recording history, file attachment or transcript is stored by this endpoint. The user may explicitly save the reviewed text through the notes API. The old capture upload/list/download endpoints do not exist.

Authentication, trusted mutation origin, and expected-account checks apply. Supported media headers are `audio/webm`, `audio/mp4`, `audio/ogg`, and `audio/wav`, with a 20 MiB encoded-input limit and basic container-signature validation. Invalid/empty/oversized input is rejected. Request buffers are cleared on success, failure, validation rejection, missing provider, cancellation and timeout. Browser/provider runtime copies are released normally; this does not promise forensic memory erasure by the operating system.

One provider call per account and two calls globally may run concurrently in a process. The server deadline is 65 seconds and adapter deadlines are 60 seconds. Client disconnection aborts decoding/provider work and releases request memory. Exceptions never expose provider payloads. These bounds are process-local, not distributed quotas.

Provider choice comes from the authenticated owner's [audio settings](../audio-settings/audio-settings.md). Tests can inject an explicit transcriber or `null` to disable processing deterministically. Global `OPENAI_API_KEY` is not a fallback for user accounts.

## Local Whisper on the Mac/server

The local adapter decodes supported browser audio using ffmpeg's `pipe:0` input and `pipe:1` output as 16 kHz mono PCM WAV, with a bounded 16 MiB decoded output. No audio filename is passed to ffmpeg and its stderr is discarded. WAV bytes are sent as an in-memory multipart request to a loopback-only whisper.cpp server. The adapter clears its decoded buffer afterwards. The default model is the operator's installed English `base.en` model; other languages require a suitable model/runtime configuration.

whisper.cpp 1.9.2 server source was checked: with its default converter disabled, multipart content is decoded directly in memory; enabling `--convert` writes temporary audio and is forbidden for this workflow. Do not enable debug or realtime transcript printing. The runtime command used locally is:

```sh
/opt/homebrew/bin/whisper-server --host 127.0.0.1 --port 4316 --model /Users/edwadjei/.cache/whisper/ggml-base.en.bin --no-timestamps
```

A health response of `{"status":"ok"}` confirms the model is ready; a listening port alone does not. The server URL defaults to `http://127.0.0.1:4316`; trusted server configuration may set `ORDO_WHISPER_URL` to another loopback HTTP origin. `ORDO_FFMPEG_PATH` selects the server executable, default `/opt/homebrew/bin/ffmpeg`. These are operator settings, never user-controlled remote URLs. Model weights and the encryption master key may exist on disk; recorded audio may not.

## Optional OpenAI provider

A user's encrypted key enables a fixed HTTPS OpenAI multipart audio request with model `gpt-4o-mini-transcribe` and JSON text output. Audio leaves this server only when the user selects this cloud provider and explicitly transcribes. External provider data handling is separate from Ordo's no-storage policy. Provider failures and responses are not logged. Tests use fictional audio and mocked transports; real cloud transcription has not been verified.

Sources: [whisper.cpp 1.9.2 server](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/examples/server/server.cpp), [OpenAI transcription API](https://developers.openai.com/api/docs/api-reference/audio/createTranscription).

## On Cloudflare

Hosted Ordo transcribes with the account's own OpenAI key; audio is held in memory only for the request and never stored. Local Whisper and FFmpeg exist only on a developer's Mac and report unavailable on the Worker. Concurrency limits there are per isolate, not global. Workers AI Whisper is an open option for Edward.
