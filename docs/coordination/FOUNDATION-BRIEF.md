# Foundation specialist kickoff — prepared, not dispatched

**State:** Preparation only. Do not start implementation until the slice's scope/design choices are settled with Edward and the coordinator supplies a concrete task brief. This document does not claim that owner approval has occurred.

## Context and role

Load the coordinated-development skill as a specialist. Area: Ordo foundation/API. Owner: Edward Adjei. Repo: `edwadjei/ordo`, local clone `/Users/edwadjei/projects/ordo`. Coordinator: the originating Ordo documentation chat, through in-task agent messaging if dispatched as a child agent, otherwise via Edward with a written report.

Coordinated-development is the sole delivery workflow. Brainstorming may assist design; do not use the Superpowers development approach or require its plan-approval, execution, or per-task reviewer cycles.

Read the repository instructions and `README.md`, then `docs/PRODUCT.md`, `docs/TECHNICAL.md`, `docs/IMPLEMENTATION-APPROACH.md`, `docs/engineering-method.md`, `docs/specs/01-everyday-core.md`, and the current decision register. The local npm setup currently builds documentation only.

## Proposed task

Once Edward's scope/design decisions are recorded and the coordinator issues the concrete task, establish the smallest working web/API/database foundation that can support a persisted, authorized quick-task flow. Resolve runtime/package manager, version-compatible dependencies, web authentication, personal Inbox ownership, and revision semantics before scaffolding dependent code. Delivery order is responsive web first, native iOS urgently next, then macOS. Keep API contracts suitable for native clients; defer Mac packaging decisions so they do not block web/iOS. Native iOS framework/distribution is a separate upcoming specialist decision.

Introduce working contracts and migrations; do not create empty apps for later slices. Use fictional test data only. Define API errors and scope rules before handing the client contract to the web specialist. Defer AI providers, recording, object storage, MCP, and Tauri packaging.

## Acceptance evidence required

- Fresh clone setup runs as documented; CI checks real packages.
- Authenticated task creation persists and can be read after reload.
- Unauthorized owner/workspace/project access is rejected server-side.
- Retry of a create with the same idempotency key does not duplicate a task.
- Hierarchy ownership and cycle constraints have meaningful verification.
- Environment docs list names only; no development bypass is exposed as a production authentication mechanism.
- Relevant guides and delivery evidence are updated in the same change.

## Rules and branch policy

No merge or deploy, no shared-data edits, no external AI processing, no secret output, and no AI attribution in commits or PR descriptions. Use Context7 for library-specific integration. Branch from the agreed integration branch only after Edward settles that policy; currently only `main` is known locally. Do not treat the proposed `dev` policy as provisioned or approved.

## Report back

Return changed behavior, branch/PR and base, checks actually run, screenshots if UI changed, migrations, dependencies, known gaps, and decisions needed. Identify what was not verified. No approval is implied by a coordinator relaying this brief.

Mobile scope now includes Android with iOS priority. The proposed shared stack is React Native + Expo + TypeScript (`apps/mobile`), pending framework adoption. Keep shared contracts/API client logic transport-neutral; do not couple reusable domain packages to web DOM APIs. Android release readiness must not delay iOS.
