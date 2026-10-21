# Ordo coordinator handoff

**Updated:** 21 October 2026.

**Owner and commit identity:** `edwadjei <edd.net49@gmail.com>`.

**Repository:** `git@github.com:edwadjei/ordo.git`.

**Workspace:** `/Users/edwadjei/projects/ordo`.

**Feature branch:** `edw/ordo-web-foundation`.

## Current work

The first persistent responsive web foundation is implemented and pushed at `8e5b837`, after documentation checkpoint `7c3715a`. Both commits already use Edward's requested author and committer identity, with no AI attribution. The feature branch was renamed to `edw/ordo-web-foundation` locally and remotely; its old remote name was removed. `main` has not changed.

Current follow-up work: adapt API structure and concept documentation to Edward's local DAMSYN API conventions, retain the functioning endpoint contract and Fastify/Drizzle stack, and incorporate the orange reference as a restrained brand accent on white surfaces. Re-run applicable checks and commit/push these changes separately. No merge, deployment, or shared-environment data change is authorized.

Use coordinated-development exclusively: coordinator planning and standalone specialist briefs, specialist implementation, coordinator review, and Edward's per-change merge/deploy approval. Brainstorming is optional design support. Do not resume a Superpowers development sequence or impose a separate plan-approval stage.

## Work areas

| Area | State |
|---|---|
| Coordination/docs | Maintaining branch checkpoints, decisions, setup, and evidence |
| API/domain/database | Persistent authorized baseline complete; DAMSYN-style modularization in progress |
| Responsive web/client | Working local foundation; white palette accepted, orange accent and keyboard focus follow-up |
| Review | Baseline API and client reviewed; reported persistence/session/editor defects fixed and tested |
| Mobile iOS/Android | Not implemented; React Native/Expo direction selected, iOS urgent and prioritized |
| macOS | Not implemented; follows priority mobile delivery |
| AI/worker/MCP | Not implemented; separate feature streams |

Specialists were dispatched within this coordinator task, with separate file ownership. Do not assume a separate user-owned chat exists. The API specialist owns `apps/api`, `packages/core`, and `packages/db`; the web specialist owns `apps/web` and `packages/client`; the coordinator owns root tooling, docs, and integration evidence. Check active work before editing the same paths.

## Verified baseline

Fresh dependency installation, formatting check, all workspace typechecks, 8 API integration tests, 8 client tests, the production build, documentation build/link check, and whitespace check passed for the pushed web foundation.

Browser evidence using a fictional local account: signup, explicit fictional fixture loading, title+Enter task creation, persistence after reload, task edit, subtask creation, parent completion with child still open, note save state, and command-search opening. Continue verifying follow-up code after rebuilding; this is not a claim of phone-device or production verification.

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
3. Complete and verify the active API restructure without changing endpoint semantics or baseline migration history.
4. Verify the orange/white UI and fast keyboard capture in the rebuilt app; save concrete screenshots and update delivery evidence.
5. Commit and push coherent verified checkpoints. Do not merge or deploy without Edward's explicit approval for that change.
6. Prepare the next mobile brief with React Native/Expo, iOS-first design/testing/release, separate Android checks, and secure native authentication/distribution decisions.

## Waiting on Edward

Nothing is needed to continue local implementation and verification. Integration branch policy (`dev` for staging / `main` for production) and hosting remain to be settled before PR integration/deployment. Do not infer those decisions from the instruction to build or push a feature branch.
