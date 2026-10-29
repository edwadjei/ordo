# Capture concepts

## AI only when asked

A capture is a note (typed, recording, email or transcript; see `source` in the [notes note](../notes/notes.md)). Nothing reaches an AI until the person chooses **Process with AI**: `POST /v1/notes/:id/process` with `{ workspaceId, projectId? }`. There is no background queue and no automatic processing in this slice. The model call is wall time, not Worker CPU; building the prompt and validating the reply stay small, inside the Free plan's 10 ms CPU budget.

## What the model sees

The request carries one note's title, source and body, today's date and weekday in the person's timezone, and the **chosen workspace's** project names, aliases and the first 500 characters of each description. Nothing else: no other note, task or workspace. The note text is wrapped in a `<capture>` delimiter it cannot close, and the fixed system prompt says that text is data, never instructions. The system prompt carries no person's text.

The model must reply with JSON matching `captureOutputSchema` (`capture.prompt.ts`). Projects are given as `p1`, `p2`, … refs, so the model never copies an id; an unknown ref becomes "no project". Note text, prompts, model output and keys are never logged or stored. Only the validated suggestions are kept.

## Runs

Each process request creates one `capture_runs` row:

| `status` | Meaning |
|---|---|
| `ready` | The reply validated; `suggestions` holds `{ summary, tasks, drafts, destination }` |
| `failed` | The reply did not validate (`INVALID_OUTPUT`), the provider failed (`AI_FAILED`), or it declined (`AI_REFUSED`). No partial data is kept |
| `pending` | AI was unavailable: switched off, out of allowance (`AI_ALLOWANCE_USED`), busy (`AI_BUSY`), no binding (`AI_UNAVAILABLE`) or no key (`AI_KEY_MISSING`). The capture is untouched; **Process later** is another `POST` |
| `saved` | The person saved from it; `saved` lists the created task and draft ids |

A run records the provider, model, token usage and, for Workers AI, the estimated neurons, so the person can see what a run cost against the daily allowance it shares with transcription. A note longer than the model accepts is refused up front with `413 CAPTURE_TOO_LONG` and no run: Workers AI takes 64,000 characters, an account's own OpenAI or Anthropic key the full 100,000. An empty note is `400 CAPTURE_EMPTY`. There is no chunking in this slice.

Suggestions are validated twice: against the model reply schema, then against the shared `captureSuggestions` schema in `@ordo/core`. Each task and draft gets a `key` (`t1`, `d1`, …). A time without its date is dropped. A destination the model is unsure of (`confidence: "low"`) or that names no listed project is returned with `projectId: null`, so the person picks one. A project the person chose when processing always wins.

## Saving

`POST /v1/capture-runs/:id/save` with an `Idempotency-Key` header and `{ workspaceId, projectId?, tasks, drafts }`, holding the person's edited items. An item may carry its own `workspaceId`/`projectId` (reassigned on the review screen); otherwise it takes the save's scope. Every scope is checked like any other write.

The save route alone accepts a JSON body of up to 650,000 bytes (other routes keep 150,000), so the largest save the review screen allows (50 tasks and 10 drafts of 20,000 characters, even at three bytes a character) always fits.

One D1 `batch()` moves the run from `ready` to `saved` under this request's random claim, then inserts the tasks and drafts only if that claim is the one stored. Two saves at once create one set of items. A retry with the same key and body returns the first result (`200`); the same key with a different body is `409 IDEMPOTENCY_CONFLICT`; any other save of a saved run is `409 RUN_ALREADY_SAVED`; a run that is not `ready` is `409 RUN_NOT_READY`.

Saved tasks have `origin: "capture"` and `sourceNoteId` set to the note; only this route sets `capture`. Notes report their newest run's status as `latestCaptureStatus` in note lists, reads and `/v1/home` (the Inbox's "Not processed" marker), one indexed lookup inside the notes query. A suggestion marked as a follow-up with someone to wait on is saved with `status: "waiting"`. Completing or archiving a task never touches its source note.

## Providers

Each model id is one constant in its adapter under `apps/api/src/adapters/text-ai/`. An own key pays per call, so the own-key defaults are each provider's current mid-priced model, not its most capable one. Their reasoning or thinking tokens count against a 16,000-token output cap; only tokens used are billed.

The account's choice lives in the [AI settings](../ai-settings/ai-settings.md) domain. Adapters sit behind the `TextModel` capability (`capabilities/text-model.contract.ts`):

| Provider | Model | Notes |
|---|---|---|
| Workers AI (default) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (`workersAiTextModel`) | JSON mode through the `AI` binding; 24,000-token context; 26,668 neurons per million input tokens and 204,805 per million output tokens |
| OpenAI (own key) | `gpt-6.1-sol` (`openAiTextModel`) | $2 / $10 per million tokens; Chat Completions with strict Structured Outputs, low reasoning effort; uses the account's one OpenAI key, shared with transcription |
| Anthropic (own key) | `claude-sonnet-5-5` (`anthropicTextModel`) | $2 / $10 per million tokens; Messages API over fetch (no SDK), structured outputs (`output_config.format`), adaptive thinking at low effort, `fallbacks: "default"` |

For local development, `ORDO_FAKE_TEXT_AI=on` replaces every provider with a deterministic fake model (see `docs/LOCAL-DEVELOPMENT.md`, "AI capture without real AI").

Estimated Workers AI cost per capture, with about 1,800 tokens of instructions and project names and a 2,000-token reply cap: a 1,000-word capture (about 1,350 tokens) with a typical 600-token reply is about 85 neurons in and 125 out, roughly **210 neurons**. A 10,000-word capture (about 13,500 tokens) with a 1,500-token reply is about 410 in and 310 out, roughly **720 neurons**. The free allowance is 10,000 neurons a day, shared with transcription. These are estimates until a real run is recorded.
