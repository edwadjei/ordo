# Note concepts

## Durable personal text

NotesService owns scoped text notes, not AI summaries. A note always belongs to an authenticated owner, and it may stay unassigned in that owner's personal Inbox. Workspace/project destinations are checked through WorkspacesService before the write; workspaces and projects are never deleted and a project never changes workspace, so that check stays true, and composite foreign keys enforce the same ownership in the database.

## Body and source

`body` is Markdown text, at most 100,000 characters; existing plain-text notes are already valid Markdown. The API stores and returns it exactly as sent and never renders or sanitizes it, so clients must render it without raw HTML. Search indexes the raw text. Note create and edit accept a JSON body of up to 450,000 bytes (other routes keep 150,000), so a full 100,000-character body fits in any script, even at three bytes a character.

`source` records where a note came from: `manual` (typed; the default and the value given to every note that existed before migration 0004), `recording` (the recorder's transcript), `email` (pasted email text) or `transcript` (an uploaded transcript file's text). It is set on create only: `PATCH` with `source` is refused as `400 INVALID_INPUT`, like any unknown field. The source is a label; it stores no audio, file or email metadata.

## Preserve editing intent

`notes.service.ts` applies only supplied PATCH fields. A title edit must not erase body text or clear its destination. Expected revision rejects a stale edit rather than replacing text written in another client. The frontend's autosave/recovery behavior relies on this conflict response and must retain its unsaved text.

The service decides revision behavior; `notes.repository.ts` executes owner-scoped queries; the thin controller parses the shared schemas. Note archive is a soft deletion and returns a tombstone. No other domain writes normal note edits directly.

## Scope boundaries

Note bodies are data and do not authorize AI processing, tool calls, or access to other workspaces. Attachments, source-linked AI summaries, incremental sync, and multidevice offline note merge are not implemented by this foundation.

## On Cloudflare

A note save is `UPDATE … WHERE id = ? AND owner_user_id = ? AND revision = ?`; zero rows changed returns `409 REVISION_CONFLICT` and nothing is written. Triggers keep `notes_fts` current.
