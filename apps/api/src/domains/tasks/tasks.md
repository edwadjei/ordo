# Task concepts

## Task ownership and destinations

`tasks.service.ts` owns task creation, editing, hierarchy, completion, archive, and retry idempotency. Every query in its repository includes the authenticated owner. WorkspacesService alone validates workspace/project destinations. A parent and child must share both workspace and project, including null values for a personal Inbox hierarchy.

## Atomic hierarchy rules

Creation, edits, and archive run inside an owner transaction with the user's row locked. The service traverses the proposed ancestry inside that transaction, rejects self/descendant cycles, and limits traversal to 500 visited IDs. A foreign or archived parent is unavailable, and a parent in a different destination cannot be attached.

Changing a parent's destination while it has active children is rejected; the user must explicitly move/archive children first. Archive is soft deletion, is allowed for a leaf, and cannot hide active children behind an archived parent. Completing a parent changes only that task; children remain open unless explicitly completed.

The repository performs scoped reads/inserts/updates; it does not decide lifecycle transitions. The controller has no SQL or transaction code.

## Retry identity versus record revision

`create()` fingerprints the normalized create payload through the Tasks-owned `ContentHasher` port. The owner-scoped idempotency key, fingerprint, and task insertion commit atomically. Same key/same payload returns the original task; same key/different payload is a conflict. An archived original does not reappear when its create is retried.

Revision is a different concern: PATCH/DELETE require the current revision and reject stale edits before writing. The service increments revision and timestamps. PATCH schemas intentionally have no creation defaults, so completing or renaming a task preserves unrelated scope, dates, parent, and description.

## Dates and completion

Due and follow-up dates are date-only strings, not arbitrary midnight timestamps. Status is explicit (`todo`, `in_progress`, `waiting`, `done`); overdue is a view calculation. Entering Done sets completion time, repeating a Done edit preserves it, and reopening clears it. Waiting and a follow-up date do not trigger automatic status changes.

## Current limits

Archive tombstones are returned by the mutation and omitted from refreshed snapshots. There is no incremental sync feed yet. Background reminders, automated task extraction, cross-workspace moves with descendant/source orchestration, and bulk actions are separate capabilities, not hidden behavior in this service.
