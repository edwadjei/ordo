# AI settings concepts

## One choice per account

`GET /v1/settings/ai` returns `{ textProvider, workersAiAvailable, hasOpenaiKey, hasAnthropicKey, configured }`. `textProvider` is `workers_ai` (the default), `openai` or `anthropic`. `PATCH` takes any of `textProvider`, `openaiKey`, `anthropicKey`, `removeOpenaiKey`, `removeAnthropicKey`. A key is accepted only over HTTPS or from localhost, is encrypted with AES-GCM under `ORDO_CREDENTIAL_KEY` (the same storage as the audio key), and is never returned. These keys are separate from the audio settings' OpenAI key.

## Never a silent fallback

Capture uses the chosen provider or nothing: a missing `AI` binding is `AI_UNAVAILABLE`, a missing key `AI_KEY_MISSING`, an unreadable key `CREDENTIAL_STORAGE_UNAVAILABLE`. Each makes the capture run `pending`, never a different provider. `/v1/capabilities` reports `aiCapture: true` for a signed-in account whose chosen provider can run now, and for a signed-out visitor when the server has Workers AI.
