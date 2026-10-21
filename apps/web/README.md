# Ordo Web

Responsive Next.js client for Ordo's first working everyday-core slice. Delivery follows coordinated-development. Mobile native work follows web using the agreed React Native/Expo direction with iOS priority; this browser app is not the native mobile deliverable.

## Run

From the repository root, with Node 22 selected:

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:3318. The API listens on port 4318; Next proxies `/api/*` to `/v1/*` so the browser uses same-origin, HttpOnly session cookies. `ORDO_API_URL` optionally overrides the API upstream for the web server; it is not a browser-exposed variable.

Create an account with an email, name, and password of at least 12 characters. This build does not send email or verify email ownership. Start empty or explicitly load the fictional examples. Fixtures are added only to the signed-in account.

## Working flows

- Account registration, login, and logout; no passwords are kept in browser storage.
- Workspaces with distinct colors, project creation/filtering, global views, and scoped task/note capture.
- Tasks, nested subtasks, explicit completion, status/priority/date editing, and archive. Parent completion does not complete children. Tasks with active children cannot be archived until those children are addressed.
- My Day shows due/overdue tasks and follow-ups, with an additional undated-task list. Upcoming covers the next seven days. Inbox includes tasks without a project; Waiting On includes explicit Waiting status.
- Plain-text notes with debounced autosave, sequential revision handling, visible unsaved/failure state, and close protection. Conflicts preserve the current editor text for copying/retry; automatic merge is not implemented.
- `⌘K` / `Ctrl+K` searches already-loaded authorized tasks, notes, and projects. Search is client-side for this small slice, not a server full-text endpoint.
- Responsive phone-browser layout, navigation drawer, and keyboard-accessible native dialogs.

## Local capture and honest offline limits

New tasks are first written to an account-keyed localStorage queue with a stable idempotency key. Successful server acknowledgment removes the queue record. Network/storage/validation failures remain visible. A new capture during an in-flight successful sync triggers another drain. Queues are never sent under a different displayed account: client write preconditions and server ownership checks enforce that boundary.

The current-account pointer and a last-loaded account snapshot are cached for an already loaded client. Logout clears the pointer and visible snapshot; unsynced task captures remain stored under the original account and require signing in as that account again. A 401 or account mismatch clears the active view. Browser data is device-local and should not be used on a shared device without considering local browser access.

**No service worker is installed.** An already open app can queue tasks while offline, but a cold offline reload is not guaranteed to load the application shell. Only task creation is queued; task edits, workspaces/projects, and notes require the API. Note text is retained in the open editor after a failure and warns on closing/unloading; it is not a durable offline note queue. A full multi-device sync protocol and conflict resolution UI remain later work.

Record, Upload Transcript, and AI Capture are visible planned entry points. They explain their availability and offer task/note capture; they do not request a microphone, upload files, send content to providers, or fabricate processing success. Dark mode, project favorites, reassigning task destinations, people fields, and server-side full-text search are not implemented in this slice.

## Checks

From the repository root:

```bash
npm run typecheck --workspace @ordo/web
npm run build --workspace @ordo/web
npm run test --workspace @ordo/client
```

The shared-client tests cover account isolation, idempotency preservation, storage failure, authenticated mutation preconditions, session-change propagation, and an autosave regression for edits made during a slow request. Browser verification is recorded by the coordinator separately; compilation alone does not prove user journeys.
