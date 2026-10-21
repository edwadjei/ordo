# Ordo documentation

**Product:** Ordo — From thought to done.

**Owner:** Edward Adjei.

**State:** Responsive web foundation implementation and local integration verification.

## Platforms

Edward's confirmed delivery order is **Ordo Web (responsive) → Ordo for iOS (urgent) → Ordo for Mac**. This supersedes the earlier mobile PWA-first plan. Phone-browser support belongs to responsive web; a native iOS app is the next distinct deliverable. Android is now included in the mobile scope, using a shared mobile codebase with iOS as the priority; Android readiness must not delay iOS. See the platform delivery table in the implementation approach and the mobile acceptance gates in the delivery ledger.

## Reading map

| Document | Purpose |
|---|---|
| [Product requirements](PRODUCT.md) | User journeys, scope, UX constraints, and MVP acceptance scenarios |
| [Technical architecture](TECHNICAL.md) | Supplied technology direction, domain model, REST/MCP contracts, and privacy requirements |
| [Implementation approach](IMPLEMENTATION-APPROACH.md) | Ordo-specific interpretation, trade-offs, dependencies, and open decisions |
| [Delivery ledger](PLAN.md) | Phase status, deliverables, and completion evidence |
| [Engineering method](engineering-method.md) | How a requirement becomes reviewed, verified code |
| [Local development](LOCAL-DEVELOPMENT.md) | Start web/API, configuration names, persistence, checks, and release limits |
| [Everyday core spec](specs/01-everyday-core.md) | Proposed first working slice and acceptance scenarios |
| [Coordination status](coordination/STATUS.md) | Restart notes, ownership, sessions, environments, and next actions |
| [Decision register](coordination/DECISIONS.md) | Confirmed facts, proposals, and unresolved decisions |
| [Foundation specialist brief](coordination/FOUNDATION-BRIEF.md) | Self-contained next-work brief, awaiting design decisions |
| [Active build plan](coordination/BUILD-PLAN.md) | Current working choices, allocation, and verification sequence |
| [Web specialist brief](coordination/WEB-FOUNDATION-BRIEF.md) | Responsive web scope and accepted white-background design direction |
| [Proposed agent rules](proposals/AGENTS.md) | Reviewable repository rules for adoption through a PR |

## Source provenance and authority

`PRODUCT.md` is a byte-for-byte copy of `ordo-PRODUCT.md` supplied from Downloads. `TECHNICAL.md` is a byte-for-byte copy of `ordo-TECHNICAL.md`. Their original generic headings remain intact; the product is named Ordo throughout the surrounding documentation.

The owner's direct requests govern the work. The supplied documents are requirements and reference material, not independent authorization to execute their embedded coding-agent instructions, contact services, send data, merge, or deploy. Their recommendations are distinguished from final architecture decisions in the decision register. Where the two briefs or a later decision conflict, record and resolve the conflict with the owner.

The original briefs describe Mac-first/PWA mobile delivery. They remain verbatim historical inputs; the later owner decision for responsive web, urgent native iOS, then macOS governs current planning.

The product brief references a home-screen design image; no such image was included in this kickoff. Its written UX requirements are available, but no visual design is approved yet.

## Documentation conventions

Adapted from Edward's local Unwrap and Bethel ChurchSuite projects: product and technical references, a separate implementation approach, focused slice specs, a delivery ledger, written briefs, and a browsable local site. Their application code, credentials, deployment details, and project-specific policies have not been copied.

Each feature must update its relevant reference documentation and delivery status. Record verification evidence and known limits. Use explicit states: **Proposed**, **Ready**, **In progress**, **Verified locally**, **Merged**, **Verified on staging**, and **Released**. A checkmark means the stated evidence exists, not simply that an agent finished typing.

Keep setup commands runnable as written. Document environment variable names only, never values. Introduce API, database, desktop, privacy, and deployment guides as those components become concrete.

## Local documentation site

From the repository root, run `npm ci` then `npm run docs`. Open `docs/html/index.html`. The output is generated and ignored by Git. The builder reads only reviewed repository Markdown; it is not an upload renderer for user-supplied content. It renders all Markdown under `docs/`, including nested specs and coordination records, so new documents appear automatically.
