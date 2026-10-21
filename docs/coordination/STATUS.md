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
