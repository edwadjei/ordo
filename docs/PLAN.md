# Ordo — delivery ledger

**Updated:** 21 October 2026.

**Current milestone:** Persistent responsive web foundation verified locally; shared native mobile next.

**Application status:** Working locally; baseline pushed on `edw/ordo-web-foundation`, not merged or deployed.

## Milestones

| ID | Deliverable | State | Exit evidence |
|---|---|---|---|
| D0 | Import briefs, document workflow, create local documentation site | Verified locally | Identical source copies; documentation generation/link checks pass; checkpoint pushed |
| F0 | Responsive web/API foundation, local database/auth, CI | Verified locally | Fresh install, format, typechecks, 16 tests, production build, and docs checks pass; no hosted CI/deployment claim |
| W1 | Responsive web everyday core | Working baseline; remaining acceptance work | [Everyday core acceptance scenarios](specs/01-everyday-core.md#acceptance-scenarios) verified without AI keys, including phone-browser touch workflows and durable capture |
| I2 | Shared iOS/Android mobile app — iOS urgent and prioritized | Priority confirmed; implementation pending | Native installation and authenticated task/note workflows against the same API; device, offline, lifecycle, and accessibility evidence |
| D3 | macOS app — after iOS | Priority confirmed; implementation pending | Packaged Mac app with verified authentication, supported core workflows, permissions, and release/distribution evidence |
| A | Intelligent capture and review | Proposed feature stream | Durable source → validated suggestions → edited selected commit; provider policy, provenance, permissions, and failure checks on each supported client |
| G | Agent access | Proposed feature stream | Scoped MCP actions visible in clients; revoked access rejected; audit/provenance verified |

Edward's latest platform order is **responsive web → native iOS (urgent) → macOS**. It supersedes the earlier PWA-first mobile plan and the original briefs' platform sequencing. AI and MCP are feature streams, not prerequisites for starting iOS. Their scope per platform release will be recorded in specialist briefs; the complete product still requires reviewed capture, source provenance, and authorized agent access. Android is included through shared mobile delivery with iOS priority; its release timing is undecided and must not delay iOS. PWA installability is outside the current delivery sequence. No delivery date has been agreed.

## Mobile release gates

Responsive phone-browser behavior is verified in W1; native app behavior is verified in I2. Native iOS delivery requires its own evidence. The proposed React Native/Expo app also targets Android, which needs separate device, permission, lifecycle, and sync verification; Android failures do not prevent an otherwise approved iOS release:

- Select the iOS framework and distribution method before implementation. Verify installation, authentication, session revocation/sign-out, and upgrade behavior on stated iPhone/OS versions; simulator results alone are not device verification.
- Add/edit/complete tasks, autosave notes, switch workspaces/projects, and search through touch-friendly native screens. Verify AI review when that feature stream is integrated; it does not block the first native core delivery.
- When recording is integrated, verify microphone permission denial, upload failure, interruption, and app lifecycle recovery. Document actual background-recording limits.
- When imports are integrated, verify native file selection and supported transcript types; do not require desktop drag-and-drop on a phone.
- Retain queued text across offline reload and synchronize once after reconnect; expose conflicts and storage failures accurately.
- Check narrow screens, accessible control labels/targets, safe-area/keyboard behavior, and truthful save state. Record actual device/OS/browser versions and unverified cases.

## D0 — documentation foundation

- Preserve both supplied documents verbatim as `docs/PRODUCT.md` and `docs/TECHNICAL.md`.
- Keep the existing Ordo name, tagline, and development principle.
- Add a reading map, proposed approach, first-slice scope, delivery method, decisions, and restart notes.
- Provide proposed agent rules for review rather than directly adopting another project's policy.
- Generate a local browsable site from the Markdown; do not commit generated output.
- Record actual verification and unresolved decisions below before handoff.

## Proposed next work

| Order | Work | Dependency | Owner area |
|---|---|---|---|
| 1 | Review first slice and resolve runtime/auth/Inbox/branch decisions | Owner review | Coordinator + Edward |
| 2 | Prepare coordinator task sequence, specialist briefs, and UI preview | Scope/design choices settled | Coordinator + web |
| 3 | Establish runnable foundation and contracts | Concrete foundation brief | Foundation/API |
| 4 | Implement task create/reload/edit/complete flow | Authorized persistent foundation | API then web |
| 5 | Extend to projects, subtasks, notes, daily views, search | First complete task flow | API + web |
| 6 | Add durable offline text capture and reconcile failures | Stable write/revision contracts | Web + API |
| 7 | Independently review, verify, and propose PR integration | Acceptance evidence | Reviewer + coordinator |

These rows are sequencing guidance for coordinated-development. The coordinator turns settled scope/design decisions into specialist briefs; no separate Superpowers plan-approval stage applies. API and web specialists implemented the authorized foundation; review findings were corrected. Follow-up restructuring and integration verification are active.

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

No hosted releases, deployments, backups, or rollback images exist. Database schema initialization/migrations have run locally only. Feature checkpoints `7c3715a` (docs) and `8e5b837` (persistent web foundation) are pushed on `edw/ordo-web-foundation`. Add a release entry only after an approved integration/deploy, with revision, checks, migration backup if relevant, rollback point, and post-deploy evidence.

## Remaining web acceptance work

Cold offline app reload is not supported without an offline shell; queued task creation is durable, while notes/edits require the API. Full sync cursors/conflict resolution, project favorites, destination editing UI, people fields, pagination, and production authentication/abuse-control hardening remain incomplete. Dark mode and server-side full-text search are implemented. Record explicit device/browser and performance results before claiming those acceptance scenarios. Native mobile, transcript imports, AI review, MCP, and Mac remain separate work. Web recording-to-transcription uses temporary memory only; audio/files are not stored; live provider and physical-phone testing remain unverified.

## API structure follow-up

DAMSYN-style platform/capabilities/adapters/domains structure is implemented, documented, and independently reviewed. All 26 routes remain intact; 12 API tests (including 4 architecture checks) and 8 client tests pass. White/orange UI and keyboard capture are verified in the compiled app. After restarting the modular API, the existing session/data loaded and a new task write succeeded. See [verification evidence](coordination/VERIFICATION.md) and [API architecture](API-ARCHITECTURE.md). No merge/deploy approval is implied.

## Passwordless/search/audio follow-up

Implemented locally on `edw/ordo-passwordless-capture`: six-digit email/Ghana-phone OTP, contact verification, server full-text search, web recording-to-transcription without audio/file storage, and Coming soon labels for unavailable functionality. 39 automated tests and production build pass; see the verification record for browser screenshots and remaining live-provider/device gaps. A phone HTTPS proxy and actual-device checklist are prepared. Email-first onboarding with later verified phone linking is recommended; phone linking remains pending.
