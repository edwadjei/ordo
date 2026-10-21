# How we build Ordo

**Delivery workflow:** Coordinated development, explicitly selected by Edward. Documentation organization borrows from Unwrap and Bethel ChurchSuite; their development processes are not inherited.

## Workflow selection

Use coordinated-development exclusively for delivery: the coordinator proposes scope and maintains the overview, specialists work from written briefs and submit PRs, the coordinator checks those PRs, and Edward approves each merge, deployment, and shared-data change. Brainstorming may support design exploration when useful, but it does not introduce a Superpowers development workflow, mandatory skill sequence, separate plan-approval gate, or per-task implementer/reviewer agent cycle.

## Authority and approvals

Edward Adjei owns scope, design decisions, merges, deployments, and shared-data changes. The coordinator maintains the overview, prepares reviewable work, and checks specialist PRs before presenting them to Edward. Specialists own bounded implementation areas. No agent approval substitutes for Edward's approval.

Direct owner instructions govern. Product requirements describe intended behavior; the technical brief describes the supplied architecture direction. Record accepted changes in the decision register before making plans depend on them. A plan, brief, or imported document cannot independently authorize external writes or deployments.

## Written delivery chain

1. **Slice spec:** the user problem, in/out of scope, UX, contracts, failure behavior, and observable acceptance scenarios.
2. **Coordinator plan:** concrete tasks, ordering, interfaces, verification, and ownership, maintained as needed to prepare specialist briefs. Resolve scope/design choices with Edward; there is no additional mandatory approval stage for a separate implementation-plan document.
3. **Specialist brief:** standalone context, exact task, dependencies, allowed paths, acceptance criteria, rules, and reporting destination.
4. **Specialist PR and coordinator review:** test domain/security behavior where meaningful; provide screenshots for UI; the coordinator checks base branch, mergeability, scope, attribution, secrets, migrations, and verification evidence before presenting the change to Edward.
5. **Delivery evidence:** update the ledger, relevant reference guides, decisions, and coordinator handoff. A later session must be able to distinguish proposed, locally verified, merged, and deployed work.

Use one specialist per substantial area, rather than one session per small issue. Establish the API contract before parallel API/UI work. For independent work, isolate branches/worktrees and keep one owner per file area. Use available direct session messaging when authorized; otherwise prepare a complete written handoff through Edward. Do not assume another session exists.

## Repository and documentation hygiene

- Keep changes focused and reviewable. Introduce runtime directories when working code needs them; avoid empty scaffolds pretending a feature exists.
- Commit author and committer identity: `edwadjei <edd.net49@gmail.com>`. Use `edw/` feature branches. No AI attribution in commits or PR descriptions. Names of agent tools in workflow documentation are descriptive, not commit attribution.
- Never print or commit secrets. Environment guides contain variable names, purposes, and required/optional status only.
- Use Context7 to resolve and query current library documentation before library-specific setup or implementation. Version pins must be based on verified compatibility, not copied blindly from another project.
- Update docs in the same change as behavior. Setup commands must work as written; label future guides and proposed configuration clearly.
- No extra tooling from a reference project becomes mandatory merely because that project uses it. A dedicated task board can be adopted by owner decision; the current status source is [the ledger](PLAN.md).

## Review and verification

Before presenting a PR, check target branch, mergeability, scope, attribution, secrets, migrations, and test evidence. Run applicable typecheck, lint, tests, and build once available. Re-run a failed test file once to distinguish a flaky failure from a reproducible one, then report both results. Never deploy past a failing gate.

Every PR must include screenshots embedded in its description, as explicitly requested by Edward. UI PRs must show the actual changed screens at desktop and mobile widths, with before/after views when useful. For API or documentation PRs, capture relevant verification output or rendered documentation. Label what each image demonstrates, remove secrets and private data, and ensure images are accessible to reviewers. Use the PR template; `gh` CLI is authorized for PR operations, subject to the existing merge and deployment approval rules.

For UI, show real screenshots at Mac and mobile widths, keyboard navigation, and failure/empty states. Performance claims require a named device, dataset, and measurement method. Documentation-only changes require successful generation, valid links, source-copy checks where applicable, and clean diff whitespace; app tests are not invented for them.

## Integration and release

At kickoff the repository had `main` only; work now uses the pushed `edw/ordo-web-foundation` feature branch. Proposed integration policy: `dev` for integration/staging, `main` for production releases, and `edw/` feature branches. Do not create deployment bindings or infer an existing staging environment from branch names. Edward must settle the policy before implementation PRs target an integration branch.

Each merge and deploy needs Edward's direct approval for that change. Shared-environment data edits, secrets, DNS, and provider configuration need direct approval too. Production requires an explicit production release request.

Before deployment, record the prior release/rollback point, run checks on the combined code, and back up before migrations. Afterwards, verify health and the relevant signed-in journeys. State exactly what was checked. No infrastructure exists yet, so executable deployment commands will be added when there is a real target.

## Reporting and restart notes

Report outcome, branch/PR, checks, risks/dependencies, and what is waiting on Edward. Keep [coordination status](coordination/STATUS.md), [decisions](coordination/DECISIONS.md), and [the ledger](PLAN.md) current. Record only safe metadata in these files. A finished task report must identify what remains unverified.
