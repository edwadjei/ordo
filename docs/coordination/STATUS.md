# Ordo coordinator handoff

**Updated:** 27 October 2026.

**Owner and commit identity:** Edward Adjei, `edwadjei <edd.net49@gmail.com>`. No AI attribution in commits or PR descriptions.

**Repository:** `git@github.com:edwadjei/ordo.git`, local clone `/Users/edwadjei/projects/ordo`.

**Main:** `e96df57` (#13 on Edward's word, 29 October 2026). Rollback point for the last merge: `ff4a567`.

## Current work

| Order | Work | State |
|---|---|---|
| 1 | Hosting documentation on `edw/ordo-cloudflare-platform-docs`: [technical architecture](../TECHNICAL.md), [Cloudflare platform spec](../specs/02-cloudflare-platform.md), [Phase 1 brief](CLOUDFLARE-PHASE-1-BRIEF.md), decisions, plan, and guides | In progress; PR to `main` for Edward's review |
| 2 | Cloudflare Phase 1: Hono port, Web Crypto adapters, web static export (about five PRs) | Ready to brief once the docs PR is merged |
| 3 | Cloudflare Phase 2: D1 | Briefed after Phase 1 merges |
| 4 | Cloudflare Phase 3: hosted staging | Needs Edward's approval for account access and each deploy |

Edward chose Cloudflare Workers (Free plan) with D1 on 27 October 2026 ("aligned"; "I don't want to pay $5"); see C25–C27 in the [decision register](DECISIONS.md).

**Implementation status:** the API runs as a Cloudflare Worker on a local D1 database under `wrangler dev`, with code-only sign-in, check-on-save and FTS5 search (Phase 2, pending merge). The web app runs on Next.js dev proxying `/api` and builds as a static export the Worker serves. Nothing is deployed; hosted staging is Phase 3.

## Specialist sessions

Each specialist is its own Claude session, runs on Opus 5.5 at medium effort, and reports to the coordinator session. Edward approves every merge and deploy.

| # | Session | Owns |
|---|---|---|
| 1 | Ordo Web specialist | `apps/web`, `packages/client` |
| 2 | Ordo API specialist | `apps/api`, `packages/core`, `packages/db` |
| 3 | Ordo Cloudflare specialist | Worker configuration, D1 environments, secrets, deploys and the hosting runbook |

## Work areas

| Area | State |
|---|---|
| Coordination/docs | Cloudflare architecture, spec, and Phase 1 brief written; awaiting review |
| API/domain/database | Phase 1 (Hono, Web Crypto) merged; Phase 2 (D1, code-only sign-in, check-on-save, FTS5, Worker) in review; hosted staging (Phase 3) next |
| Responsive web/client | Everyday views, task times and people, search, OTP sign-in, memory-only transcription, light/dark merged; static export (Phase 1) next |
| Mobile iOS/Android | Not implemented; Expo direction selected, iOS urgent; starts against the hosted API after Phase 3 |
| macOS | Not implemented; follows priority mobile delivery |
| AI/worker/MCP | Not implemented; Cloudflare Queues/cron when AI workers arrive |

## Staffing

All specialist agents run on **Opus 5.5 at medium effort** under coordinated-development.

| Specialist | Owns | Brief |
|---|---|---|
| Backend | `apps/api`, `packages/core`, `packages/db` | [Phase 1 brief](CLOUDFLARE-PHASE-1-BRIEF.md#backend-specialist) |
| Web | `apps/web`, `packages/client` | [Phase 1 brief](CLOUDFLARE-PHASE-1-BRIEF.md#web-specialist) |
| Documentation | `docs/` and workspace READMEs, Markdown only | This handoff |

The coordinator owns root tooling, docs, and integration evidence, checks every PR (base, mergeable, attribution, secrets, scope), and merges only on Edward's word for that PR.

## Environments

| Environment | State | Release / rollback |
|---|---|---|
| Local (`npm run dev`) | Worker on `wrangler dev` at `http://127.0.0.1:8788` with a local D1 database under `apps/api/.wrangler`; Next.js dev at `http://127.0.0.1:3358` proxying `/api` | Local only. The old embedded database in `.data/ordo` is kept but will not be imported (Edward, 29 October 2026: start fresh) |
| Staging (Cloudflare Worker + D1) | Not provisioned; Phase 3 | None |
| Production | Not provisioned | None |

No Cloudflare account access, Worker, D1 database, secret, DNS record, or hosted CI run exists for Ordo. Specialists verify on separate ports with fictional data and never touch `.data`. Keep `.data`, `apps/api/.dev.vars` and private `.env` values out of Git.

The documentation site is generated into `docs/html`; a preview may run on port 4317. The static prototype is `design/home-preview.html` (port 4319 when its preview runs); do not confuse it with the working app on 3318.

## Resume here

1. Inspect Git status and log; preserve uncommitted work. Use `edw/` branches from `main` and Edward's Git identity.
2. Read the [technical architecture](../TECHNICAL.md), the [Cloudflare platform spec](../specs/02-cloudflare-platform.md), and the [decision register](DECISIONS.md).
3. Once the docs PR is merged, start the backend and web specialists with the [Phase 1 brief](CLOUDFLARE-PHASE-1-BRIEF.md).
4. Check each specialist PR before putting it to Edward; record evidence in [verification](VERIFICATION.md) and the [delivery ledger](../PLAN.md).
5. Never merge or deploy without Edward's explicit word for that change.

## Waiting on Edward

- Review and approve the hosting documentation PR.
- Open questions in the [Cloudflare platform spec](../specs/02-cloudflare-platform.md#open-questions-for-edward): Workers AI Whisper, Queues on the Free plan, domain name, and native token details. None blocks Phase 1.
- Later, for Phase 3: Cloudflare account access and approval of each deploy.
- Still pending from earlier work: optional live branded-email test, real microphone and physical-phone checks.

## Policies in force

- **Audio (C20):** no stored audio or uploaded files. Record → transcribe in temporary memory → discard audio → save transcript text only on request.
- **Unavailable features** say Coming soon (C19).
- **PR evidence (C16):** every PR carries screenshots.
- **Shared data:** staging data, secrets, DNS, and account changes need Edward's direct approval.
