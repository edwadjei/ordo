# Transcriptions

`POST /v1/transcriptions` accepts bounded raw audio (`audio/webm`, `audio/mp4`, `audio/ogg`, `audio/wav`, max 20 MiB) and returns `{transcript}`. Session, trusted-Origin, displayed-account checks, basic container validation, per-owner and global concurrency limits apply. Without a configured provider it returns `503 FEATURE_UNAVAILABLE`.

Ordo does not store audio, uploaded files, recording metadata, or transcripts from this endpoint. There is no capture-storage adapter, file picker, recording history, playback, upload-to-save endpoint, audio download endpoint, or persistent retry queue. Input bytes exist in request memory, are cleared after processing, and are released on success, failure, cancellation, or timeout. Only text explicitly saved through Notes persists. Browser microphone chunks are transient and discarded after the request; failed transcription requires recording again.

The OpenAI adapter sends multipart audio held in memory to a fixed transcription endpoint when `OPENAI_API_KEY` is configured. Provider-side retention is governed by the provider separately; Ordo does not claim to control it. Provider bodies and raw audio are never logged or returned in failures. Tests use fictional audio and mock transports; no live provider or microphone was exercised.

One request per owner and two global calls are accepted per API process. Cancellation/client disconnect aborts provider work; a 65-second deadline bounds processing and releases guards/input. These controls are process-local, not a distributed quota. Old `/v1/captures` routes are removed. C20 supersedes earlier persistent-audio plans.
