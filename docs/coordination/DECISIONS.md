# Ordo decision register

**Updated:** 27 October 2026.

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
| C17 | Web dark mode is required now, alongside light and system appearance | Edward’s annotated dark-mode instruction, 21 October 2026 |
| C18 | Reuse Gatekeeper Pro key and API URL from Unwrap for Ordo authentication delivery; only those two settings copied into ignored local `.env` | Edward’s verification annotation, 21 October 2026; delivery integration and provider validation still pending |
| C19 | Implement email/phone OTP, server search, web recording, configurable transcription, and phone-test preparation; unavailable features must say Coming soon | Edward’s implementation request, 21 October 2026 |
| C20 | Do not store audio or uploaded files. Record, transcribe using temporary memory, discard audio, and save transcript text only when requested. Supersedes earlier audio persistence plans and C19 implementation details | Edward’s explicit audio-retention correction, 21 October 2026 |
| C21 | Use a simple sun/moon icon to toggle web light/dark mode instead of a dropdown | Edward’s appearance-control request, 21 October 2026 |
| C22 | Transcribe recordings with Cloudflare Workers AI Whisper (`@cf/openai/whisper-large-v3-turbo`) by default, free within the daily Workers AI allowance; an account-owned OpenAI key is an optional provider in Settings. Audio is never stored (C20) | Edward: "Workers AI Whisper", 28 October 2026 |
| C23 | OTP email needs proper Ordo branding. Owner confirmed both email and SMS arrived | Edward’s email-branding request and delivery confirmation, 21 October 2026 |
| C24 | The full capture-card row and optional voice setup hint belong only on My Day. Other views keep contextual task/note creation controls without repeating the capture dashboard | Edward’s My Day capture-actions request, 21 October 2026 |
| C25 | Ordo is hosted on **one Cloudflare Worker on the Workers Free plan ($0/month) with Cloudflare D1**. The Worker serves the web app as static assets and the API under `/api` on the same origin. API: Hono + Zod in the existing platform/capabilities/adapters/domains structure. Database: D1 with Drizzle `sqlite-core`, `wrangler d1` migrations, FTS5 search, check-on-save writes, D1 Sessions API bookmarks. Hosted sign-in is code-only. Workers Paid ($5/month) only if a limit is reached | Edward: “aligned” and “I don't want to pay $5”, 27 October 2026. Design: [technical architecture](../TECHNICAL.md) and [Cloudflare platform spec](../specs/02-cloudflare-platform.md) |
| C26 | Delivery in three phases: Phase 1 Hono port, Web Crypto adapters, and web static export, running locally in Node on the existing database; Phase 2 D1; Phase 3 hosted staging on Edward's Cloudflare account, with his approval for account access and each deploy | Edward’s approval of the Cloudflare plan (“aligned”), 27 October 2026 |
| C27 | Architecture, stack, and plan documents describe the Cloudflare design directly as Ordo's architecture | Edward: “Don't log a new direction. Rewrite everything, please.”, 27 October 2026 |

## Proposals and open choices

| ID | Choice | Recommendation / next action | State |
|---|---|---|---|
| P01 | Build sequence | Responsive web → native iOS (urgent) → macOS; AI/MCP feature scope is planned separately and does not block starting iOS | Platform priority confirmed in C09; detailed feature milestones proposed |
| P02 | Framework/ORM | Next.js static export + Hono + Zod + Drizzle `sqlite-core` on D1; Expo for iOS/Android; Tauri 2 for Mac | Decided (C25). Implemented locally (Phases 1–2); hosting is Phase 3 |
| P03 | Runtime and package manager | Node 22.23.2 and npm workspaces for development and tests; the Cloudflare Workers runtime for hosted Ordo; Web Crypto only in Worker code | Decided (C25) |
| P04 | Authentication | Code-only six-digit email/phone OTP through Gatekeeper (C18); codes hashed with HMAC-SHA256 and a Worker secret; no password login in hosted Ordo; legacy local password accounts convert at first code sign-in. Native token sign-in designed alongside the Hono port. Contact linking and optional PIN remain separate | Code-only hosted sign-in decided (C25). Email/phone OTP implemented locally; contact linking, optional PIN, and native tokens pending |
| P05 | Personal Inbox ownership | Define owner-bound unscoped records and explicit movement into workspace context | Open; schema blocker |
| P06 | Branch/environment policy | `dev` for integration/staging, `main` for production releases, `edw/` feature branches | Proposed; no branch/environment provisioning authorized by this entry |
| P07 | Hosting, storage, and deployment | One Cloudflare Worker (Free plan) with D1; no object storage; audio and files never stored (C20). $0/month; optional domain about $10/year. Staging is Phase 3 on Edward's Cloudflare account | Decided (C25, C26). No environment is provisioned yet; account access and each deploy need Edward's approval |
| P08 | Background work | Cloudflare Queues or cron triggers when AI workers arrive; no Redis or BullMQ | Decided (C25); confirm Queues availability on the Free plan when AI work starts |
| P09 | My Day and parent completion | Review behavior table in slice spec | Proposed |
| P10 | UI direction | Accepted Home layout with white/neutral surfaces; varied task/workspace colors. Native iOS design follows; Mac later | Web direction confirmed C12; platform details remain open |
| P11 | Task board tooling | Start with delivery ledger; choose dedicated board only if useful | Proposed |
| P12 | Desktop delivery/auth | Resolve packaged Mac assets and authentication in D3; preserve shared domain/API boundaries without blocking web/iOS | Deferred to Mac delivery |
| P13 | Dates and offline revisions | Date-only `YYYY-MM-DD` with separate `HH:MM` times; integer revisions with check-on-save; idempotency keys for retries. Sync cursor, sign-out behaviour for queued work, and conflict UI still to decide | Dates and revisions implemented; sync cursor and conflict UI open |
| P15 | Cloudflare open questions | Queues on the Free plan; custom domain or `*.workers.dev`; native token lifetime, refresh, and sign-out-everywhere | Open; listed in the [Cloudflare platform spec](../specs/02-cloudflare-platform.md#open-questions-for-edward) |
| P14 | Shared mobile framework and distribution | React Native + Expo + TypeScript for iOS/Android following C11; iOS leads design/testing/release, Android does not block it; distribution remains open | Mobile direction selected; native implementation pending |

## Notes on scope

Edward clarified the workflow in C07 and replaced C08 with the platform order in C09. C25 and C26 settle the stack, hosting, and delivery phases. They do not approve any deploy, account access, or shared-data change, which Edward approves one at a time. Branch policy for staging (P06) remains open.

C10 extends the mobile scope to Android without removing C09’s urgent iOS priority. The React Native/Expo recommendation was followed by Edward’s C11 instruction to build; native implementation is still pending. Android release timing is undecided.

Current working choices and allocation are recorded in [the active build plan](BUILD-PLAN.md). Merges to `main` happen only on Edward's word for each PR; no deployment has been approved or performed.
