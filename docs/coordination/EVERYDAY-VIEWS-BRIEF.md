# Everyday views brief

**Owner request (21 October 2026):** make the everyday views usable before other work. Inbox, Upcoming and Waiting On currently look identical and empty; the add-task control is barely visible; Upcoming has no dates; Waiting On does not say who is being waited on; tasks have no times or people; My Day should welcome the user by first name. [Product requirements](../PRODUCT.md) are the source of truth.

**Branch:** `edw/ordo-everyday-views` from `main`. One PR. No AI attribution in commits or the PR. Never merge or deploy; Edward approves.

## Shared contract

Coordinator decisions, recorded so both specialists build against the same shape:

| Field | Type | Rule |
|---|---|---|
| `dueTime` | `"HH:MM"` (24-hour) or `null` | Local wall-clock time in the user's timezone. Requires `dueDate`. |
| `followUpTime` | `"HH:MM"` or `null` | Same, requires `followUpDate`. |
| `responsiblePerson` | string 1–80, or `null` | Plain text name; trimmed; empty becomes `null`. Never matched to accounts. |
| `waitingOn` | string 1–80, or `null` | Plain text name; same rules. |

- Date-only storage stays as decided; time is a separate optional column, so existing tasks and date logic are unchanged.
- A time without its date is rejected with a validation error. Clearing a date in the UI clears its time in the same request.
- Waiting On keeps its definition: tasks whose status is Waiting. `waitingOn` describes who, it does not change membership.
- Reminders: in-app only for this slice. A task whose due or follow-up moment has passed is surfaced at the top of My Day as due now; no browser notifications or automatic status changes. Push/notification reminders are a later decision for Edward.

## API specialist — `apps/api`, `packages/core`, `packages/db`

1. Migration `packages/db/migrations/0005_task_times_people.sql`: nullable `due_time text`, `follow_up_time text`, `responsible_person text`, `waiting_on text` on `tasks`, with CHECK constraints for the time format and each time requiring its date. Mirror in `packages/db/src/schema.ts`. Do not edit applied migrations.
2. `packages/core`: add the four fields to `taskInput` (defaults `null`) and `taskPatch` (optional, omitted means unchanged). Time regex `^([01]\d|2[0-3]):[0-5]\d$`. Names: trim, max 80, empty string → `null`.
3. Service: after merging a patch, reject a time whose date is null with the existing validation error shape. Persist and return the fields on create, patch, list, home and sync responses.
4. Search: include `responsiblePerson` and `waitingOn` text in task search if it fits the existing search index without a risky rewrite; otherwise note it as a finding.
5. Tests: create/patch round trip, omitted-field preservation, time-without-date rejection, clearing a date with its time, name trimming/empty → null, and authorization unchanged.
6. Update `apps/api/src/domains/tasks/tasks.md` and the API README where fields are listed.

## Web specialist — `apps/web`, `packages/client`

Build on the API specialist's contract above. Visual language from the requirements: airy, calm, restrained orange accent, crisp type, light/dark, keyboard focus, no dashboard clutter, mobile-friendly.

1. **My Day header.** Replace the "01 / MY DAY" label and generic headline with a time-aware greeting using the first word of `user.displayName` ("Good morning, Edward"), today's date in the user's timezone, and one short line on what is due. Below it, the five counts from the requirements as compact clickable chips: Today, Overdue, Upcoming (7 days), Waiting On, Inbox. Each opens its view. Keep the five quick-action tiles.
2. **My Day content.** "Due now" (passed due/follow-up moments with a time), Overdue, Today, then a short Waiting On preview (up to three, with who and follow-up) linking to the full list. Empty states invite a capture.
3. **Distinct views.** Each view gets its own header icon, one-line purpose and count, and its own empty state:
   - **Inbox:** unsorted tasks and notes; frame as triage.
   - **Upcoming:** grouped by local day for the next seven days ("Tomorrow", "Thursday 23 Oct"); each item shows whether it is due or a follow-up, and the time if set.
   - **Waiting On:** each row shows who it is waiting on, the follow-up date/time (overdue follow-ups highlighted), and the responsible person if set.
4. **Visible Add Task.** A clear inline composer at the top of every task list (title + Enter), using the view's natural defaults: Inbox → no project; Waiting On → status Waiting; Upcoming → due tomorrow. Remove reliance on the faint link alone.
5. **Task detail.** Due date + optional time, follow-up date + optional time, Responsible and Waiting on name fields, with suggestions from names already used. Clearing a date clears its time. Progressive: the composer still needs only a title.
6. **Rows everywhere** show time when set and "Waiting on <name>" when set.
7. Client tests for view grouping/counts and greeting logic (`apps/web/lib/views.ts` is the place for pure logic). Desktop and narrow-mobile screenshots for the PR.
