# Everyday core finish brief

**Owner request (29 October 2026):** close release slice 1 of the [product requirements](../PRODUCT.md#12-suggested-release-slices). Edward asked for: project detail tabs ("this next please implement"), moving tasks between projects and workspaces, project favourites, rich notes, opening the app offline, pasting an email or uploading a transcript file ("can't we do this now?"), and setting your name after sign-up ("please do"). SMS sign-in needs no code: the hosted Worker already reports `otp.sms: true` because the Gatekeeper secrets are set.

**Branches:** API work on `edw/names-favourites-and-note-sources`, web work on `edw/finish-everyday-core-web`, both from `main` (`4e4c29a` or later). One PR each. The web specialist merges the API branch into the web branch once it is pushed, so the web PR can be reviewed against the real API. No AI attribution in commits or PRs. Never merge or deploy; Edward approves each merge, and every hosted deploy is a separate approval in the Cloudflare session.

## Shared contract

| Change            | Shape                                                                                                         | Rule                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set your name     | `PATCH /v1/auth/me` with `{ "displayName": string \| null }` → the same body as `GET /v1/auth/me`             | Uses `cleanDisplayName` from `packages/core`: trimmed, 1–80, never a phone number or email; empty or `null` clears it. Signed-in only, same-origin rules as other writes.           |
| Project favourite | `favorite: boolean` on projects, default `false`; settable on project create and `PATCH`                      | Returned everywhere projects are returned (lists, home, sync). Archiving does not clear it.                                                                                         |
| Note source       | `source: "manual" \| "recording" \| "email" \| "transcript"` on notes, default `"manual"`; set on create only | Immutable after create. Existing notes become `"manual"`. Recorder-made notes send `"recording"`.                                                                                   |
| Note body         | Markdown text in the existing `body` field, max 100,000 characters (unchanged)                                | Existing plain-text notes are valid Markdown. The API stores text only; no HTML is stored or rendered by the API. Search keeps indexing the raw text.                               |
| Move a task       | Existing task `PATCH` with `workspaceId` and/or `projectId`                                                   | API specialist confirms it moves the task's subtasks with it, rejects a project from another workspace, and keeps check-on-save (`revision`); adds tests if any of this is missing. |

## API specialist (`apps/api`, `packages/core`, `packages/db`)

1. Migration `packages/db/migrations/0004_favourites_and_note_sources.sql`: `projects.favorite integer not null default 0` (0/1 check) and `notes.source text not null default 'manual'` with a CHECK on the four values. Mirror in `packages/db/src/schema.ts`. Do not edit applied migrations.
2. `packages/core` schemas for the three fields above; `PATCH /v1/auth/me` route, service and repository through the identity domain.
3. Confirm the task move rules in the contract; add tests for cross-project, cross-workspace with subtasks, a project from another workspace (rejected), and a stale revision (409).
4. Tests for name set/clear/rejection of phone- or email-like names, favourite round trip, note source default and immutability. Every request stays inside the Free plan's 10 ms CPU.
5. Update `identity.md`, `workspaces.md`, `notes` docs and the API README where fields are listed. Add this brief to the PR.

## Web specialist (`apps/web`, `packages/client`)

Work in this order.

1. **Project detail tabs:** Overview · Tasks · Notes · Conversations · Drafts. Overview shows open tasks, overdue ones (blockers), Waiting On with who, and recent notes. Tasks and Notes are the project's lists. Conversations and Drafts show Coming soon (C19). Project-local Add task, Add note, Record and Upload actions.
2. **Move a task:** workspace and project selectors in the task panel; subtasks move with the parent; the list updates without a reload.
3. **Favourites:** a star on each project; favourites first in the workspace project list and in the sidebar's recent/quick list.
4. **Your name:** a "Your name" field in Settings saving through `PATCH /v1/auth/me`; My Day's greeting and avatar use it. With no name, show a neutral greeting and an initial-free avatar, never a phone number or email.
5. **Paste an email / Upload a transcript:** the existing Quick Action tiles open a dialog. Paste text, or pick a `.txt`, `.md`, `.vtt` or `.srt` file; the file is read in the browser (cue numbers and timestamps stripped for `.vtt`/`.srt`) and never uploaded or stored, only its text. Choose workspace, project and title, preview, then save as a note with `source` `"email"` or `"transcript"`. Over 100,000 characters: say so and do not save. No AI; the dialog says AI extraction comes later. Recorder notes now send `source: "recording"`. Show the source on the note.
6. **Open offline:** a service worker caches the static export so Ordo opens with no connection, showing the last loaded data read-only with a clear offline banner. Quick task capture keeps its durable queue. Edits and notes say they need a connection. The API (`/api/*`) is never cached.
7. **Rich notes** (Edward chose Markdown storage, 29 October 2026: "yess"): headings, bullets, numbered lists, checklists (tick in place), bold/italic and links, stored as Markdown in `body`. Recommended editor: a small Markdown-backed one, lazy-loaded so My Day does not get heavier. Render without raw HTML (no `dangerouslySetInnerHTML` on note text); links open safely (`rel="noopener noreferrer"`, `http`/`https`/`mailto` only). Autosave as today.
8. Desktop and 390 px screenshots of each item under `design/evidence/everyday-core-finish/`; keyboard and screen-reader labels on every new control.

## Done criteria

- Both PRs pass format, typecheck, tests, build and docs checks; the web PR carries screenshots.
- Signed-in browser journeys on `npm run dev`: set name, favourite a project, move a task with subtasks across workspaces, use each project tab, paste an email and upload a `.vtt`, reload offline and see cached data, and write a note with a checklist.
- Docs describe what the code now does, including [local development](../LOCAL-DEVELOPMENT.md) for the service worker during development.
- Not in this brief: AI extraction, Conversations and Drafts content, sync conflict handling, and any hosted deploy.
