# Ordo — delivery ledger

**Updated:** 27 October 2026.

**Current milestone:** H1, the Cloudflare Phase 1 Hono port, after the hosting documentation PR. Native mobile follows hosted staging so the apps target a real API.

**Application status:** Working locally. `main` is at `e96df57` (latest merges: #11 D1 and the Worker, #12 Workers AI transcription, #13 sign-in code delivery on the Worker, each on Edward's word). Nothing is deployed and no hosted environment exists.

**Implementation status:** Ordo runs locally as one Cloudflare Worker under `wrangler dev` on a local D1 database (check-on-save writes, code-only sign-in, FTS5 search), serving the static web export; Workers AI Whisper transcribes by default and has been verified on Edward's Cloudflare account. Nothing is deployed; hosted staging is Phase 3.

## Milestones

| ID | Deliverable | State | Exit evidence |
|---|---|---|---|
| D0 | Import briefs, document workflow, create local documentation site | Verified locally | Identical source copies; documentation generation/link checks pass; checkpoint pushed |
| F0 | Responsive web/API foundation, local database/auth, CI | Verified locally | Fresh install, format, typechecks, 16 tests, production build, and docs checks pass; no hosted CI/deployment claim |
| W1 | Responsive web everyday core | Merged; remaining acceptance work | [Everyday core acceptance scenarios](specs/01-everyday-core.md#acceptance-scenarios) verified without AI keys, including phone-browser touch workflows and durable capture |
| H1 | Cloudflare Phase 1: Hono port, Web Crypto adapters, web static export | Delivered in one combined PR; [brief](coordination/CLOUDFLARE-PHASE-1-BRIEF.md) | About five PRs merged; no Fastify dependency; all checks and existing tests pass in Node on the embedded database; signed-in browser journeys pass on `npm run dev` and on the static export through same-origin `/api`; existing sessions, fingerprints, and saved keys still work |
| H2 | Cloudflare Phase 2: D1 | Proposed; briefed after H1 | SQLite schema applied by `wrangler d1 migrations apply --local`; FTS5 search; check-on-save and code-once sign-in pass concurrency tests on local D1; Worker runs under `wrangler dev`; local data import matches row counts; local-dev docs work on a fresh machine |
| H3 | Cloudflare Phase 3: hosted staging | Proposed; needs Edward's approval for account access and each deploy | Worker and D1 on Edward's account; D1 restore point and rollback point recorded below; signed-in staging checks (sign-in, task create/edit/complete, note, search, reload); observed CPU per request and daily request/row counts recorded against the free-plan budget |
| I2 | Shared iOS/Android mobile app — iOS urgent and prioritized | Priority confirmed; implementation pending | Native installation and token-authenticated task/note workflows against the hosted Worker; device, offline, lifecycle, and accessibility evidence |
| D3 | macOS app — after iOS | Priority confirmed; implementation pending | Packaged Mac app with verified authentication, supported core workflows, permissions, and release/distribution evidence |
| A | Intelligent capture and review | Proposed feature stream | Durable source → validated suggestions → edited selected commit; provider policy, provenance, permissions, and failure checks on each supported client |
| G | Agent access | Proposed feature stream | Scoped MCP actions visible in clients; revoked access rejected; audit/provenance verified |

Edward's platform order is **responsive web → native iOS (urgent) → macOS**. Hosting (H1–H3) runs on Cloudflare Workers Free with D1 at $0/month; see the [Cloudflare platform spec](specs/02-cloudflare-platform.md). AI and MCP are feature streams, not prerequisites for starting iOS. Their scope per platform release will be recorded in specialist briefs; the complete product still requires reviewed capture, source provenance, and authorized agent access. Android is included through shared mobile delivery with iOS priority; its release timing is undecided and must not delay iOS. PWA installability is outside the current delivery sequence. No delivery date has been agreed.

## Mobile release gates

Responsive phone-browser behavior is verified in W1; native app behavior is verified in I2. Native iOS delivery requires its own evidence. The proposed React Native/Expo app also targets Android, which needs separate device, permission, lifecycle, and sync verification; Android failures do not prevent an otherwise approved iOS release:

- Select the iOS framework and distribution method before implementation. Verify installation, authentication, session revocation/sign-out, and upgrade behavior on stated iPhone/OS versions; simulator results alone are not device verification.
- Add/edit/complete tasks, autosave notes, switch workspaces/projects, and search through touch-friendly native screens. Verify AI review when that feature stream is integrated; it does not block the first native core delivery.
- When recording is integrated, verify microphone permission denial, upload failure, interruption, and app lifecycle recovery. Document actual background-recording limits.
- When imports are integrated, verify native file selection and supported transcript types; do not require desktop drag-and-drop on a phone.
- Retain queued text across offline reload and synchronize once after reconnect; expose conflicts and storage failures accurately.
- Check narrow screens, accessible control labels/targets, safe-area/keyboard behavior, and truthful save state. Record actual device/OS/browser versions and unverified cases.

## D0 — documentation foundation

- Preserve the supplied product brief verbatim as `docs/PRODUCT.md`; maintain `docs/TECHNICAL.md` as Ordo's technical architecture.
- Keep the existing Ordo name, tagline, and development principle.
- Add a reading map, proposed approach, first-slice scope, delivery method, decisions, and restart notes.
- Provide proposed agent rules for review rather than directly adopting another project's policy.
- Generate a local browsable site from the Markdown; do not commit generated output.
- Record actual verification and unresolved decisions below before handoff.

## Next work

| Order | Work | Dependency | Owner area |
|---|---|---|---|
| 1 | Hosting documentation PR (this architecture, spec, brief, decisions) | Edward's review | Coordinator |
| 2 | H1 backend PRs 1–3: Web Crypto adapters, framework-neutral HTTP layer, Hono app and test shim, Fastify removed | Delivered in the combined Phase 1 PR | Backend specialist |
| 3 | H1 web PRs 4–5: static export with same-origin `/api`, bookmark header plumbing | Docs PR merged; can run beside backend work | Web specialist |
| 4 | H2 brief and D1 work | H1 merged | Coordinator, then backend + web |
| 5 | H3 hosted staging | H2 merged; Edward approves account access and the deploy | Coordinator |
| 6 | Native mobile (I2) against the hosted API | H3 staging verified | Mobile specialist |

Specialists run on Opus 5.5 at medium effort under coordinated-development. Edward approves every merge and deploy.

## Verification record

Verified on 21 October 2026:

| Check | Result |
|---|---|
| Byte comparison against both supplied files | Both exact copies |
| Fresh dependency installation from lockfile and `npm run docs` | Passed; 11 pages generated |
| Generated HTML local link and fragment validation | Passed; 252 links across 11 pages |
| `node --check scripts/build-docs.mjs` | Passed |
| `git diff --check` and added-file whitespace inspection | Passed |
| Local docs browser review | Index rendered with branding, reading map, and navigation at the available narrow browser width |

Application baseline verification: fresh `npm ci`, `npm run format:check`, all workspace typechecks, 8 API integration tests, 8 client tests, `npm run build`, docs link checks, and diff whitespace passed before checkpoint `8e5b837`. Signed-in browser checks confirmed account creation, fixture loading, task create/reload/edit/subtask/complete, note saving, and command search. Native devices, p95 performance, standard external PostgreSQL, hosted CI, and deployed environments remain unverified. Re-run relevant checks after the active restructuring.

## Release record

No hosted releases, deployments, or hosted backups exist. Migrations have run on local D1 only. Recent merges to `main`, each on Edward's word: #9 Phase 1 → `180742d` (rollback `2bac518`); #11 D1 and the Worker → `97b0469` (rollback `0838aad`); #12 Workers AI transcription → `ff4a567` (rollback `97b0469`); #13 sign-in delivery fix → `e96df57` (rollback `ff4a567`). Add a release entry only after an approved integration/deploy, with revision, checks, D1 restore point if relevant, rollback point, and post-deploy evidence.

## Remaining web acceptance work

Cold offline app reload is not supported without an offline shell; queued task creation is durable, while notes/edits require the API. Full sync cursors/conflict resolution, project favorites, destination editing UI, people fields, pagination, and production authentication/abuse-control hardening remain incomplete. Dark mode and server-side full-text search are implemented. Record explicit device/browser and performance results before claiming those acceptance scenarios. Native mobile, transcript imports, AI review, MCP, and Mac remain separate work. Web recording-to-transcription uses temporary memory only; audio/files are not stored; live provider and physical-phone testing remain unverified.

## API structure follow-up

DAMSYN-style platform/capabilities/adapters/domains structure is implemented, documented, and independently reviewed. All 26 routes remain intact; 12 API tests (including 4 architecture checks) and 8 client tests pass. White/orange UI and keyboard capture are verified in the compiled app. After restarting the modular API, the existing session/data loaded and a new task write succeeded. See [verification evidence](coordination/VERIFICATION.md) and [API architecture](API-ARCHITECTURE.md). No merge/deploy approval is implied.

## Passwordless/search/audio follow-up

Implemented locally on `edw/ordo-passwordless-capture`: six-digit email/Ghana-phone OTP, contact verification, server full-text search, web recording-to-transcription without audio/file storage, and Coming soon labels for unavailable functionality. 39 automated tests and production build pass; see the verification record for browser screenshots and remaining live-provider/device gaps. A phone HTTPS proxy and actual-device checklist are prepared. Email-first onboarding with later verified phone linking is recommended; phone linking remains pending.

## Configurable voice and email branding

Per-account Settings now chooses Local Whisper (default, this Mac/server) or an account-owned OpenAI key, encrypted at rest. A connection test and optional setup hint are included; estimated hosted cost is shown. Local engine is running and real memory-only inference passed through the API. Provider snapshots prevent a stale tab switching local audio to the cloud. Branded OTP HTML/text templates are implemented and locally previewed; the owner confirmed earlier email and SMS delivery. 52 tests plus build/typechecks/format/docs pass. Native on-device, physical phone/microphone and trusted phone HTTPS remain unverified.
