# Workspace and project concepts

## One destination owner

WorkspacesService owns workspace/project records and destination validation. Projects currently remain in this domain because they share the same small ownership and containment model. Tasks and notes ask this service whether a destination is authorized; they never import its repository or query project tables themselves.

Every lookup resolves both entity ID and authenticated owner. A foreign ID yields the same not-found behavior as a missing ID. A project must belong to the selected workspace; merely owning both records is insufficient. Database composite foreign keys backstop the same containment rules.

## Personal Inbox

The personal Inbox is a null workspace/project destination with a non-null authenticated owner. It is not a fabricated workspace and is never ownerless data. `validateScope()` accepts this explicit empty destination, but a non-null project with null or mismatched workspace is rejected.

## Transaction boundary

`workspaces.service.ts` owns revision checks and update transactions. Tasks/notes can supply the same transaction context to `validateScope()` used for their write, avoiding a detached permission preflight. Repositories execute the actual scoped queries; they do not move children or infer destinations.

The controller validates request bodies and UUID paths. Nested project creation takes its workspace from the URL as the authoritative route scope. PATCH omits creation defaults so renaming does not reset color or description. Project movement and workspace/project deletion are not part of the current endpoint contract.

## On Cloudflare

On D1 the same rules hold without a shared transaction: workspace and project updates are conditional on `revision`, and tasks and notes re-check their destination inside their own conditional write rather than relying on an earlier read. Composite foreign keys still backstop containment.

**Implementation status:** today validation shares the PostgreSQL owner transaction described above; check-on-save is Phase 2.
