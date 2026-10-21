# Responsive web foundation delivery

**Started:** 21 October 2026.  
**Authorization:** Edward: “Yes build.”  
**Method:** Coordinated-development; local implementation, reviewable before merge/deploy.

## Working choices

- Node 22.23.2 and npm workspaces. Documentation tooling stays available.
- Next.js/React for responsive web, Fastify for the shared API, Drizzle for PostgreSQL persistence.
- Embedded PostgreSQL (PGlite) for local development because Docker is unavailable; standard PostgreSQL through `DATABASE_URL` for a configured server environment.
- Personal account signup/login with hashed passwords and opaque, revocable, expiring server sessions. No real email sending or external identity provider configuration.
- Every user-owned row has explicit owner identity. Unscoped Inbox task/note records have no workspace; optional project/parent links must satisfy owner and scope containment.
- Date-only task/follow-up values use `YYYY-MM-DD`, not timezone-shifted midnight instants. Account timezone drives calendar presentation.
- My Day shows open due/overdue work and due follow-ups. Waiting is explicit; parent completion leaves children unchanged.
- React Native + Expo + TypeScript is the selected mobile direction following Edward's “Yes build”; mobile UI/package implementation follows the responsive web core, with iOS prioritized. Mac is later.

These are local build choices, not authorization to provision services, send sensitive data, merge, or deploy. Hosting, production authentication requirements, and distribution remain to be resolved before release.

## Written work allocation

| Area | Specialist | Owned paths | Deliverable |
|---|---|---|---|
| API/domain/database | `api_foundation` | `apps/api`, `packages/core`, `packages/db` | Persistent authorized API, migrations, tests, endpoint guide |
| Web/client | `web_app` | `apps/web`, `packages/client` | Responsive authenticated task/note workflow and durable queued capture |
| Coordination | This chat | Root tooling, `docs`, `design`, integration checks | Design preview, runnable setup, review and evidence |

Specialists share this local feature checkout with separate file ownership. No specialist may change branches or root dependencies concurrently. The coordinator performs dependency installation after workspace manifests are ready. Edward requested branch checkpoints while building. The coordinator commits and pushes coherent checkpoints to `codex/ordo-web-foundation`; no merge or deployment is authorized by this. Integration branch policy remains unresolved; local build work does not infer permission to change `main` or provision `dev`.

## Sequence and checks

1. Prepare Home preview and send for feedback; API/domain/client setup proceeds independently. Edward accepted the layout and requested white/neutral backgrounds rather than green theming; implement that palette revision.
2. Install locked compatible dependencies and verify API tests, ownership, persistence, hierarchy constraints, and idempotency.
3. Connect the working UI to the real API; verify account/task/note journeys and failure states, and incorporate visual feedback when supplied.
4. Run typecheck, tests, and production build; review the combined change for auth, scope, secrets, and misleading UI states.
5. Capture browser evidence and update setup, environment, API, and handoff documentation with actual results.
6. Present the concrete change to Edward before any merge/deployment. Native mobile is the next platform, not a claimed result of this web slice.
