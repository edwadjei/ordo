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
- [Technical architecture](docs/TECHNICAL.md) — supplied architecture brief, preserved verbatim.
- [Implementation approach](docs/IMPLEMENTATION-APPROACH.md) — proposed boundaries, build order, and unresolved choices.
- [Delivery ledger](docs/PLAN.md) — what exists, what is next, and evidence for completion.
- [Engineering method](docs/engineering-method.md) — specs, written briefs, review, and owner approval.

## Run locally

Use Node.js 22.23.2 (`.nvmrc`), then run from this repository:

```bash
npm ci
npm run dev
```

Open [Ordo Web](http://127.0.0.1:3318). No Docker or AI key is required. The API uses embedded PostgreSQL for local development and persists accounts/content in `.data/ordo`. Create a local account; load fictional examples only if you want them. The UI uses white backgrounds with distinct workspace colors, following Edward's design feedback.

See [local development](docs/LOCAL-DEVELOPMENT.md) for configuration, database behavior, and release limits, and [the API guide](apps/api/README.md) for endpoint contracts.

## Browse the documentation

```bash
npm run docs:check
open docs/html/index.html
```

Markdown is the source of truth. The generated site works without a server; rebuild after editing. Both supplied briefs remain unchanged, with later owner decisions recorded separately.

## Current build

The first responsive web foundation is being integrated locally: account sessions, owned workspaces/projects, tasks/subtasks, plain-text notes, daily views, search, and durable queued task capture. See the delivery ledger for actual verification evidence and gaps. This is not the complete MVP or a production release.

| Area | Implementation |
|---|---|
| `apps/web` | Next.js / React responsive web client |
| `apps/api` | Fastify authenticated domain API |
| `packages/core` | Domain contracts and validation |
| `packages/db` | Drizzle schema, SQL migrations, embedded/standard PostgreSQL drivers |
| `packages/client` | Typed API client and owner-bound task retry queue |
| `docs`, `design` | Requirements, decisions, delivery evidence, clickable Home preview |

Platform order: **responsive web → shared iOS/Android mobile app, with urgent iOS priority → macOS**. React Native + Expo + TypeScript is the mobile direction following Edward's “Yes build”; the mobile package and native authentication have not been implemented yet. Android readiness must not delay iOS. AI processing, recording/imports, MCP, and Mac packaging remain separate work.

```bash
npm run format:check
npm run typecheck
npm test
npm run build
npm run docs:check
```

Edward Adjei owns scope and approvals. This chat coordinates the work. Merge and deployment approval is per change; see [coordination status](docs/coordination/STATUS.md).

Delivery follows coordinated-development exclusively: coordinator planning and written briefs, specialist PRs, coordinator checks, and Edward's approval for merges and deployments. Brainstorming is optional design support; Ordo does not use the Superpowers development approach.
