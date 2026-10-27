# Ordo Web

Responsive Next.js client for Ordo. In the Cloudflare design it is built as a static export (`output: 'export'`) and served by the same Worker that serves the API under `/api`, so the browser talks to one origin and the session cookie stays first-party.

**Implementation status:** today the app runs on the Next.js server and proxies `/api/*` to the local API; the static export and `X-Ordo-Bookmark` header plumbing are Phase 1 ([brief](../../docs/coordination/CLOUDFLARE-PHASE-1-BRIEF.md)). Delivery follows coordinated-development. Mobile native work follows web using the agreed React Native/Expo direction with iOS priority; this browser app is not the native mobile deliverable.

## Run

From the repository root, with Node 22 selected:

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:3318. The API listens on port 4318; Next proxies `/api/*` to `/v1/*` so the browser uses same-origin, HttpOnly session cookies. `ORDO_API_URL` optionally overrides the API upstream for the web server; it is not a browser-exposed variable.

Sign in or create an account using email/Ghana phone OTP. Gatekeeper delivery must be configured. Locally, existing password accounts have a fallback login; first successful email OTP conversion revokes prior password access. Hosted Ordo is code-only. Start empty or explicitly load the fictional examples. Fixtures are added only to the signed-in account.

## Working flows

- Code sign-in and logout (plus the local-only legacy password fallback); no passwords are kept in browser storage.
- Workspaces with distinct colors, project creation/filtering, global views, and scoped task/note capture.
- Tasks, nested subtasks, explicit completion, status/priority/date editing, and archive. Parent completion does not complete children. Tasks with active children cannot be archived until those children are addressed.
- My Day greets the user by first name with a time-of-day greeting and today's date in their timezone (default Africa/Accra), a one-line summary, and five count chips (Today, Overdue, Upcoming over seven days, Waiting On, Inbox). Its list runs Due now (a timed due or follow-up moment today that has arrived), Overdue, Today, a three-item Waiting On preview, then undated tasks. This is in-app only: there are no browser notifications and no automatic status changes.
- Every task list starts with an inline composer (type a title and press Enter) that uses the view's defaults: My Day → due today, Inbox → no project, Upcoming → due on the chosen day (tomorrow by default), Waiting On → status Waiting.
- Inbox frames unsorted tasks and notes as triage. Upcoming groups the next seven local days ("Tomorrow", "Friday 23 Oct"), shows each item as Due or Follow up with its time, and offers to plan on empty days. Waiting On lists Waiting-status tasks with who they wait on, the follow-up date and time (passed follow-ups highlighted), and the responsible person.
- Task detail edits due and follow-up dates with optional times (clearing a date clears its time in the same save), plus Responsible and Waiting on names, with suggestions from names already used. Only changed fields are sent. Rows show times and "Waiting on <name>" everywhere.
- Plain-text notes with debounced autosave, sequential revision handling, visible unsaved/failure state, and close protection. Conflicts preserve the current editor text for copying/retry; automatic merge is not implemented.
- `⌘K` / `Ctrl+K` searches authorized tasks, note bodies, and projects through the server full-text search endpoint.
- Responsive phone-browser layout, navigation drawer, and keyboard-accessible native dialogs.

## Local capture and honest offline limits

New tasks are first written to an account-keyed localStorage queue with a stable idempotency key. Successful server acknowledgment removes the queue record. Network/storage/validation failures remain visible. A new capture during an in-flight successful sync triggers another drain. Queues are never sent under a different displayed account: client write preconditions and server ownership checks enforce that boundary.

The current-account pointer and a last-loaded account snapshot are cached for an already loaded client. Logout clears the pointer and visible snapshot; unsynced task captures remain stored under the original account and require signing in as that account again. A 401 or account mismatch clears the active view. Browser data is device-local and should not be used on a shared device without considering local browser access.

**No service worker is installed.** An already open app can queue tasks while offline, but a cold offline reload is not guaranteed to load the application shell. Only task creation is queued; task edits, workspaces/projects, and notes require the API. Note text is retained in the open editor after a failure and warns on closing/unloading; it is not a durable offline note queue. A full multi-device sync protocol and conflict resolution UI remain later work.

Settings selects Local Whisper on this Mac/server (default) or an account-owned OpenAI key. With a ready provider, Record captures microphone audio into memory; Stop transcribes it and discards the audio. Only the transcript can be explicitly saved as a note. There is no audio file picker, recording history, playback, or audio persistence. Without a ready selected provider, Record shows Coming soon and does not request microphone access. AI Capture and Upload Transcript are disabled with Coming soon labels. Project favorites and reassigning task destinations remain pending. Light, Dark, and System themes are supported.

## Checks

From the repository root:

```bash
npm run typecheck --workspace @ordo/web
npm run build --workspace @ordo/web
npm run test --workspace @ordo/client
npm run test --workspace @ordo/web
```

The shared-client tests cover account isolation, idempotency preservation, storage failure, authenticated mutation preconditions, session-change propagation, and an autosave regression for edits made during a slow request. The web tests cover the pure view logic in `lib/views.ts`: the greeting, local-timezone clock, My Day sections and counts, seven-day grouping across month and year ends, Waiting On ordering, and name suggestions. Browser verification is recorded by the coordinator separately; compilation alone does not prove user journeys.

## Appearance

Use the sun/moon icon in the top bar or sign-in screen to switch between Light and Dark. The choice is saved in this browser. Before an explicit choice, appearance follows the operating system. Both themes retain orange accents and workspace colors. CSS light-dark() requires a current browser.
