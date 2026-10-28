# Task concepts

## Task ownership and destinations

`tasks.service.ts` owns task creation, editing, hierarchy, completion, archive, and retry idempotency. Every query in its repository includes the authenticated owner. WorkspacesService alone validates workspace/project destinations. A parent and child must share both workspace and project, including null values for a personal Inbox hierarchy.

## Atomic hierarchy rules

D1 has no row locks or interactive transactions, so every rule is a save precondition written into the statement (check-on-save). The service reads the proposed ancestry in one recursive query bounded to 500 IDs, rejects self/descendant cycles and over-deep chains, and refuses a foreign, archived or missing parent (`404`) or one in a different destination (`SCOPE_MISMATCH`). The save is then conditional on the task's revision and on the revision of every ancestor it read, so a concurrent move anywhere in that chain makes one of the two saves fail with `409 REVISION_CONFLICT`. Two crossing moves (A under B, B under A) therefore cannot both succeed.

Changing a parent's destination while it has active children is rejected (`409 HAS_SUBTASKS`); the user must explicitly move/archive children first. The `UPDATE` itself carries `NOT EXISTS (active child)`, so a child created between the check and the write still blocks it. Archive is soft deletion, is allowed for a leaf, and cannot hide active children behind an archived parent. A subtask insert is `INSERT … SELECT … WHERE` the parent is still active, unchanged and in the same destination. Completing a parent changes only that task; children remain open unless explicitly completed.

The repository performs scoped reads and guarded inserts/updates; it does not decide lifecycle transitions. When a guarded write changes nothing, the service re-reads to report why (`404`, `HAS_SUBTASKS` or `REVISION_CONFLICT`); nothing has been written. The controller has no SQL.

## Retry identity versus record revision

`create()` fingerprints the normalized create payload through the Tasks-owned `ContentHasher` port. The task and its owner-scoped idempotency key are inserted in one D1 `batch()` (an implicit transaction); the key row is inserted only if the task row was. A concurrent create with the same key loses on the unique `(owner_user_id, key)` constraint, its batch rolls back, and the stored fingerprint decides between returning the original (`200`) and `409 IDEMPOTENCY_CONFLICT`. Same key/same payload returns the original task; same key/different payload is a conflict. An archived original does not reappear when its create is retried.

Revision is a different concern: PATCH/DELETE require the current revision and reject stale edits before writing; the write is `UPDATE … WHERE id = ? AND owner_user_id = ? AND revision = ?`, which increments the revision, so a save that loses a race also gets `409 REVISION_CONFLICT`. PATCH schemas intentionally have no creation defaults, so completing or renaming a task preserves unrelated scope, dates, parent, and description.

## Dates and completion

Due and follow-up dates are date-only strings, not arbitrary midnight timestamps. Status is explicit (`todo`, `in_progress`, `waiting`, `done`); overdue is a view calculation. Entering Done sets completion time, repeating a Done edit preserves it, and reopening clears it. Waiting and a follow-up date do not trigger automatic status changes.

## Times and people

`dueTime` and `followUpTime` are optional `HH:MM` (24-hour) local wall-clock times in the user's timezone, kept in their own columns so date-only storage and date logic are unchanged. A time refines its date: the service checks the merged task (after a PATCH is applied to the stored row) and rejects a time whose date is null with `400 INVALID_INPUT`. Clearing a date therefore must clear its time in the same request. Migration `0001_initial.sql` enforces the same format, date requirement and 1–80 character name length with CHECK constraints.

`responsiblePerson` and `waitingOn` are plain-text names: trimmed, at most 80 characters, an empty string becomes `null`. They are never resolved to accounts and grant nothing. `waitingOn` says who a Waiting task is waiting on; it does not change Waiting On membership, which remains `status: waiting`. Both names are included in task search. Reminders are in-app view calculations only; the service schedules nothing.

## Current limits

Archive tombstones are returned by the mutation and omitted from refreshed snapshots. There is no incremental sync feed yet. Background reminders, automated task extraction, cross-workspace moves with descendant/source orchestration, and bulk actions are separate capabilities, not hidden behavior in this service.

## On Cloudflare

The rules above are how the code works on D1, locally under `wrangler dev` and in tests. `test/concurrency.test.ts` exercises each rule twice: deterministically at the statement level (a precondition changed between the read and the write) and as concurrent requests through the API. Fingerprints use Web Crypto SHA-256 with the same output as the earlier Node implementation, so imported idempotency keys still match. Triggers keep `tasks_fts` current.
