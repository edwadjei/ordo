# Ordo coordinator handoff

**Updated:** 27 October 2026.

**Owner and commit identity:** Edward Adjei, `edwadjei <edd.net49@gmail.com>`. No AI attribution in commits or PR descriptions.

**Repository:** `git@github.com:edwadjei/ordo.git`, local clone `/Users/edwadjei/projects/ordo`.

**Main:** `aa9d62b` (PRs #1–#3 merged; #3 on Edward's word on 22 October 2026). Rollback point for the last merge: `e0dc0cc`.

## Current work

| Order | Work | State |
|---|---|---|
| 1 | Hosting documentation on `edw/ordo-cloudflare-platform-docs`: [technical architecture](../TECHNICAL.md), [Cloudflare platform spec](../specs/02-cloudflare-platform.md), [Phase 1 brief](CLOUDFLARE-PHASE-1-BRIEF.md), decisions, plan, and guides | In progress; PR to `main` for Edward's review |
| 2 | Cloudflare Phase 1: Hono port, Web Crypto adapters, web static export (about five PRs) | Ready to brief once the docs PR is merged |
| 3 | Cloudflare Phase 2: D1 | Briefed after Phase 1 merges |
| 4 | Cloudflare Phase 3: hosted staging | Needs Edward's approval for account access and each deploy |

Edward chose Cloudflare Workers (Free plan) with D1 on 27 October 2026 ("aligned"; "I don't want to pay $5"); see C25–C27 in the [decision register](DECISIONS.md).

**Implementation status:** the API runs on Hono with Web Crypto adapters in Node on embedded PostgreSQL (PGlite); the web app runs on the Next.js dev server with a `/api` proxy and builds as a static export. Nothing runs on Cloudflare yet; D1 and the Worker are Phase 2.

## Work areas

| Area | State |
|---|---|
| Coordination/docs | Cloudflare architecture, spec, and Phase 1 brief written; awaiting review |
| API/domain/database | Everyday core merged and verified locally; Phase 1 (Hono, Web Crypto) delivered on embedded PostgreSQL; D1 (Phase 2) next |
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
| Local | Web `http://127.0.0.1:3318`; API `http://127.0.0.1:4318`; embedded PostgreSQL in `.data/ordo` | Local build only; private local backups under `.data/backups` |
| Local D1 (`wrangler dev`) | Not built; Phase 2 | None |
| Staging (Cloudflare Worker + D1) | Not provisioned; Phase 3 | None |
| Production | Not provisioned | None |

No Cloudflare account access, Worker, D1 database, secret, DNS record, or hosted CI run exists for Ordo. The local servers on 3318/4318 were started by another tool and do not hot-reload; do not stop them unasked. Verify changes on a separate stack (for example ports 3328/4328 with their own `ORDO_DATA_DIR`). Keep `.data` and private `.env` values out of Git.

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
