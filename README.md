# ordo.

From thought to done.

A simple, intelligent workspace for capturing thoughts, organizing projects, and getting things done.

Ordo is a personal workspace, starting with responsive web, then an urgent native iOS app, then macOS. Capture a thought, turn it into a task or note, and get back to work. AI helps when you choose it; everyday capture stays useful without it.

- Product: Ordo
- Desktop app: Ordo for Mac
- Web app: Ordo Web
- Mobile apps: Ordo for iOS and Android — shared React Native/Expo client, with iOS prioritized
- AI assistant: Ordo AI
- Agent integration: Ordo MCP

The design philosophy remains: Minimal. Fast. Intelligent.

And one rule for development: Ordo should never make organizing work feel like more work.

## Start here

- [Documentation index](docs/README.md) — what to read and where decisions live.
- [Product requirements](docs/PRODUCT.md) — supplied MVP brief, preserved verbatim.
- [Technical architecture](docs/TECHNICAL.md) — Ordo on Cloudflare Workers (Free plan) with D1.
- [Cloudflare platform spec](docs/specs/02-cloudflare-platform.md) — hosting design, free-plan budget, phases, and acceptance.
- [Implementation approach](docs/IMPLEMENTATION-APPROACH.md) — proposed boundaries, build order, and unresolved choices.
- [Delivery ledger](docs/PLAN.md) — what exists, what is next, and evidence for completion.
- [Engineering method](docs/engineering-method.md) — specs, written briefs, review, and owner approval.

## Run locally

Use Node.js 22.23.2 (`.nvmrc`), then run from this repository:

```bash
npm ci
npm run dev
```

Open [Ordo Web](http://127.0.0.1:3358). `npm run dev` applies local D1 migrations, then runs the Ordo Worker under `wrangler dev` (API and static export on `127.0.0.1:8788`, local D1 database) beside the Next.js dev server on 3358, which proxies `/api` to it. No Docker, Cloudflare account, or AI key is required. Sign in with any email address; locally the six-digit code is printed in the terminal. Load fictional examples only if you want them. The UI uses white backgrounds with distinct workspace colors, following Edward's design feedback.

See [local development](docs/LOCAL-DEVELOPMENT.md) for configuration, database behavior, and release limits, and [the API guide](apps/api/README.md) for endpoint contracts.

## Browse the documentation

```bash
npm run docs:check
open docs/html/index.html
```

Markdown is the source of truth. The generated site works without a server; rebuild after editing. The supplied product brief remains unchanged; owner decisions are recorded in the decision register.

## Current build

Ordo is designed to run as one Cloudflare Worker on the Workers Free plan ($0/month): the web app as static files, a Hono API under `/api`, and Cloudflare D1 for data. See the [technical architecture](docs/TECHNICAL.md).

**Implementation status:** the everyday web core is merged to `main` and works locally: code sign-in, owned workspaces/projects, tasks/subtasks with times and people, plain-text notes, daily views, search, and durable queued task capture. Ordo is hosted as one Cloudflare Worker, `ordo`, at https://ordo.edward-dejaysblog.workers.dev on the Workers Free plan, with the D1 database `ordo` (check-on-save writes, code-only sign-in, FTS5 search) and Workers AI Whisper transcription. Locally, `npm run dev` runs the same Worker under `wrangler dev` on a local D1 copy. Only Edward signs in on the hosted address for now. This is not the complete MVP or a production release.

| Area | Implementation |
|---|---|
| `apps/web` | Next.js / React responsive web client; static export served by the Worker (Phase 1) |
| `apps/api` | Authenticated domain API: Hono with Web Crypto adapters, running in Node today and in the Worker from Phase 2 |
| `packages/core` | Domain contracts and validation |
| `packages/db` | Drizzle `sqlite-core` schema and D1 migrations, plus the one-time import script for the old embedded database |
| `packages/client` | Typed API client and owner-bound task retry queue |
| `docs`, `design` | Requirements, decisions, delivery evidence, clickable Home preview |

Platform order: **responsive web → shared iOS/Android mobile app, with urgent iOS priority → macOS**. React Native + Expo + TypeScript is the mobile direction following Edward's “Yes build”; the mobile package and native authentication have not been implemented yet. Android readiness must not delay iOS. Web recording with transient transcription, server full-text search, and passwordless OTP are implemented locally. Audio/files are not stored by Ordo; only transcript text can be saved as a note. Live delivery and phone verification remain unverified; transcription uses Cloudflare Workers AI Whisper by default, or an account-owned OpenAI key chosen in Settings. AI extraction, transcript imports, MCP, and Mac packaging remain separate work.

```bash
npm run format:check
npm run typecheck
npm test
npm run build
npm run docs:check
```

Edward Adjei owns scope and approvals. A coordinator session coordinates the work. Merge and deployment approval is per change; see [coordination status](docs/coordination/STATUS.md).

Delivery follows coordinated-development exclusively: coordinator planning and written briefs, specialist PRs, coordinator checks, and Edward's approval for merges and deployments. Brainstorming is optional design support; Ordo does not use the Superpowers development approach.
