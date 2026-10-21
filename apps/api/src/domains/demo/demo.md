# Fictional demo concepts

## Explicit and owner-bound

DemoService runs only after the signed-in user explicitly requests `/v1/demo`. It never runs during startup, account registration, login, or normal task capture. All fixture rows use that authenticated owner; no user ID in the request body can redirect them.

The fixture set provides four named sample contexts, at least 21 MTN projects, and clearly fictional tasks/notes. Names illustrate the product brief; no real business records or personal data were imported from the reference repositories.

## Narrow cross-table exception

`demo.repository.ts` is the deliberate fixture-only exception to normal domain table ownership. It inserts a coordinated synthetic dataset across workspaces/projects/tasks/notes and updates the user's `demo_loaded` marker. Normal application domains must still call the owning service rather than copy this cross-table pattern.

`demo.service.ts` owns the owner-lock transaction and checks the marker inside that transaction before invoking the repository's insert. A repeated or concurrent sample-data request does not duplicate content. Insertions and marker update commit together; a partial fixture load cannot appear as a completed setup.

The post-seed response comes from HomeService, keeping its response contract and authorization behavior identical to an ordinary Home refresh. This domain is not a migration mechanism, a production seed command, or a back door for shared-data changes.
