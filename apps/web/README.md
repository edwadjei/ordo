# Ordo Web

Responsive Next.js client for Ordo. In the Cloudflare design it is built as a static export (`output: 'export'`) and served by the same Worker that serves the API under `/api`, so the browser talks to one origin and the session cookie stays first-party.

**Implementation status:** `npm run build` produces a static export in `apps/web/out`, which the Worker under `wrangler dev` serves on `127.0.0.1:8788` beside `/api`. For development, `next dev` on `127.0.0.1:3358` proxies `/api/*` to that Worker. Sign-in is code only. Nothing is hosted yet; hosting is Phase 3. Delivery follows coordinated-development. Mobile native work follows web using the agreed React Native/Expo direction with iOS priority; this browser app is not the native mobile deliverable.

## Run

From the repository root, with Node 22 selected:

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:3358. The root `npm run dev` applies local D1 migrations, then starts the Worker (`wrangler dev` on 8788) and `next dev` on 3358 together; see [local development](../../docs/LOCAL-DEVELOPMENT.md) for the details and for running them separately. `npm run dev --workspace @ordo/web` starts only the web dev server and expects the Worker to be running. `ORDO_API_URL` optionally overrides the Worker origin for the dev proxy (default `http://127.0.0.1:8788`); it is not a browser-exposed variable.

## Static export and same-origin `/api`

`next.config.ts` is phase-aware. Under `next dev` it adds a `/api/:path*` rewrite to the same path on the Worker, which maps `/api/*` to the API's `/v1/*` exactly as it does for the export. Every other phase (including `npm run build`) sets `output: 'export'` and has no rewrites, so the build is plain HTML, CSS and client JavaScript in `apps/web/out`; there are no route handlers, server actions, or request-time `headers()`/`cookies()`. The export is a single page with no client-side routes, so the Worker's `404-page` asset handling is sufficient.

The browser client always calls `/api/...` relative to the page's own origin (`createClient('/api')`). There is no absolute API URL in browser code and no `NEXT_PUBLIC_` API variable. To check the export as hosted Ordo will serve it, run `npm run build --workspace @ordo/web`, start `npm run dev`, and open `http://127.0.0.1:8788`. `next start` does not apply to a static export.

Sign in or create an account with an email address or Ghana phone number and a six-digit code. Locally, with no Gatekeeper values, the code is printed in the `wrangler dev` terminal. The code field keeps only digits, so a pasted `658 659`, `658-659` or a code with a stray space or line break still works, and Enter submits from the code or name field. A short code shows a plain error under the field instead of a browser tooltip. The form does not auto-submit at six digits, so a new account can still add its optional name. There is no password sign-in. Start empty or explicitly load the fictional examples. Fixtures are added only to the signed-in account.

## Working flows

- Code sign-in and logout; no passwords exist and none are kept in browser storage.
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

## Read-your-writes bookmark (`X-Ordo-Bookmark`)

The Worker opens a D1 Sessions API session from the request's `X-Ordo-Bookmark` and returns the session's latest bookmark in the same header. The shared client (`packages/client`) keeps the newest value per account, in memory and in localStorage under `ordo.bookmark.v1:<account>` beside the task queue, and sends it on that account's next request. D1 documents bookmarks as lexicographically sortable from oldest to newest ([D1 bookmarks](https://developers.cloudflare.com/d1/reference/time-travel/#bookmarks)), so when responses arrive out of order the client keeps the larger value rather than the last to arrive. A bookmark received before sign-in is held in memory only and carried over to the account that signs in. Sign-out clears that account's bookmark, even if the sign-out request fails; other accounts' bookmarks are untouched. Storage failures are ignored, because a missing bookmark only means a read may come from an older replica.

**No service worker is installed.** An already open app can queue tasks while offline, but a cold offline reload is not guaranteed to load the application shell. Only task creation is queued; task edits, workspaces/projects, and notes require the API. Note text is retained in the open editor after a failure and warns on closing/unloading; it is not a durable offline note queue. A full multi-device sync protocol and conflict resolution UI remain later work.

Settings selects **Cloudflare (free, built in)**, which is Workers AI Whisper and the default, or **OpenAI (your key)**, an account-owned OpenAI key; each shows its cost and where audio goes. With a ready provider, Record captures microphone audio into memory; Stop transcribes it and discards the audio. Only the transcript can be explicitly saved as a note. There is no audio file picker, recording history, playback, or audio persistence. When the selected provider is not ready (Workers AI off on this server, which is always the case under `npm run dev`, or OpenAI without a saved key), the Record card reads "Set up in Settings" and opens a recorder that says why and offers Open Settings, without requesting microphone access. Transcription failures are shown in the API's own words, for example when today's free Workers AI allowance is used up; see [audio setup](../../docs/AUDIO-SETUP.md). Record stays "Coming soon" only when audio settings could not be loaded. AI Capture and Upload Transcript are disabled with Coming soon labels. Project favorites and reassigning task destinations remain pending. Light, Dark, and System themes are supported.

## Checks

From the repository root:

```bash
npm run typecheck --workspace @ordo/web
npm run build --workspace @ordo/web
npm run test --workspace @ordo/client
npm run test --workspace @ordo/web
```

The shared-client tests cover bookmark store-and-forward (header absent, latest value forwarded, an older bookmark arriving late, reload, per-account separation, sign-in carry-over, sign-out clearing, unavailable storage), account isolation, idempotency preservation, storage failure, authenticated mutation preconditions, session-change propagation, and an autosave regression for edits made during a slow request. The web tests cover the pure view logic in `lib/views.ts`: the greeting, local-timezone clock, My Day sections and counts, seven-day grouping across month and year ends, Waiting On ordering, and name suggestions, and `lib/sign-in-code.ts`: sign-in code normalising (spaces, dashes, line breaks, non-breaking and zero-width characters, full-width and Arabic-Indic digits) and the short-code message. Browser verification is recorded separately (Phase 2 screenshots on `wrangler dev` are in `design/evidence/cf-phase-2/`); compilation alone does not prove user journeys.

## Appearance

Use the sun/moon icon in the top bar or sign-in screen to switch between Light and Dark. The choice is saved in this browser. Before an explicit choice, appearance follows the operating system. Both themes retain orange accents and workspace colors. CSS light-dark() requires a current browser.
