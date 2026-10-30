# Web foundation verification

**Date:** 21 October 2026.

**Branch:** `edw/ordo-web-foundation`.

**Scope:** Local responsive web foundation and DAMSYN-style API structure. This is not a complete MVP, native app release, or deployment report.

## Automated checks

| Check | Result |
|---|---|
| Fresh `npm ci` | Passed for the foundation dependency lockfile |
| `npm run format:check` | Passed on the refactored source |
| `npm run typecheck` | All five workspaces passed |
| `npm test` | 20 passed: 12 API tests and 8 client tests |
| Production web build | Passed after the orange palette and keyboard-focus changes |
| API build/typecheck | Passed for the modular API |
| Documentation generation and link checking | Passed; rerun after final documentation edits |
| Independent refactor review | No blocking findings; all 26 baseline routes retained |
| Baseline migration and shared contracts | Unchanged by the API refactor |

The API tests include authentication/session revocation, CSRF, scope/owner containment, idempotent retries, revision conflicts, nested cycles, independent parent completion, archive behavior, explicit fixtures, restart persistence, omitted-field preservation, account-switch rejection, and logout after sign-in throttling. Four architecture checks enforce import boundaries and keep SQL/transaction orchestration out of controllers and app composition.

Client tests cover owner-bound queues, stable retry keys, storage errors, account preconditions, session-change handling, and edits during in-flight autosaves. Timing across browser tabs was also reviewed structurally; it was not independently exercised across physical devices.

## Signed-in browser checks

Performed in the local browser with a deliberately fictional `Ordo Demo` account and fictional examples:

| Journey | Observed result |
|---|---|
| Register → empty workspace | Account created; no automatic sample import |
| Explore fictional examples | Explicit action loaded only this account's sample workspaces/projects |
| Add Task → title → Enter | Created through the API and displayed as saved |
| Reload task | Record survived reload |
| Edit title and description | Saved fields remained visible |
| Add subtask, complete parent | Parent completed; child remained open |
| Quick Note → edit | Unsaved state changed to Saved after persistence |
| Reload → search → reopen note | Saved title and body remained intact |
| `⌘K` | Search opened with input focus after the dialog-focus fix |
| Escape | Dialog closed and focus returned to the triggering control |
| Open Add Task | Composer focused the title field immediately |
| Sign out → sign in | Private view cleared and correct account records returned |
| MTN project list/filter | 21 projects rendered; typing “SIM” narrowed the list; project scope opened correctly |
| Restart refactored API | Existing session, tasks, and notes loaded from the same database |
| Write after API refactor | New task created successfully through the new controller/service/repository path |

Screenshot: `design/evidence/home-orange.png`. It shows the running app, not the static prototype. White surfaces remain neutral; orange is limited to brand/action cues and the section label.

## Not verified or not implemented

No native iOS/Android or Mac package exists yet. No physical-phone/browser compatibility matrix or p95 timing measurement has been completed. The standard external PostgreSQL driver, production proxy-aware rate limiting, concurrent multi-instance migrations, hosted CI, backup/restore, and deployment are not verified.

There is no offline app shell for cold offline reload, full incremental sync protocol, full offline note editing, dark mode, project favorites, people fields, or destination-editing UI. Recording, transcript processing, AI suggestions, MCP, and native-client authentication remain later work. Planned buttons say so explicitly.

## Checkpoints and approval

Documentation (`7c3715a`), persistent web foundation (`8e5b837`), and orange/capture-focus refinement (`251efa8`) were pushed as separate checkpoints. The modular API and this evidence form a separate checkpoint; use the Git log for its exact revision. All use `edwadjei <edd.net49@gmail.com>`, with no AI attribution.

No merge, deployment, shared-environment migration, or production action has occurred. Those remain subject to Edward's explicit approval for the particular change.

## Web appearance — 21 October 2026

Added Light, Dark, and System appearance to signed-in web and sign-in screens. The browser remembers the choice locally, applies it before page paint, and follows OS changes in System mode through CSS color-scheme. No account data is stored with this preference. Modern browsers supporting CSS light-dark() are required.

Browser checks: switched light/dark, reloaded and confirmed Dark remained selected, opened capture with title focus, and inspected responsive Home and dialog. Desktop Home was visually inspected at 1280px; committed responsive screenshots were captured at 550px. System mode is implemented but OS switching and cross-tab changes have not been manually exercised. Sign-in styling has not had a separate visual check in this change.

Evidence: `design/evidence/home-dark-responsive.png`, `design/evidence/home-light-responsive.png`, and `design/evidence/capture-dark.png`.

## Passwordless, search, and audio slice — 21 October 2026

Branch: `edw/ordo-passwordless-capture`, based on pushed `edw/ordo-web-foundation`; PR targets that nonproduction foundation branch. No merge or deployment performed.

Verification passed: 25 API tests plus 14 client tests (39 total), all-workspace typechecks, production build, formatting check, and documentation generation/link validation. Independent review found and fixed stale-account read leakage and first-email-proof password/session revocation. The first API test run while files were still under construction had temporary fixture/boundary failures; the final complete suite passes.

Browser checks against the compiled app and migrated local API: existing session/data survived startup; search returned note titles and task descriptions from PostgreSQL; a generated one-second WAV tone uploaded, saved, and reappeared after a page reload; saved audio loaded a one-second preview; unavailable transcription said Coming soon. Signed out to inspect email/phone OTP entry without requesting a message, then signed back into the fictional legacy demo account. AI Capture and Upload Transcript show disabled Coming soon labels, including the narrow layout. No microphone prompt or real provider call was made.

Screenshots committed: `design/evidence/home-coming-soon-desktop.jpg` (1280×720), `home-coming-soon-responsive.jpg` (550×717), `passwordless-entry.jpg`, `server-search.jpg`, `recording-saved.jpg`. The 550px screenshots are responsive browser evidence, not actual-phone evidence.

Before local migrations, the API was stopped and local embedded database backup was saved privately under `.data/backups/before-passwordless-capture-20261021.tar.gz`. Migrations 0002 (OTP/contact verification) and 0003 (search indexes) ran locally. The recording test uses fictional audio and the existing demo account only.

Not verified: real Gatekeeper delivery or key validity, real OpenAI transcription, microphone capture, actual iPhone/Android hardware, trusted phone HTTPS certificate, external PostgreSQL, multi-replica safety, deployment. Transcription has an adapter and tests but stays Coming soon until OPENAI_API_KEY is configured. Capture storage/transcription is single-process filesystem-backed with bounded synchronous provider requests, not a distributed job queue. Optional PIN, verified phone linking to an existing email account, AI extraction and transcript import remain pending. See [phone testing](../PHONE-TESTING.md).

## Superseding audio-retention correction — C20

Earlier saved-recording checks and screenshots describe an implementation rejected by Edward and are historical evidence only. Current API is `POST /v1/transcriptions` with request-scoped audio; saved-capture routes/store/capability are removed. Current UI has no file picker, audio save/history/playback, or persistent audio retries. Only transcript text is returned, edited, and optionally saved as a note. Record is Coming soon when no transcription provider is configured. The exact local synthetic recording and metadata were removed, no other audio existed, and `.data/captures` no longer exists. No live provider, microphone or actual phone was exercised for this correction.

Correction verification: 27 API tests plus 14 client tests (41 total), workspace typechecks, production build, formatting, docs link validation, and whitespace checks pass. Tests cover no-file success/failure/no-provider behavior, removed storage endpoints, byte-buffer cleanup, bounded concurrent work, timeout, and real loopback client-disconnect cancellation with provider abort. UI screenshots: `design/evidence/home-transcription-only-desktop.jpg` (1280px) and `home-transcription-only-responsive.jpg` (550px). The compiled local app confirms Record is disabled with Coming soon when no provider is configured. Only injected providers were tested; no live microphone/provider/phone claim is made.

## Appearance icon simplification

Replaced the Light/Dark/System dropdown with an accessible sun/moon button on Home and sign-in. Defaults still follow the OS until the user chooses; explicit light/dark preference persists locally. Browser verified dark → light → reload (light remained) → dark. Desktop/responsive screenshots: `design/evidence/theme-icon-desktop.jpg`, `theme-icon-light-responsive.jpg`, `theme-icon-dark-responsive.jpg`. Production web build including TypeScript passed. No new automated tests were added for this small reversible UI change.

## Configurable audio and branded email — 21 October 2026

Owner confirmed receipt of the previously requested email and SMS OTPs. This confirms delivery for those tests; the new branded HTML template was previewed locally with an obviously synthetic code, not resent. Transport regression checks HTML branding, text fallback, no remote/tracking assets, and no markup injection through the code. Preview source: `design/email/otp-preview.html`. Screenshots: `otp-email-branded-desktop.jpg` and `otp-email-branded-preview.jpg` under design/evidence. Sender identity remains the Gatekeeper account configuration; the application changes subject/body.

52 tests pass (36 API + 16 client), workspace typechecks, production build, format check and docs link validation pass. Independent review checked owner isolation, AES-GCM credentials, HTTPS-only new keys, no browser key persistence, pipe-only FFmpeg, and the fixed provider-switch privacy race. Provider snapshot is mandatory when resolving account settings. Cloud connection tests check authentication, not paid transcription quota.

Real local smoke: existing installed public JFK speech fixture was read into memory, decoded through FFmpeg pipes, and transcribed by loopback whisper-server with the installed English base model. Expected public-speech terms matched; no transcript was logged. A second smoke through Ordo's real API composition returned200 with default local provider/configuredtrue and zero notes automatically saved. No recorded audio was written. Whisper native logs are suppressed, --convert is not enabled, and .data/captures remains absent.

Browser: Settings opened from sidebar; Local Whisper reported ready; Test connection passed; saving local preference succeeded; OpenAI option displayed own-key entry and estimated0.003USD/minute (~0.18USD/hour) with official pricing link. No real cloud key was entered. Recording dialog displayed its fixed local destination without requesting microphone access. Screenshot files: `audio-settings-desktop.jpg`, `audio-settings-local-responsive.jpg`, `audio-settings-online-responsive.jpg`, `voice-local-ready.jpg`. New model preferences were added by local migration0004 after private database backup `.data/backups/before-audio-settings-20261021.tar.gz`.

Not verified: actual microphone/browser recording, physical devices, trusted phone HTTPS, real online transcription/key billing, or Gmail/Outlook rendering/delivery of the new HTML email. Local Whisper runs on the Mac/server, not the phone. Native phone on-device inference remains Coming soon. No merge/deployment occurred.

## Capture actions scoped to My Day

The full quick-capture card row and optional voice onboarding hint now render only on My Day. Browser verified My Day retains the row, while Inbox, Upcoming, workspace and project views omit it. Task lists keep Add a task; Notes keeps New note. Web production build passed after this change. Screenshots: `design/evidence/inbox-contextual-actions.jpg` and `design/evidence/project-contextual-actions.jpg`.

## Everyday views, task times and people — 21 October 2026

Branch `edw/ordo-everyday-views`. Automated: typecheck (all workspaces), 64 tests (API 37, web 11, client 16), format check, documentation build and link check, and a production web build in an isolated worktree all pass.

Signed-in browser checks used a fictional account on an isolated stack (scratch API with migration 0005 applied to a fresh embedded database, production web build). My Day shows the first-name greeting, date, summary and five count chips. A task created from the My Day composer landed on Today. Setting Waiting, a due time, a follow-up date and time, and padded names saved and came back trimmed; the past due time moved the task into Due now. Clearing the due date cleared its time on the server and disabled the time field. Inbox, Upcoming (seven grouped days) and Waiting On (who, follow-up, responsible) render distinctly in light, dark and 375px mobile. Screenshots: `design/evidence/everyday-views/`.

Not verified: migration 0005 against the existing `.data/ordo` database used by the running local servers (they were started by another tool and were not restarted; migration was tested by the API specialist on a database with 0001–0004 applied), physical phones, and screen-reader output. Reminders are in-app surfacing only; no notifications.

## Hosted Ordo on Cloudflare — 29 October 2026

Worker `ordo` at `https://ordo.edward-dejaysblog.workers.dev`, deployed from `main` at `fe2fb83`. The deploy gate passed: typecheck, 130 tests (API 76, web 28, client 26) and build. The live version is bound to D1 `fa30bd33-275d-4120-8d0e-a6a50887687d` (checked with `wrangler versions view`), Workers AI, assets, and the variables `ORDO_ENV=production`, `ORDO_WORKERS_AI=on` and `TRUSTED_ORIGINS`.

Signed-out checks after `OTP_HMAC_KEY` was set:

| Request | Result |
|---|---|
| `/` | 200, web app |
| `/api/health` | 200 `{"status":"ok"}` |
| `/api/auth/me` | 401 (configuration loaded, route exists) |
| `/api/capabilities` | 200; Workers AI transcription available; code delivery (email, SMS) unavailable and credential storage off, as expected until the remaining secrets are set |

Before `OTP_HMAC_KEY` was set, every `/api` route, including `/api/health`, answered 500 (configuration), while `/` answered 200.

CPU time from `wrangler tail` on signed-out requests: `/api/health` median 0.5 ms, max 2 ms; `/api/auth/me` median 0.5 ms, max 1 ms; `/api/capabilities` median 0 ms, max 1 ms. All are well under the 10 ms Free-plan limit. Static pages are served from assets without running the Worker.

Not verified: sign-in and every signed-in journey (task, note, search, reload, transcription), and their CPU time. These need `GATEKEEPER_API_KEY` and `GATEKEEPER_API_URL`, which Edward sets himself, plus a real code to his own address.

## Hosted slice 1 — 29 October 2026

Live site `https://ordo.edward-dejaysblog.workers.dev`, Worker version `b503fb99-6a38-4bbd-bcbb-f23a18c7376d` (`main` at `72bcb37`). Release details are in the [delivery ledger](../PLAN.md#release-record).

**Sign-in (release 1 code, morning of 29 October).** Edward signed in himself with a real email code. The first attempts failed because the pasted `GATEKEEPER_API_URL` and `GATEKEEPER_API_KEY` values were not usable (`reason=network error=TypeError`, then `rejected status=401`); both were set again from his local values and the next code was accepted (202) and verified (200).

**Signed in, after the deploy** (agent driving Edward's existing session in the built-in browser; test items are named "Hosting check (delete me)"):

| Check | Result |
|---|---|
| Create workspace and two projects | Passed |
| Project tabs (Overview, Tasks, Notes, Conversations, Drafts) | Shown |
| Favourite a project | Star filled on the project and in the sidebar |
| Create a task, edit its title, move it to the other project | Passed; it left the first project and appears in the second |
| Complete the task | Passed; open count 0 |
| Rich note with a heading, checklist and bold text; tick an item in place | Rendered and saved |
| Reload, then search for a word in the note | Found, with the ticked item saved |
| Set name in Settings | Greeting reads "Good afternoon, Edward" after reload |
| Service worker | Registered and active; cache `ordo-shell-v1` holds no `/api` responses |
| Transcription (recording) | Not checked: needs a microphone |
| Email or transcript notes | Not checked |

**CPU per request** (`wrangler tail`, milliseconds; Free plan limit 10 ms, targets: reads under 3, writes and search under 5). Every request completed with outcome `ok`:

| Route | Requests | Median | Max |
|---|---|---|---|
| `GET /api/auth/me` | 3 | 3 | 6 |
| `GET /api/home` | 15 | 12 | 18 |
| `GET /api/settings/audio` | 4 | 7 | 53 (first request on a new isolate) |
| `GET /api/search` | 1 | 10 | 10 |
| `PATCH /api/auth/me` | 1 | 7 | 7 |
| `POST /api/workspaces` | 1 | 27 | 27 |
| `POST /api/projects` | 2 | 19.5 | 23 |
| `PATCH /api/projects/:id` | 1 | 13 | 13 |
| `POST /api/tasks` | 1 | 26 | 26 |
| `PATCH /api/tasks/:id` | 2 | 16.5 | 22 |
| `POST /api/notes` | 1 | 21 | 21 |
| `PATCH /api/notes/:id` | 2 | 14 | 14 |
| `POST /api/auth/otp/request` (release 1 code) | 1 accepted | 35 | 35 |
| `POST /api/auth/otp/verify` (release 1 code) | 1 | 19 | 19 |

Most signed-in routes are over the 10 ms limit and well over target. Cloudflare let every request finish in this light use, but heavier use risks `Exceeded CPU` errors. This goes to the API specialist with these numbers. Static pages do not run the Worker.

## Hosted AI capture and the CPU fix — 29 October 2026

Live site `https://ordo.edward-dejaysblog.workers.dev`, Worker version `e870f486-f40c-4a24-9127-ce617d4b7767` (`main` at `25a51fe`). Release details are in the [delivery ledger](../PLAN.md#release-record).

**Signed in** (agent driving Edward's existing session in the built-in browser; test items sit in the "Hosting check (delete me)" workspace):

| Check | Result |
|---|---|
| AI Capture on My Day | Enabled ("Turn a capture into tasks") |
| Paste a short fictional transcript, save it as a note in project Check A | Saved with source `transcript` |
| Process with AI (one real Workers AI run, Edward's OK) | Review in about 20 seconds: a summary, 1 task ("Send Check A budget draft", due Friday 30 October, responsible Ama), 1 follow-up (waiting on Lakeside, responsible Kofi), 1 email draft to Kofi |
| Review and save selected (draft left out) | "Created 2 tasks and 0 drafts, linked to this capture" |
| Provenance | Both tasks have `origin: capture` and `sourceNoteId` set to the transcript note; the follow-up has status `waiting` |
| Notes on `/home` | Previews only, no `body` field |
| Open a note | `GET /api/notes/:id` returns the full body |
| Tasks and notes: create, edit; search; reload | All 2xx, 10 rounds |
| Transcription (recording), email notes, sign-in again | Not checked. Sign-in was not repeated because it sends a real code; `otp/request` and `otp/verify` have release 1 numbers only |

**CPU per request** (`wrangler tail`, milliseconds; Free plan limit 10 ms). `tail` dropped some invocations, so counts are lower than the requests sent. Every logged request completed with outcome `ok`. The first request after the deploy (`GET /api/health`) used 6 ms; the first `/api/home` on a new isolate used 10–12 ms.

| Route | Release 2 median / max | Release 3 requests | Release 3 median | Release 3 max |
|---|---|---|---|---|
| `GET /api/auth/me` | 3 / 6 | 9 | 1 | 6 |
| `GET /api/home` | 12 / 18 | 15 | 7 | 14 |
| `GET /api/search` | 10 / 10 | 3 | 5 | 7 |
| `GET /api/notes/:id` | — | 6 | 4 | 4 |
| `GET /api/settings/audio` | 7 / 53 | 2 | 3 | 3 |
| `GET /api/settings/ai` | — | 2 | 8 | 9 |
| `POST /api/tasks` | 26 / 26 | 6 | 8.5 | 13 |
| `PATCH /api/tasks/:id` | 16.5 / 22 | 8 | 7.5 | 14 |
| `POST /api/notes` | 21 / 21 | 5 | 8 | 9 |
| `PATCH /api/notes/:id` | 14 / 14 | 5 | 9 | 11 |
| `POST /api/notes/:id/process` | — | 1 | 19 | 19 |
| `POST /api/capture-runs/:id/save` | — | 1 | 31 | 31 |
| `POST /api/auth/otp/request` | 35 (release 1) | not measured | — | — |
| `POST /api/auth/otp/verify` | 19 (release 1) | not measured | — | — |

The fix roughly halves CPU: medians for reads and everyday writes are now under 10 ms, though maximums still reach 11–14 ms. Processing a capture (19 ms) and saving one (31 ms) are over the limit, and sign-in was 19–35 ms when last measured. These go back to the API specialist.


## Hosted releases 4 to 7 — 29 and 30 October 2026

Live site `https://ordo.edward-dejaysblog.workers.dev`. Release 4 `addc7803` (`4f335a9`), release 5 `4bc6d83c` (`383f855`), release 6 `9619cfa7` (`acc50d4`), release 7 `ed559d40` (`4c9210c`). Release details are in the [delivery ledger](../PLAN.md#release-record).

**Sign-in** (release 5; Edward signed out and in again himself with a real email code):

| Step | CPU | Wall time | Release 1 CPU |
|---|---|---|---|
| `POST /api/auth/otp/request` | 9 ms | 4.2 s (sending the email) | 35 ms |
| `POST /api/auth/otp/verify` (correct code) | 10 ms | 133 ms | 19 ms |
| `POST /api/auth/otp/verify` (wrong code first) | 7 ms, 401 | 126 ms | — |

**AI capture of the weekly-sync fixture** (`apps/api/test/fixtures/weekly-sync.txt`, saved as a transcript note in "Hosting check (delete me)", one real Workers AI run per release, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; "today" was 29 October for release 5 and 30 October for releases 6 and 7):

| Rule | Release 5 | Release 6 | Release 7 |
|---|---|---|---|
| No "me" as the responsible person | Held: only Kofi named | Held | Held |
| No invented time (23:59) | Held: no times set | Held | Held |
| "Book a review meeting … the 14th at 10am" | Failed: no date, no time | 2026-11-14 10:00 | 2026-11-14 10:00 |
| "Follow up on Monday" | Due 2 November, no follow-up date | Follow-up 2 November | Follow-up 2 November |
| Weekdays ("by Friday", "by Wednesday", "today") | Correct | Correct | Correct |
| Email draft to the design agency | Thanks and asks, but greets "Hi the design agency" | Greeting fixed, but the body offers the files ("please find attached") | Thanks them and asks for the final logo files; nothing attached |
| Save with provenance | 5 tasks and 1 draft, `origin: capture`, `sourceNoteId` set | Saved | Saved, `origin: capture`, `sourceNoteId` set |

**MCP without a key**: `POST /api/mcp` returns 401 with `initialize`, `server/discover`, `tools/list` and a made-up key; `GET` returns 401 too, because the key check comes first (405 needs a valid key). The assistant flow with Edward's own key (By agent, Activity, a repeated create returning the existing workspace) was not checked here.

**CPU per request** (`wrangler tail`, milliseconds; Free plan limit 10 ms; median, max in brackets, then requests logged). `tail` dropped some invocations, so counts are lower than the requests sent. Every logged request completed with outcome `ok`.

| Route | Release 3 | Release 5 | Release 6 | Release 7 |
|---|---|---|---|---|
| `GET /api/auth/me` | 1 (6), 9 | 2.5 (6), 10 | 5.5 (7), 2 | 7 (10), 3 |
| `GET /api/home` | 7 (14), 15 | 5 (6), 6 | 4.5 (5), 4 | 7 (10), 7 |
| `GET /api/search` | 5 (7), 3 | 2 (4), 8 | 2 (2), 2 | 4 (5), 5 |
| `GET /api/notes/:id` | 4 (4), 6 | 2.5 (3), 4 | 2 (5), 4 | 4 (5), 5 |
| `POST /api/tasks` | 8.5 (13), 6 | 6 (15), 8 | 5 (9), 3 | 10 (15), 11 |
| `PATCH /api/tasks/:id` | 7.5 (14), 8 | 6.5 (8), 4 | 6 (7), 3 | 9 (14), 9 |
| `DELETE /api/tasks/:id` (archive) | — | — | — | 7 (12), 13 |
| `POST /api/notes` | 8 (9), 5 | 5 (9), 9 | 4 (4), 5 | 7 (7), 3 |
| `PATCH /api/notes/:id` | 9 (11), 5 | 7 (13), 7 | — | — |
| `POST /api/notes/:id/process` | 19, 1 | 8, 1 | 8, 1 | 15, 1 |
| `POST /api/capture-runs/:id/save` | 31, 1 | 11, 1 | 7, 1 | 9, 1 |
| `GET /api/settings/agent-tokens` | — | 7 (11), 2 | — | — |
| `POST /api/mcp` (no key, 401) | — | 0–6 | 2 | 1 (3), 4 |

The first `/api/home` after the release 5 deploy used 20 ms; the first request after the release 6 and 7 deploys (`GET /api/health`) used 2 and 9 ms. Processing and saving a capture are now within or near the limit (release 3: 19 and 31 ms). Release 7's medians for task writes (9–10 ms) and processing (15 ms, one run) are higher than release 6's, although release 7 changed only the AI prompt, MCP list hints and docs; the samples are small and taken at different times, so this is recorded rather than explained. Task creates still reach 15 ms at their maximum.

Cleanup: all test tasks, notes and drafts from releases 3 to 7 in "Hosting check (delete me)" were archived through the app (the workspace holds no live items). Projects Check A and Check B and the workspace itself remain for Edward to delete.
