# Workspace and project concepts

## One destination owner

WorkspacesService owns workspace/project records and destination validation. Projects currently remain in this domain because they share the same small ownership and containment model. Tasks and notes ask this service whether a destination is authorized; they never import its repository or query project tables themselves.

Every lookup resolves both entity ID and authenticated owner. A foreign ID yields the same not-found behavior as a missing ID. A project must belong to the selected workspace; merely owning both records is insufficient. Database composite foreign keys backstop the same containment rules.

## Favourites

A project has `favorite: boolean`, `false` by default, set on create or with `PATCH /v1/projects/:id` like any other project field (a revision-checked save). It is returned wherever projects are: project reads and lists, and the Home snapshot. Ordering favourites first is the client's choice; the API keeps its name order. Projects are never archived or deleted, so nothing clears a favourite except the owner.

## Personal Inbox

The personal Inbox is a null workspace/project destination with a non-null authenticated owner. It is not a fabricated workspace and is never ownerless data. `validateScope()` accepts this explicit empty destination, but a non-null project with null or mismatched workspace is rejected.

## Archiving

`PATCH` with `{ archived: true, expectedRevision }` sets `archivedAt` on a workspace or project; `false` clears it. Archiving twice keeps the first time. Nothing inside changes. Tasks, notes and drafts whose workspace or project is archived drop out of `/v1/home`, `GET /v1/tasks`, `GET /v1/notes`, `GET /v1/drafts` and `GET /v1/search`, which also hides archived projects and the projects of archived workspaces. Each of those lists except Home takes `?includeArchived=1` to bring them back. Workspace and project lists, Home included, still return archived ones, marked by `archivedAt`, so a client can offer an Archived filter. Restoring brings everything back as it was.

## Deleting permanently

`GET /v1/workspaces/:id/delete-preview` (or `/v1/projects/:id/delete-preview`) returns `{ name, projects, tasks, notes, drafts, captureRuns }`: what a delete would remove, archived items included. For a project, `projects` is 1.

`DELETE /v1/workspaces/:id` (or `/v1/projects/:id`) with `{ confirmName, expectedRevision }` removes the target and everything inside it and returns `{ deleted: { … } }` with the same counts. It cannot be undone. The checks, in order:

1. `confirmName` must equal the current name exactly, or `400 CONFIRM_NAME_MISMATCH`.
2. A stale revision is `409 REVISION_CONFLICT`.
3. The owner's last workspace stays: `409 LAST_WORKSPACE`. Archived workspaces count.
4. Another owner's id, or a retry after success, is `404`.

Everything goes in one D1 `batch()` (`permanent-delete.repository.ts`), each statement guarded by the confirmed name and revision (and, for a workspace, that another remains):

- projects;
- tasks at every level, archived ones too, and their retry keys;
- notes and drafts;
- capture runs in the scope or on a deleted note;
- task links (`ON DELETE CASCADE`);
- favourites, which are a project column;
- the FTS rows, through the delete triggers.

A task or draft filed elsewhere but saved from a deleted note is kept: it loses `sourceNoteId`, and its revision increases. No row anywhere is left pointing at something deleted; the tests check every table, the FTS indexes and `PRAGMA foreign_key_check`.

## Transaction boundary

`workspaces.service.ts` owns revision checks. Workspace and project updates are `UPDATE … WHERE revision = ?` (check-on-save); a save that loses a race returns `409 REVISION_CONFLICT`. Tasks and notes call `validateScope()` before their write. A project never changes workspace, so that read stays true unless the workspace or project is deleted permanently in between, and then the write fails on the composite foreign keys that backstop containment in the database. Nothing is written, and the client gets `409 SCOPE_DELETED`, as for any write that loses a race with a permanent delete. Repositories execute the actual scoped queries; they do not move children or infer destinations.

## On Cloudflare

These rules run on D1 as described above; there is no shared transaction or owner lock.
