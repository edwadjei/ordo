> Latest: Settings now selects Local Whisper (running on this Mac/server) or an account-owned OpenAI key, with connection test and estimated pricing. OTP email has Ordo HTML branding and text fallback. Owner confirmed both original delivery tests arrived. Audio remains memory-only. Details/evidence below.

> Current audio policy (C20): no stored audio or uploaded files. Record → transcribe in temporary memory → discard audio. Earlier storage evidence below is historical and superseded.

# Ordo coordinator handoff

**Updated:** 21 October 2026.

**Owner and commit identity:** `edwadjei <edd.net49@gmail.com>`.

**Repository:** `git@github.com:edwadjei/ordo.git`.

**Workspace:** `/Users/edwadjei/projects/ordo`.

**Feature branch:** `edw/ordo-web-foundation`.

## Current work

The first persistent responsive web foundation is implemented and pushed at `8e5b837`, after documentation checkpoint `7c3715a`. Both commits already use Edward's requested author and committer identity, with no AI attribution. The feature branch was renamed to `edw/ordo-web-foundation` locally and remotely; its old remote name was removed. `main` has not changed.

DAMSYN-style API structure and concept documentation are implemented and independently reviewed, retaining all 26 endpoint contracts and the Fastify/Drizzle stack. The orange reference is implemented as a restrained accent on white surfaces. Formatting, all workspace typechecks, 20 tests, documentation checks, the production web build, and post-restart signed-in persistence/write checks pass. Keep the verification record and pushed branch checkpoints current; use the Git log and tracking status for the exact API refactor revision. No merge, deployment, or shared-environment data change is authorized.

Use coordinated-development exclusively: coordinator planning and standalone specialist briefs, specialist implementation, coordinator review, and Edward's per-change merge/deploy approval. Brainstorming is optional design support. Do not resume a Superpowers development sequence or impose a separate plan-approval stage.

## Work areas

| Area | State |
|---|---|
| Coordination/docs | Maintaining branch checkpoints, decisions, setup, and evidence |
| API/domain/database | Persistent authorized baseline and DAMSYN-style modularization verified locally |
| Responsive web/client | Working local foundation; white surfaces, restrained orange accents, and keyboard capture verified |
| Review | Baseline API and client reviewed; reported persistence/session/editor defects fixed and tested |
| Mobile iOS/Android | Not implemented; React Native/Expo direction selected, iOS urgent and prioritized |
| macOS | Not implemented; follows priority mobile delivery |
| AI/worker/MCP | Not implemented; separate feature streams |

Specialists were dispatched within this coordinator task, with separate file ownership. Do not assume a separate user-owned chat exists. The API specialist owns `apps/api`, `packages/core`, and `packages/db`; the web specialist owns `apps/web` and `packages/client`; the coordinator owns root tooling, docs, and integration evidence. Check active work before editing the same paths.

## Verified baseline

Fresh dependency installation, formatting check, all workspace typechecks, 12 API tests (8 behavior, 4 architecture), 8 client tests, the production build, documentation build/link check, and whitespace check passed for the pushed web foundation.

Browser evidence using a fictional local account: signup, explicit fictional fixture loading, title+Enter task creation, persistence after reload, task edit, subtask creation, parent completion with child still open, note save state, command search/input focus, sign-out/sign-in, and navigation/filtering across 21 projects. After the refactored server restart, the existing session/data loaded and a new task write succeeded. Continue verifying follow-up code after rebuilding; this is not a claim of phone-device or production verification.

Review fixed omitted PATCH defaults clearing fields, logout being caught by sign-in throttling, fresh database directories, account-switch mutation preconditions, stale logout responses, and edits during saves. Detailed runtime limits live in the API/web workspace guides and local development guide.

## Environments

| Environment | State | Release / rollback |
|---|---|---|
| Local | Web `http://127.0.0.1:3318`; API `http://127.0.0.1:4318`; embedded PostgreSQL `.data/ordo` | Local build only |
| Staging | Not provisioned | None |
| Production | Not provisioned | None |

The local database contains fictional browser-verification content. No provider credentials, object store, DNS, hosted database, or CI secrets were provisioned. Schema migrations have run locally only. Keep `.data` and private `.env` values out of Git. The CI workflow is committed; hosted CI has not run through a PR yet.

The documentation site is generated into `docs/html`, and a preview may be running on port 4317. The prototype is `design/home-preview.html` on port 4319 when its preview process is active. The working app is port 3318; do not confuse the static prototype with persisted application behavior.

## Resume here

1. Inspect Git status/log and current live processes; preserve uncommitted work. Use `edw/` for new branches and Edward's requested Git identity.
2. Read the active build plan, decision register, and relevant specialist briefs.
3. Confirm the API restructure checkpoint is pushed; preserve endpoint semantics and baseline migration history.
4. Use the verification record for the tested orange/white UI and keyboard capture; retain concrete screenshots and update delivery evidence as behavior changes.
5. Commit and push coherent verified checkpoints. Do not merge or deploy without Edward's explicit approval for that change.
6. Prepare the next mobile brief with React Native/Expo, iOS-first design/testing/release, separate Android checks, and secure native authentication/distribution decisions.

## Waiting on Edward

Nothing is needed to continue local implementation and verification. Integration branch policy (`dev` for staging / `main` for production) and hosting remain to be settled before PR integration/deployment. Do not infer those decisions from the instruction to build or push a feature branch.

## Latest web appearance change

Edward requested dark mode immediately. Web now has Light / Dark / System selection, browser-local persistence, and themed forms, dialogs, navigation, and content. Browser verification and screenshots are recorded in VERIFICATION.md. Native mobile remains pending.

## Pending versus blocked clarification — 21 October 2026

The checklist marked unimplemented work, not proven blockers. Edward requested Gatekeeper Pro reuse; its key and URL were copied from Unwrap into ignored local `.env` with owner-only file permissions. No other Unwrap environment settings were copied; no delivery request or provider configuration change was made. Existing Unwrap adapters provide the integration reference, including Ghana-only SMS. Passwordless email/phone OTP and optional PIN were proposed by Edward; details and implementation remain pending.

Server full-text search has no identified external blocker; owner-scoped SQL search, indexes, endpoint, UI hookup, and regressions remain to implement. Recording needs capture/storage/retry implementation; phone microphone testing additionally needs trusted HTTPS because plain LAN HTTP is not a secure context. Transcription needs the audio capture path plus a selected/configured transcription provider or local engine and processing/retry flow. Physical-device testing means real iPhone Safari/Android Chrome and later native-device checks; responsive desktop screenshots are not physical-device evidence.

## Current delivery: passwordless, search, recordings

Active branch: `edw/ordo-passwordless-capture`; PR base: `edw/ordo-web-foundation`. This permits review of the requested follow-up independently without changing main or creating an integration environment. Earlier notes requiring a settled dev/main policy still apply to eventual release integration/deployment.

Implemented email/Ghana-phone OTP with verified contact timestamps, account-preserving first-email conversion and revoked legacy credentials/sessions, full-text search indexes, private audio persistence/playback, configurable transcription, and concise Coming soon states. 39 tests pass plus typechecks/build/format/docs checks; browser search and synthetic audio persistence verified. No live OTP/transcription request or physical phone test. HTTPS proxy and phone checklist prepared; no certificate/device trust installed. Verification details and screenshots are in VERIFICATION.md.

Edward asked whether onboarding should collect both phone/email or email alone with later linking. Recommendation given: email-first onboarding and optional verified phone linking to the same account later. Current implementation accepts either contact separately; linking is not implemented and is not automatic.

Waiting on Edward: review the PR. Live delivery needs an intended test recipient, transcription needs a provider key, and actual phone microphone testing needs trusted HTTPS and a real device. These do not imply approval to merge or deploy.

PR: [#1 — Add passwordless sign-in, server search and audio capture](https://github.com/edwadjei/ordo/pull/1), `edw/ordo-passwordless-capture` → `edw/ordo-web-foundation`. Mergeable when opened; screenshots embedded in the description and their remote asset URL verified accessible. GitHub validation started; local checks passed. No merge/deployment approval given.

## Audio policy correction (C20)

Edward rejected audio/file retention. The saved-audio implementation described in the earlier section is superseded: storage adapters, capture APIs, file selection/history/playback are removed. New flow is microphone → temporary in-memory transcription request → discard audio → editable transcript → explicit save as note. Without provider configuration, Record shows Coming soon and cannot start the microphone. No audio metadata, files, offline drafts, retries, or playback are retained.

The sole locally stored recording was the exact generated test tone from the previous browser check. It was matched against the synthetic fixture, removed with its metadata, and the fixture/empty legacy audio directory were removed too. No other recordings existed. Supplied PRODUCT/TECHNICAL briefs remain verbatim; C20 overrides their audio-storage direction. Provider-side retention remains a separate provider policy; Ordo itself writes no audio to disk or its database.

Correction checks: 41 tests pass (27 API + 14 client), typechecks/build/format/docs pass. Compiled app and running API updated; desktop/responsive screenshots refreshed. PR #1 is updated on the same branch; no merge/deploy. Record remains Coming soon locally because no transcription key is configured. Only explicit transcript notes may persist; no audio/files are saved.

Latest UI change: sun/moon appearance icon replaces dropdown (C21). Toggle and reload persistence browser-verified; production web build passes. Updated desktop/responsive screenshots are included in PR #1.

## Audio settings and email branding (C22/C23)

Implemented per-account provider preferences, default local Whisper, encrypted own OpenAI keys, connection testing, optional onboarding entry, and provider-consent snapshots. Native on-device processing remains Coming soon. Local runtime4316 is running with existing base.en model and FFmpeg; `npm run dev:whisper` is the managed starter. Root API/web restarted with migration0004 after local backup.

52 tests pass plus typechecks/build/format/docs. Real local inference and full API smoke passed using the already-installed public speech fixture, with no audio files/transcript logs or automatically saved notes. Browser settings save/test/online selection checked. Email/SMS delivery was owner-confirmed; branded email preview uses dummy code only. Cloud key/transcription and actual phone/microphone remain unverified.

New guide: [Audio setup](../AUDIO-SETUP.md). Existing PR #1 is updated with these changes and fresh settings/email screenshots. Nothing merged or deployed. Waiting on owner: review PR, optional live branded-email test, actual microphone/phone verification.

Latest UI correction: full capture cards and voice onboarding are My Day-only; other views retain contextual Add a task/New note controls. Browser checks and production web build passed.
