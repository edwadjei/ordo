# Ordo coordinator handoff

**Updated:** 21 October 2026.  
**Owner:** Edward Adjei.  
**Repository:** `git@github.com:edwadjei/ordo.git`.  
**Workspace:** `/Users/edwadjei/projects/ordo`.

## Current work

This chat is the coordinator for Ordo's documentation-first kickoff. The current local branch is `codex/ordo-web-foundation`, created from the clean `main` checkout. Edward explicitly requested commit/push checkpoints while work proceeds. Documentation is the first checkpoint; verified application changes follow the active API restructuring. No PR, merge, deployment, infrastructure change, or external message has been made. Consult the Git log and branch tracking state for exact checkpoint revisions.

Edward explicitly selected coordinated-development as the sole delivery workflow. Brainstorming is optional design support only. Do not resume a Superpowers development sequence, require a separate plan-approval stage, or impose per-task implementer/reviewer agent cycles. The coordinator prepares briefs and checks specialist PRs; Edward approves scope/design choices and each merge/deployment/shared-data change.

The supplied briefs are preserved in `docs/PRODUCT.md` and `docs/TECHNICAL.md`. Supporting docs adapt the organization of Unwrap and Bethel ChurchSuite, without inheriting their application stacks or environmental assumptions. Proposed architecture and first-slice details need owner review.

Documentation verified locally: exact source copies, clean lockfile install, 11 generated pages, 252 valid local links/fragments, script syntax, and diff whitespace. The local docs index was visually inspected in the browser. A loopback-only preview is available at `http://127.0.0.1:4317` while the documentation preview process remains running; the generated site also opens directly from `docs/html/index.html` without a server.

## Sessions and ownership

| Area | Session | State |
|---|---|---|
| Coordination/documentation | This chat | Documentation kickoff |
| Foundation/API | Not started | [Brief prepared](FOUNDATION-BRIEF.md); foundation decisions and concrete task scope pending |
| Responsive web | Not started | First platform; laptop and phone-browser UX/acceptance evidence |
| Mobile iOS/Android | Not started | Urgent iOS priority; shared React Native/Expo stack recommended; framework/distribution decision and specialist brief pending |
| AI/worker | Not started | Later slice |
| macOS | Not started | Third platform, after iOS; packaging deferred |
| MCP | Not started | Separate feature stream |

Edward’s latest priority is **responsive web → native iOS (urgent) → macOS**. This replaces the earlier PWA-first decision. Web owns responsive phone-browser behavior; an iOS specialist owns the distinct native client. Select its framework and distribution method before implementation. Mac packaging, AI/MCP completion, Android, and PWA installability do not block starting iOS. No deadline or native framework has been selected.

No specialist has been dispatched. Start specialist work only with an approved bounded brief. If using child agents, return reports within this coordinator task. Separate user-visible chats require Edward's request; otherwise prepare a pasteable brief.

## Environments and releases

| Environment | State | Release / rollback |
|---|---|---|
| Local | Documentation tooling only | No app release |
| Staging | Not provisioned | None |
| Production | Not provisioned | None |

No databases, backups, object stores, provider credentials, DNS, or CI secrets have been set up. Record actual details only when verified. Never include credential values here.

## Resume here

1. Read `docs/README.md`, the supplied briefs, `docs/PLAN.md`, and `docs/coordination/DECISIONS.md`.
2. Check the current working tree; preserve local work and do not assume these docs were committed or approved.
3. Review the everyday core design with Edward and resolve foundation choices, especially Inbox ownership, authentication, and runtime.
4. Settle integration branch policy before creating PRs. The invoked workflow requires proposed repo rules to go through a PR rather than direct adoption on the default branch.
5. Prepare and assign standalone API/web briefs with explicit dependencies under coordinated-development once the relevant scope/design choices are settled.

## Waiting on Edward

Review [the everyday core proposal](../specs/01-everyday-core.md) and confirm whether to adopt `dev` → staging / `main` → production as the future integration policy. No hosting or paid service choice is needed to finish this documentation change.

Latest mobile scope: Android is included, with iOS bias. Recommend React Native + Expo + TypeScript in `apps/mobile`; iOS leads design, device tests, and release readiness, and Android must not delay it. Responsive web remains first, macOS later. Framework adoption and Android release timing are not yet settled.
