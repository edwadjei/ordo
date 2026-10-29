# AI settings concepts

## One choice per account

`GET /v1/settings/ai` returns `{ textProvider, workersAiAvailable, hasOpenAiKey, hasAnthropicKey, configured }`. `textProvider` is `workers_ai` (the default), `openai` or `anthropic`. `PATCH` takes any of `textProvider`, `apiKey`, `removeApiKey` and `keyProvider` (`openai` or `anthropic`). A key change applies to `keyProvider`, or to the chosen `textProvider` when it is omitted; with Workers AI chosen and no `keyProvider` it is `400`. A key is accepted only over HTTPS or from localhost, is encrypted with AES-GCM under `ORDO_CREDENTIAL_KEY`, and is never returned.

## One OpenAI key per account

The OpenAI key is the one in [audio settings](../audio-settings/audio-settings.md), shared by transcription and AI capture, so Edward never enters it twice: saving or removing it here changes it for transcription too, and the audio provider choice is kept. Only the Anthropic key is stored in `ai_settings`.

## Never a silent fallback

Capture uses the chosen provider or nothing: a missing `AI` binding is `AI_UNAVAILABLE`, a missing key `AI_KEY_MISSING`, an unreadable key `CREDENTIAL_STORAGE_UNAVAILABLE`. Each makes the capture run `pending`, never a different provider. `/v1/capabilities` reports `aiCapture: true` for a signed-in account whose chosen provider can run now, and for a signed-out visitor when the server has Workers AI.
