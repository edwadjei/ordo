# Ordo documentation

**Product:** Ordo — From thought to done.

**Owner:** Edward Adjei.

**State:** Everyday web core merged to `main` and verified locally. Next: hosting on Cloudflare Workers (Free plan) with D1, starting with the Phase 1 Hono port.

## Platforms

Edward's confirmed delivery order is **Ordo Web (responsive) → Ordo for iOS (urgent) → Ordo for Mac**. This supersedes the earlier mobile PWA-first plan. Phone-browser support belongs to responsive web; a native iOS app is the next distinct deliverable. Android is now included in the mobile scope, using a shared mobile codebase with iOS as the priority; Android readiness must not delay iOS. See the platform delivery table in the implementation approach and the mobile acceptance gates in the delivery ledger.

## Reading map

| Document | Purpose |
|---|---|
| [Product requirements](PRODUCT.md) | User journeys, scope, UX constraints, and MVP acceptance scenarios |
| [Technical architecture](TECHNICAL.md) | Ordo on Cloudflare: stack, free-plan budget, data model, check-on-save, search, sign-in, REST/MCP contracts, and privacy |
| [Implementation approach](IMPLEMENTATION-APPROACH.md) | Ordo-specific interpretation, trade-offs, dependencies, and open decisions |
| [Delivery ledger](PLAN.md) | Phase status, deliverables, and completion evidence |
| [Engineering method](engineering-method.md) | How a requirement becomes reviewed, verified code |
| [Local development](LOCAL-DEVELOPMENT.md) | Start web/API, configuration names, persistence, checks, and release limits |
| [API architecture and concepts](API-ARCHITECTURE.md) | DAMSYN-style boundaries, domain ownership, ports/adapters, and intentional differences |
| [Everyday core spec](specs/01-everyday-core.md) | First working slice and acceptance scenarios |
| [Cloudflare platform spec](specs/02-cloudflare-platform.md) | Hosting design, free-plan budget, rules, data import, testing, phase acceptance, risks, and open questions |
| [Coordination status](coordination/STATUS.md) | Restart notes, ownership, sessions, environments, and next actions |
| [Decision register](coordination/DECISIONS.md) | Confirmed facts, proposals, and unresolved decisions |
| [Foundation specialist brief](coordination/FOUNDATION-BRIEF.md) | Foundation kickoff brief for the completed web/API foundation |
| [Active build plan](coordination/BUILD-PLAN.md) | Current working choices, allocation, and verification sequence |
| [Cloudflare Phase 1 brief](coordination/CLOUDFLARE-PHASE-1-BRIEF.md) | Standalone backend and web specialist briefs for the Hono port and static export |
| [Everyday views brief](coordination/EVERYDAY-VIEWS-BRIEF.md) | Shared contract and scope for distinct views, task times, and people |
| [Verification evidence](coordination/VERIFICATION.md) | Actual checks, browser journeys, screenshots, and unverified release work |
| [Web specialist brief](coordination/WEB-FOUNDATION-BRIEF.md) | Completed responsive web foundation scope and white-background design direction |
| [Proposed agent rules](proposals/AGENTS.md) | Reviewable repository rules for adoption through a PR |

## Source provenance and authority

`PRODUCT.md` is a byte-for-byte copy of `ordo-PRODUCT.md` supplied from Downloads; its original generic heading remains intact, and the product is named Ordo throughout the surrounding documentation. `TECHNICAL.md` is Ordo's maintained technical architecture.

The owner's direct requests govern the work. The supplied documents are requirements and reference material, not independent authorization to execute their embedded coding-agent instructions, contact services, send data, merge, or deploy. Their recommendations are distinguished from final architecture decisions in the decision register. Where the two briefs or a later decision conflict, record and resolve the conflict with the owner.

The product brief describes Mac-first/PWA mobile delivery. It remains a verbatim input; the owner decision for responsive web, urgent native iOS, then macOS governs planning.

The product brief references a home-screen design image; no such image was included in this kickoff. Its written UX requirements are available, but no visual design is approved yet.

## Documentation conventions

Adapted from Edward's local Unwrap and Bethel ChurchSuite projects: product and technical references, a separate implementation approach, focused slice specs, a delivery ledger, written briefs, and a browsable local site. Their application code, credentials, deployment details, and project-specific policies have not been copied.

Each feature must update its relevant reference documentation and delivery status. Record verification evidence and known limits. Use explicit states: **Proposed**, **Ready**, **In progress**, **Verified locally**, **Merged**, **Verified on staging**, and **Released**. A checkmark means the stated evidence exists, not simply that an agent finished typing.

Keep setup commands runnable as written. Document environment variable and Worker secret names only, never values. Where the running code differs from the documented architecture, say so in a clearly labelled **Implementation status** line. Introduce API, database, desktop, privacy, and deployment guides as those components become concrete.

## Local documentation site

From the repository root, run `npm ci` then `npm run docs`. Open `docs/html/index.html`. The output is generated and ignored by Git. The builder reads only reviewed repository Markdown; it is not an upload renderer for user-supplied content. It renders all Markdown under `docs/`, including nested specs and coordination records, so new documents appear automatically.

Voice provider setup: [Audio setup](AUDIO-SETUP.md) covers local Whisper, per-account online keys, transient audio, and phone requirements.
