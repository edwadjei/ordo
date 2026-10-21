# Identity concepts

## Ownership and session identity

`identity.service.ts` owns accounts, password sign-in, and browser sessions. The authenticated actor contains only `id`, `email`, `displayName`, and `timezone`. Password hashes, session digests, and the fixture marker never become the request actor or response DTO.

The domain owns three real seams: `PasswordHasher`, `SessionTokens`, and `SessionAuthenticator`. Its module alone wires the Node scrypt/random-token adapters. The platform request guard receives the abstract authenticator, so cross-cutting HTTP cannot import the domain's repository or service implementation.

## Credential decisions

Registration salts and hashes the password before storing an account. Email uniqueness is enforced by PostgreSQL; concurrent duplicates return the existing safe conflict response. Login computes a real password hash comparison even when the account is absent, using an initialized dummy hash. This avoids a fast no-account branch while keeping the same generic invalid-credentials message.

Session tokens use 32 random bytes and are stored as SHA-256 digests, with a seven-day expiry. `identity.repository.ts` resolves the digest and current user record on every private request. Logout deletes that stored session, so the old cookie stops authorizing requests immediately afterwards. Sessions are independent; logout revokes the current one rather than silently signing out all devices.

## Transport and persistence

`identity.controller.ts` parses shared credential schemas and translates returned tokens into HttpOnly, SameSite=Lax cookies. It owns cookie clearing and response status; the service never reads Fastify requests. `identity.repository.ts` is the only normal identity query owner for users/sessions.

The demo fixture repository's access to `users.demo_loaded` is a documented fixture-only exception, not an alternate identity API. Public user mapping is explicit; neither object spreads nor database rows are used as authentication responses.

## Not yet implemented

No email verification, password reset, external identity provider, native bearer-token flow, session-management UI, or account deletion is implied by this foundation. Native iOS/Android authentication must be designed explicitly before those clients ship.
