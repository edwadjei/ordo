# Ordo decision register

**Updated:** 21 October 2026.

**Rule:** Proposed is not approved. Record the owner's words and date when a proposal becomes a decision.

## Confirmed facts and instructions

| ID | Fact or instruction | Source |
|---|---|---|
| C01 | Product name is Ordo; tagline is From thought to done | Existing repository README and Edward's kickoff |
| C02 | Edward Adjei owns the project and approvals | Current user context and explicitly invoked coordinated-development workflow |
| C03 | Start by copying the supplied briefs and adopting strong documentation habits | Edward's kickoff |
| C04 | Use coordinated development; no AI attribution in commits/PR descriptions; owner approves merges/deploys per change | Explicitly invoked skill |
| C05 | Repository is `edwadjei/ordo`; initial checkout contains README only and tracks `origin/main` | Local read-only inspection |
| C06 | No `dev` branch was present in the local/remote-tracking branch inventory at kickoff | Local branch inventory; remote branch state has not been independently queried |
| C07 | Coordinated-development is the sole delivery workflow. Brainstorming is optional design support; do not use the Superpowers development approach | Edward's explicit workflow correction, 21 October 2026 |
| C08 | Earlier mobile PWA-first decision — superseded by C09 | Edward's earlier mobile scope answer, 21 October 2026; retained as history only |
| C09 | Delivery priority: responsive web first, native iOS app urgently next, then macOS. Native iOS replaces PWA as the next mobile deliverable | Edward: “Web responsive is fine, then mobile app ios urgent then mac os”, 21 October 2026 |
| C10 | Include Android in mobile scope while retaining an iOS bias; React Native or a similar shared approach is invited | Edward: “We can build android too use react native or sth? But ios bias”, 21 October 2026 |
| C11 | Begin implementation following the shared React Native/Expo mobile recommendation, responsive web first; this is build authorization, not merge/deploy approval | Edward: “Yes build”, 21 October 2026 |

| C12 | Home layout direction accepted; use white backgrounds and neutral chrome so varied task/workspace colors remain clear, rather than a green theme | Edward’s design-preview feedback, 21 October 2026 |

| C13 | All commits use `edwadjei <edd.net49@gmail.com>`; feature branches use `edw/`; no AI attribution in commits or PR descriptions | Edward’s explicit attribution/branch instruction, 21 October 2026 |
| C14 | Structure API and concept documentation like the local DAMSYN API: platform, capabilities, adapters, domains | Edward’s API-structure request, 21 October 2026 |
| C15 | Include the supplied orange treatment as a restrained accent within the white design | Edward’s orange reference and request, 21 October 2026 |
| C16 | Every PR must include screenshots, especially UI PRs; `gh` CLI may be used | Edward’s explicit PR-evidence instruction, 21 October 2026 |

## Proposals and open choices

| ID | Choice | Recommendation / next action | State |
|---|---|---|---|
| P01 | Build sequence | Responsive web → native iOS (urgent) → macOS; AI/MCP feature scope is planned separately and does not block starting iOS | Platform priority confirmed in C09; detailed feature milestones proposed |
| P02 | Framework/ORM direction | Retain supplied Next.js + Fastify + PostgreSQL/Drizzle + Tauri direction; validate versions during planning | Proposed; do not substitute reference-project stacks automatically |
| P03 | Runtime and package manager | Select compatible runtime/package manager during foundation planning; docs currently use npm only | Open |
| P04 | Authentication | Choose secure web authentication with an explicit native-client API boundary; settle native iOS session/token handling for I2 | Open |
| P05 | Personal Inbox ownership | Define owner-bound unscoped records and explicit movement into workspace context | Open; schema blocker |
| P06 | Branch/environment policy | `dev` for integration/staging, `main` for production releases, `edw/` feature branches | Proposed; no branch/environment provisioning authorized by this entry |
| P07 | Hosting, region, storage, and deployment | Choose actual providers and record costs/data boundaries before provisioning | Open; no environments exist |
| P08 | Queue | Choose Postgres queue or BullMQ/Redis before AI workers; only one job backend | Open; not required for manual first task flow |
| P09 | My Day and parent completion | Review behavior table in slice spec | Proposed |
| P10 | UI direction | Accepted Home layout with white/neutral surfaces; varied task/workspace colors. Native iOS design follows; Mac later | Web direction confirmed C12; platform details remain open |
| P11 | Task board tooling | Start with delivery ledger; choose dedicated board only if useful | Proposed |
| P12 | Desktop delivery/auth | Resolve packaged Mac assets and authentication in D3; preserve shared domain/API boundaries without blocking web/iOS | Deferred to Mac delivery |
| P13 | Dates and offline revisions | Decide date-only values, cursor/revision model, retries, sign-out, and conflict behavior | Open; before date/sync implementation |
| P14 | Shared mobile framework and distribution | React Native + Expo + TypeScript for iOS/Android following C11; iOS leads design/testing/release, Android does not block it; distribution remains open | Mobile direction selected; native implementation pending |

## Changes after kickoff

Edward clarified the workflow in C07 and replaced C08 with the platform order in C09. These decisions do not approve the remaining app design, branch policy, framework choices, or infrastructure. The documentation tooling choice is local to this documentation task and does not settle the application package manager or runtime.

C10 extends the mobile scope to Android without removing C09’s urgent iOS priority. The React Native/Expo recommendation was followed by Edward’s C11 instruction to build; native implementation is still pending. Android release timing is undecided.

Local foundation choices and authorization boundaries are recorded in [the active build plan](BUILD-PLAN.md). No merge or deployment approval has been given.
