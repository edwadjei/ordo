# Draft concepts

## Copied, never sent

A draft is an email or message the person may send themselves. Ordo never sends it anywhere; the web offers Copy and **Mark used**. Drafts are created by hand (`POST /v1/drafts`) or by saving an AI capture, which links them to their source note.

## Shape and rules

`{ id, workspaceId, projectId, sourceNoteId, kind: "email" | "message", to, subject, body, usedAt, revision, createdAt, updatedAt }`. A draft always belongs to a workspace (unlike a task, it has no Inbox scope); the project must belong to it. `to` and `subject` are optional plain text (at most 200 characters; blank becomes `null`); `to` is stored in the `recipient` column. `body` is at most 20,000 characters. `sourceNoteId` must be one of the owner's notes and is set on create only.

`PATCH /v1/drafts/:id` takes any of `workspaceId, projectId, kind, to, subject, body` and `used: true | false` (sets or clears `usedAt`), with `expectedRevision`. Moving a draft to another workspace clears its project unless one is given. `DELETE` archives it. Every write is check-on-save like notes: a stale revision is `409 REVISION_CONFLICT` with no write.
