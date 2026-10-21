# Slice 01 — Ordo everyday core

**Status:** Implementation started under Edward’s “Yes build”; acceptance evidence and outstanding work are tracked in the delivery ledger.  
**Goal:** Capture and complete work across personal portfolios without requiring AI.  
**References:** [Product](../PRODUCT.md), [technical architecture](../TECHNICAL.md), [approach](../IMPLEMENTATION-APPROACH.md).

## User outcome

Open Ordo, create a task in one or two interactions, and find it again in the correct context after a reload. Navigate a workspace with more than twenty projects, keep notes and nested tasks, and see what is due or waiting. Save failures and offline work must remain visible and recoverable.

This is the responsive web core slice, including phone-browser use. Edward’s current platform order is responsive web → native iOS (urgent) → macOS, superseding the original PWA-first mobile plan. Native iOS follows this core with its own framework/distribution decision and specialist brief. Recording, imports, AI review, drafts, MCP, and Mac packaging are separate work; finishing AI/MCP does not block starting iOS.

## Scope

### Included

- Authenticated personal account and owned workspace/project records.
- Responsive My Day, Inbox, Upcoming, Waiting On, workspace navigation, project task/note views, and a task detail pane.
- Fast task creation, title/details editing, optional project/priority/dates, explicit completion, archive, and nested subtasks with at least two visible levels.
- Task statuses: To Do, In Progress, Waiting, Done. Overdue is calculated.
- Notes with reliable autosave; basic text first, with editor scope settled in the implementation plan.
- Authorized search and `⌘K` command navigation, keyboard focus, light/dark treatment, and useful empty states.
- Durable local text capture and retry-safe synchronization, with explicit save/error/conflict states.
- Clearly labeled fictional fixtures: MTN with at least 21 projects, DAMSYN, Dorsh, and Personal. No imports of real project data from the reference repositories.
- Database migrations, meaningful domain/API tests, CI, and accurate local setup documentation.

### Deferred to subsequent slices

Recording/transcription, transcript imports, provider key settings and processing, AI suggestions/commit, email/message drafts, full conversations, attachment storage, MCP clients, Tauri packaging, global shortcuts, and full offline multi-device editing. PWA installability is outside the current delivery sequence; responsive web is not a substitute for the urgent native iOS app.

## Experience

Desktop has a left sidebar for My Day, Inbox, Upcoming, Waiting On, and collapsible workspaces. Active workspace projects support search and favorites. The top bar carries `⌘K`, Quick Capture, scope, and settings. The main area shows compact daily context and task lists; opening a task preserves the list through a side pane.

Keep all five product capture entry points visible in the Home design: Add Task, Record, Quick Note, Upload Transcript, and AI Capture. Add Task and Quick Note work in this slice. Until their slices ship, the remaining controls clearly say they are planned and do not simulate recording, upload success, or AI processing. The full MVP cannot pass its launch bar with these capabilities unavailable.

On mobile, use a simple Home with obvious task/note capture and a workspace switcher. Show task details as a usable narrow-screen view. Avoid squeezing the desktop columns onto a phone.

Task creation starts with title only. Optional fields are progressive. Active workspace/project supplies the initial destination; unscoped entry uses the personal Inbox under the ownership model selected before schema implementation. Enter saves, Escape closes safely, and required scope errors never silently move content elsewhere.

## Proposed behavior requiring confirmation

| Topic | Proposed behavior | Why |
|---|---|---|
| My Day | Due today, overdue open tasks, and follow-ups due by today; separate preview of upcoming and waiting work | Uses existing dates without inventing a new daily scheduling model |
| Upcoming | Next seven local calendar days, with clear date groupings | Matches product outlook |
| Waiting On | Tasks explicitly in Waiting; follow-up date controls surfacing, not automatic status changes | Keeps user intent stable |
| Parent completion | Completes only that task; open children remain visible | Avoids silently completing commitments |
| Search | Owned/authorized entities only; active scope may narrow results | Aggregation does not weaken authorization |
| Destination changes | Explicit user action with containment validation; no automatic child/source relocation | Avoids ambiguous cross-workspace moves |

These choices are proposals, not changes already accepted by the owner. Inbox storage, date-only representation, and revisions must be resolved in the foundation plan.

## Domain and authorization requirements

All reads and writes resolve the authenticated owner and authorized destination server-side. API queries, search, home aggregates, and future workers/MCP must share the same rules. Reject foreign project IDs, cross-workspace parent links, self-parenting, descendant cycles, and inconsistent reparenting. Decide delete/archive effects on child tasks and provenance before implementation.

The technical brief's `/v1/workspaces`, project routes, `/v1/tasks`, `/v1/notes`, `/v1/home`, `/v1/search`, and sync contract form the starting surface. A detailed route schema is a foundation deliverable, not an invented API guarantee in this draft. Normal creation never calls an LLM.

## Persistence and failure behavior

- Saving appears immediately; Saved requires actual durable persistence at the stated layer. A queued local write says Offline or Needs sync rather than implying server success.
- A failed create/edit remains recoverable and can be retried without duplicate records. Reloading must not discard queued text.
- Local records are bound to an account and protected against another account seeing or syncing them.
- Concurrent body edits surface a conflict rather than silently overwriting content. Sync includes archive/deletion tombstones.
- Dates render in the user's timezone, defaulting to Africa/Accra; storage representation for date-only values is a recorded decision.
- Sign-out behavior for unsynced data must be explicit before shipping offline capture.

## Acceptance scenarios

1. With no AI key configured, create a task from Home with title + Enter, reload, find it, edit it, and complete it.
2. Open fictional MTN and navigate/filter at least 21 projects; create a task and note in the selected project and verify their stored destination.
3. Create two visible subtask levels. Reject self-parenting, a descendant cycle, a foreign workspace/project parent, and unauthorized reparenting.
4. Set Waiting and a follow-up date. Verify Waiting On and upcoming/date surfacing without automatic status changes.
5. Confirm My Day/Upcoming results around local midnight and overdue boundaries, using the approved semantics.
6. Autosave a note and reload it. Force a save failure and verify the editor preserves text, shows failure, and offers a working retry.
7. Add a task offline, reload while offline, reconnect, and verify exactly one server record. Surface a concurrent body conflict without losing either edit.
8. Use `⌘K` and keyboard navigation to find an authorized task and open its detail pane; no inaccessible content appears in search or counts.
9. Attempt access through a second fictional owner and foreign workspace IDs. Reject reads/writes and exclude private data from aggregates.
10. Verify task/note capture and workspace switching at a narrow mobile width, light/dark modes, visible focus, reduced motion, and screen-reader labels.
11. Confirm planned AI/record/import controls disclose their availability and no real provider calls occur.
12. Record Mac-class input/navigation timing against the briefs' p95 targets; report measurement results and any shortfall rather than claiming compliance from visual inspection.

## Review handoff

Review this slice alongside the decision register. Resolve scope/design choices with Edward, record the UI preview decision, and have the coordinator prepare standalone specialist briefs. Use coordinated-development for implementation and PR review; no Superpowers development sequence or separate plan-approval gate applies. Implementation cannot assume unchosen auth, Inbox ownership, queue, or deployment arrangements.
