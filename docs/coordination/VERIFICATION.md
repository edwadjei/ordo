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
