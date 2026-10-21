# Ordo — delivery ledger

**Updated:** 21 October 2026.  
**Current milestone:** Documentation foundation.  
**Application status:** Not implemented.

## Milestones

| ID | Deliverable | State | Exit evidence |
|---|---|---|---|
| D0 | Import briefs, document workflow, create local documentation site | Verified locally | Identical source copies; 11 pages built; 252 links checked; owner review pending |
| F0 | Responsive web/API foundation, local database/auth, CI | Proposed | Scope/design decisions recorded; concrete specialist briefs; runnable setup; successful automated checks; phone-browser test matrix recorded |
| W1 | Responsive web everyday core | Proposed | [Everyday core acceptance scenarios](specs/01-everyday-core.md#acceptance-scenarios) verified without AI keys, including phone-browser touch workflows and durable capture |
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

These rows are sequencing guidance for coordinated-development. The coordinator turns settled scope/design decisions into specialist briefs; no separate Superpowers plan-approval stage applies. No specialists have been started or assigned implementation authorization.

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

No application tests, builds, migrations, signed-in journeys, or Mac/mobile performance measurements exist yet. D0 completion means locally verified documentation, not merge approval.

## Release record

No releases, deployments, database migrations, backups, or rollback images exist. Add a release entry only after an approved integration/deploy, with revision, checks, migration backup if relevant, rollback point, and post-deploy evidence.
