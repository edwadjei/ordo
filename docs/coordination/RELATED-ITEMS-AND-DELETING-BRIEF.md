# Related items and deleting workspaces brief

**Owner request (29 October 2026):** on the task panel's links to related notes, drafts and conversations: "complete?"; on deleting workspaces and projects: "please buikd". The [product requirements](../PRODUCT.md) section 5E (task detail: related notes, drafts and conversations) is the source of truth.

**Coordinator decisions (Edward may redirect):**
- **Archive first, delete permanently second.** Workspaces and projects can be archived (hidden, restorable) and, separately, deleted permanently. Permanent deletion removes everything inside and cannot be undone. Ordo asks you to type the name, after showing what will go.
- **Related items** on a task are: the source note (already shown), the other tasks and drafts saved from the same capture, and notes you link by hand.

**Branches:** API on `edw/related-items-and-deleting-api`, web on `edw/related-items-and-deleting-web`, both from `main` (`4f335a9` or later). One PR each. The web specialist merges the API branch in once it is pushed. No AI attribution in commits or PRs. Never merge or deploy. Do not run prettier on Markdown. Keep each request inside the 10 ms CPU budget.

## Shared contract

| Change | Shape | Rule |
|---|---|---|
| Archive a workspace or project | `PATCH /v1/workspaces/:id` and `PATCH /v1/projects/:id` with `{ archived: true \| false, expectedRevision }` | Reuse the existing archive state if one exists. Archived ones drop out of My Day, Inbox and pickers, but their items stay intact and searchable only under an "Include archived" filter. Restoring brings everything back |
| Delete preview | `GET /v1/workspaces/:id/delete-preview` and `GET /v1/projects/:id/delete-preview` → `{ name, projects, tasks, notes, drafts, captureRuns }` | Counts of what a delete would remove, including archived items |
| Delete permanently | `DELETE /v1/workspaces/:id` and `DELETE /v1/projects/:id` with `{ confirmName, expectedRevision }` → `{ deleted: { projects, tasks, notes, drafts, captureRuns } }` | `confirmName` must equal the current name exactly, or 400 `CONFIRM_NAME_MISMATCH`. A stale revision is 409. Everything in it goes in one D1 `batch()`: projects, tasks (all levels), notes filed there, drafts, capture runs, task links, favourites and FTS rows; no orphans. The last remaining workspace cannot be deleted (409 `LAST_WORKSPACE`). An idempotent retry after success returns 404 |
| Task links | New `task_note_links (task_id, note_id, owner_user_id, created_at)`, unique per pair. `POST /v1/tasks/:id/links` with `{ noteId }` → 201; `DELETE /v1/tasks/:id/links/:noteId` → 204 | Same owner only. A link disappears when either side is deleted permanently; archiving keeps it |
| Related items | `GET /v1/tasks/:id/related` → `{ sourceNote: NoteSummary \| null, linkedNotes: NoteSummary[], captureTasks: TaskSummary[], drafts: Draft[] }` | `captureTasks` and `drafts` are the other items saved from the same source note (up to 20 each). Archived items are excluded unless `?includeArchived=1` |

## API specialist (`apps/api`, `packages/core`, `packages/db`)

1. Migration `0006_related_items_and_deleting.sql`: `task_note_links`, plus any archive column workspaces still lack. Mirror it in `schema.ts`.
2. Routes, services and repositories as in the contract, with ownership checks on every id.
3. Tests:
   - archive and restore;
   - previews whose counts match what a delete removes;
   - delete of a project, then a workspace, with nested subtasks, notes, drafts, runs, links and favourites, checked down to zero orphans in every table, including FTS;
   - name mismatch, stale revision and last workspace;
   - another owner's id (404);
   - linking and unlinking, duplicate links and related-items content.
4. Docs: workspaces, tasks and notes notes, and the API README. Add this brief to the PR.

## Web specialist (`apps/web`, `packages/client`)

1. **Task panel › Related:** the source note (as today), "From the same capture" (tasks and drafts), and Linked notes with **Link a note** (search picker) and Unlink. Each opens its item.
2. **Workspace and project menus:** Archive / Restore. An **Archived** filter in the sidebar and the workspace project list.
3. **Delete permanently:** in each workspace's and project's settings, in a clearly separated danger section. It shows the preview counts ("Deletes 2 projects, 14 tasks, 6 notes, 1 draft"), asks you to type the name, and only then enables the button. After deleting, go to My Day and refresh it. The last workspace says it can't be deleted.
4. Offline: archive, delete and linking say they need a connection.
5. Signed-in journey on your own ports with fictional data:
   - link and unlink a note;
   - Related shows the same-capture items;
   - archive and restore a project;
   - delete a project, then a workspace, with the counts checked and nothing left behind in My Day, search or Inbox;
   - a wrong name keeps the button disabled.
   Desktop and 390 px screenshots under `design/evidence/related-and-deleting/`.

## Done criteria

- Both PRs pass format, typecheck, tests, build and docs checks; the web PR carries screenshots.
- No orphaned rows after a permanent delete (tested).
- Not in this brief: undo for permanent deletion, trash or recycle bin, and sharing.
