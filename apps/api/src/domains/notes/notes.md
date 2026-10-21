# Note concepts

## Durable personal text

NotesService owns scoped plain-text notes, not AI summaries or transcripts. A note always belongs to an authenticated owner, and it may stay unassigned in that owner's personal Inbox. Workspace/project destinations are checked through WorkspacesService within the same owner transaction as the write.

## Preserve editing intent

`notes.service.ts` applies only supplied PATCH fields. A title edit must not erase body text or clear its destination. Expected revision rejects a stale edit rather than replacing text written in another client. The frontend's autosave/recovery behavior relies on this conflict response and must retain its unsaved text.

The service decides transaction and revision behavior; `notes.repository.ts` executes owner-scoped queries; the thin controller parses the shared schemas. Note archive is a soft deletion and returns a tombstone. No other domain writes normal note edits directly.

## Scope boundaries

Plain-text bodies are data and do not authorize AI processing, tool calls, or access to other workspaces. Rich editing, attachments, source-linked AI summaries, incremental sync, and multidevice offline note merge are not implemented by this foundation.
