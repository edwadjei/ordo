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
