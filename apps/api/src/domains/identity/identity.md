# Identity concepts

## Ownership and session identity

`identity.service.ts` owns accounts, legacy password sign-in, and browser sessions. `otp.service.ts` owns passwordless email/phone contact verification and sign-in. The authenticated actor contains only `id`, `email`, `displayName`, and `timezone`. Password hashes, session digests, and the fixture marker never become the request actor or response DTO.

The original session seams are `PasswordHasher`, `SessionTokens`, and `SessionAuthenticator`. Its module alone wires the Node scrypt/random-token adapters. The platform request guard receives the abstract authenticator, so cross-cutting HTTP cannot import the domain's repository or service implementation.

## Credential decisions

Registration salts and hashes the password before storing an account. Email uniqueness is enforced by a unique database constraint; concurrent duplicates return the existing safe conflict response. Login computes a real password hash comparison even when the account is absent, using an initialized dummy hash. This avoids a fast no-account branch while keeping the same generic invalid-credentials message.

Session tokens use 32 random bytes and are stored as SHA-256 digests, with a seven-day expiry. `identity.repository.ts` resolves the digest and current user record on every private request. Logout deletes that stored session, so the old cookie stops authorizing requests immediately afterwards. Sessions are independent; logout revokes the current one rather than silently signing out all devices.

## Transport and persistence

`identity.controller.ts` parses shared credential schemas and translates returned tokens into HttpOnly, SameSite=Lax cookies. It owns cookie clearing and response status; the service never reads HTTP framework requests. `identity.repository.ts` owns legacy account/session queries; `otp.repository.ts` owns challenge lifecycle and atomic verified-account/session creation.

The demo fixture repository's access to `users.demo_loaded` is a documented fixture-only exception, not an alternate identity API. Public user mapping is explicit; neither object spreads nor database rows are used as authentication responses.

## Passwordless contact verification

`POST /v1/auth/otp/request` accepts `{ contact }`: a normalized email, Ghana national phone `0XXXXXXXXX`, or Ghana E.164 `+233XXXXXXXXX`. It returns HTTP 202 with `{ challengeId, retryAfterSeconds: 60, expiresInSeconds: 300 }` for new and existing accounts alike. No raw code is returned or logged. Unsupported-country phones fail before any provider call.

`POST /v1/auth/otp/verify` accepts `{ challengeId, code, displayName? }`. A six-digit code is generated with Node cryptographic randomness and stored as a salted scrypt hash bound to the challenge ID. Successful verification consumes it, marks the email/phone verified, and creates the normal opaque session cookie in one database transaction. Existing email accounts keep their IDs/data. Their first successful email OTP disables the old unverified password and revokes previous sessions atomically, preventing a pre-registered email squatter from retaining access. Legacy password login remains available only until that account converts to OTP. Password session creation rechecks the stored credential while holding the account lock, so an in-flight password comparison cannot restore a session after conversion. New accounts are created only after a successful challenge. Phone-only accounts have an opaque internal non-email identifier and expose an empty email string; no fabricated email address appears in the UI. Phone and email logins are distinct accounts unless they already reference the same verified identity; no unsafe automatic merging occurs.

Challenges persist across restarts. A locked contact row enforces a 60-second resend cooldown, five sends per 15-minute window, and five total verification attempts across resends in that window. Sending another code invalidates the old challenge without resetting failures. Correct or incorrect eligible submissions count towards attempts. An expired, failed-delivery, consumed, unknown, or exhausted challenge cannot issue a session. Failed delivery preserves cooldown and limits. Public authentication endpoints also retain CSRF origin and IP checks.

`OtpDelivery` and `OtpSecrets` are additional abstract seams. The module wires `NodeOtpSecrets` and the Gatekeeper transport. The transport uses server-only `GATEKEEPER_API_KEY` and `GATEKEEPER_API_URL`, sends email through `/send_email` and Ghana SMS through `/send_sms`, times out after 20 seconds, and never exposes provider response bodies. Missing credentials return `OTP_UNAVAILABLE` with Coming soon copy. Provider rejection/failure returns `OTP_DELIVERY_FAILED`. Live delivery needs separate verification; tests inject a capturing transport and send no real messages.

## Remaining authentication scope

No password reset UI, native bearer-token flow, optional PIN/passkey, contact-linking UI, session-management UI, or account deletion is implied by these routes. Passwordless access replaces a forgotten password only when the user controls the account's contact channel. Native iOS/Android authentication must be designed explicitly before those clients ship.

## On Cloudflare

Hosted Ordo is code-only: no password routes are served, and a legacy local password account converts at its first code sign-in (the Phase 2 data import never copies password hashes). Codes are hashed as HMAC-SHA256 of challenge ID and code with the `OTP_HMAC_KEY` Worker secret, which fits the 10 ms CPU budget. The resend and send limits become one upsert on the contact's `otp_challenges` row; verification is one guarded attempt increment, a constant-time comparison, then one `batch()` led by a compare-and-set on `consumed = 0` so a code works exactly once. Per-IP limits move to a D1 table keyed by `CF-Connecting-IP`. Native clients use a bearer token over the same sessions table. See the [technical architecture](../../../../../docs/TECHNICAL.md#8-authentication-and-sessions).

**Implementation status:** everything above describes today's code (Node `crypto`, scrypt, PostgreSQL transaction and row lock, in-memory per-process IP limits). The hashing change is Phase 1; the D1 statements and removal of password sign-in are Phase 2.
