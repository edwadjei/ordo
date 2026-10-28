# Workspace and project concepts

## One destination owner

WorkspacesService owns workspace/project records and destination validation. Projects currently remain in this domain because they share the same small ownership and containment model. Tasks and notes ask this service whether a destination is authorized; they never import its repository or query project tables themselves.

Every lookup resolves both entity ID and authenticated owner. A foreign ID yields the same not-found behavior as a missing ID. A project must belong to the selected workspace; merely owning both records is insufficient. Database composite foreign keys backstop the same containment rules.

## Personal Inbox

The personal Inbox is a null workspace/project destination with a non-null authenticated owner. It is not a fabricated workspace and is never ownerless data. `validateScope()` accepts this explicit empty destination, but a non-null project with null or mismatched workspace is rejected.

## Transaction boundary

`workspaces.service.ts` owns revision checks. Workspace and project updates are `UPDATE … WHERE revision = ?` (check-on-save); a save that loses a race returns `409 REVISION_CONFLICT`. Tasks and notes call `validateScope()` before their write. That read cannot go stale, because workspaces and projects are never deleted and a project never changes workspace; composite foreign keys backstop containment in the database. Repositories execute the actual scoped queries; they do not move children or infer destinations.

## On Cloudflare

These rules run on D1 as described above; there is no shared transaction or owner lock.
