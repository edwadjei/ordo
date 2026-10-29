# Identity concepts

## Ownership and session identity

`identity.service.ts` owns browser sessions and the sign-in throttle; `otp.service.ts` owns code sign-in (email or Ghana phone). Ordo is code-only: there is no password registration, password login or password verifier, and the `users` table has no password column. The authenticated actor contains only `id`, `email`, `displayName`, and `timezone`. Session digests and the fixture marker never become the request actor or response DTO.

The session seams are `SessionTokens` and `SessionAuthenticator`; the throttle seam is `SignInThrottle`. The module alone wires the adapters: `WebSessionTokens` (Web Crypto) for sessions and `WebOtpSecrets` for codes. The platform request guard receives the abstract authenticator and throttle, so cross-cutting HTTP cannot import the domain's repository or service implementation.

## Sessions

Session tokens use 32 random bytes and are stored as SHA-256 digests, with a seven-day expiry. `identity.repository.ts` resolves the digest and current user record on every private request. Logout deletes that stored session, so the old cookie stops authorizing requests immediately afterwards. Sessions are independent; logout revokes the current one rather than silently signing out all devices.

## Transport and persistence

`identity.controller.ts` translates returned tokens into HttpOnly, SameSite=Lax cookies (Secure outside `ORDO_ENV=development`). It owns cookie clearing and response status; the service never reads HTTP framework requests. `identity.repository.ts` owns session and throttle queries; `otp.repository.ts` owns the challenge lifecycle and the atomic verified-account/session batch.

The demo fixture repository's access to `users.demo_loaded` and `users.demo_claim` is a documented fixture-only exception, not an alternate identity API. Public user mapping is explicit; neither object spreads nor database rows are used as authentication responses.

## Code sign-in

`POST /v1/auth/otp/request` accepts `{ contact }`: a normalized email, Ghana national phone `0XXXXXXXXX`, or Ghana E.164 `+233XXXXXXXXX`. It returns HTTP 202 with `{ challengeId, retryAfterSeconds: 60, expiresInSeconds: 300 }` for new and existing accounts alike. No raw code is returned or logged. Unsupported-country phones fail before any provider call.

A six-digit code is drawn with `crypto.getRandomValues` (rejection sampling, so there is no modulo bias) and stored as `hmac-sha256:<hex>`, the HMAC-SHA256 of `challengeId:code` under the 32-byte `OTP_HMAC_KEY` secret. That fits the Workers 10 ms CPU budget where scrypt does not, and is safe because codes expire in five minutes, attempts are capped at five, and nobody can test guesses offline without the secret. A hosted Worker refuses API requests without the secret; under `ORDO_ENV=development` an unset key is replaced by a temporary one for the life of the isolate.

The request is **one upsert** on the contact's `otp_challenges` row: `INSERT … ON CONFLICT(contact) DO UPDATE SET … WHERE` the 60-second spacing has passed and the 15-minute window allows another send, `RETURNING challenge_id`. No row returned means `429 OTP_RATE_LIMITED`. A window older than 15 minutes starts again; inside a window there are five sends and five attempts, and resending never resets attempts. Sending replaces the previous challenge. The row is marked ready only after delivery succeeds. When delivery fails, the request answers `502 OTP_DELIVERY_FAILED` ("We couldn't send your code. Please try again.") and releases the reservation: the 60-second spacing is lifted so the contact can retry at once, and the undelivered code is blanked so it can never be verified. The failed send still counts toward the five sends a window, so a provider that fails or times out after actually delivering cannot be used to send a contact unlimited messages; the per-IP throttle applies as usual.

`POST /v1/auth/otp/verify` accepts `{ challengeId, code, displayName? }` and runs three steps:

1. One atomic attempt increment: `UPDATE otp_challenges SET attempts = attempts + 1 WHERE challenge_id = ? AND consumed = 0 AND ready = 1 AND expires_at > ? AND attempts < 5 RETURNING code_hash, contact`. No row means refused; concurrent guesses can never exceed five attempts.
2. Constant-time comparison (`crypto.subtle.verify`) of the submitted code's HMAC with `code_hash`. A mismatch is refused; the attempt is already counted.
3. One `batch()`. Its first statement is the compare-and-set `UPDATE otp_challenges SET consumed = 1, consumed_by = <fresh random value> WHERE challenge_id = ? AND consumed = 0`. Every following statement carries `WHERE EXISTS (… consumed_by = <that value>)`: create the account if the contact has none, delete earlier sessions at the first email proof, mark the contact verified, insert the new session, and read the user back. A second request with the same code claims nothing, writes nothing and is refused, so a code works exactly once.

Every refusal is `401 OTP_INVALID` with the same message. Existing accounts keep their IDs and data. The first successful email proof revokes every earlier session of that account (a legacy local account converting, or an email squatter). New accounts are created only after a successful challenge. Phone-only accounts have an opaque internal non-email identifier and expose an empty email string; no fabricated email address appears in the UI. Phone and email logins are distinct accounts; no automatic merging occurs.

## Throttle and delivery

Sign-in routes are limited to 12 requests a minute per route and per client in the `auth_throttle` table: one upsert per request keyed by route and the `CF-Connecting-IP` address (stored only as a SHA-256 digest), batched with a bounded cleanup of stale rows. Over the limit is `429 RATE_LIMITED` with `Retry-After: 60`. Sign-out is never throttled.

`OtpDelivery` and `OtpSecrets` are additional abstract seams. The Worker uses the Gatekeeper transport when `GATEKEEPER_API_KEY` and `GATEKEEPER_API_URL` are set: it sends email through `/send_email` and Ghana SMS through `/send_sms`, times out after 20 seconds, and never exposes provider response bodies. Otherwise, and only with `ORDO_ENV=development`, a console transport prints the code and a masked contact to the `wrangler dev` terminal and sends nothing; it refuses to be constructed in any other environment. A hosted Worker without Gatekeeper returns `OTP_UNAVAILABLE` with Coming soon copy. Provider rejection/failure returns `OTP_DELIVERY_FAILED` and logs one line, `[ordo] Sign-in code delivery failed: channel=<email|sms> reason=<rejected|timeout|network|unavailable|unexpected>`, plus the provider's HTTP status or the thrown error's name; never the contact, code, key, URL or provider body. Transports call the global `fetch` unbound (`(input, init) => fetch(input, init)`): Workers throw `TypeError: Illegal invocation` when it runs as a method of another object, and an architecture test forbids storing such globals as values. Tests inject a capturing transport and send no real messages.

## Remaining authentication scope

No native bearer-token flow, optional PIN/passkey, contact-linking UI, session-management UI, or account deletion is implied by these routes. Native iOS/Android authentication (a bearer token over the same sessions table) must be designed explicitly before those clients ship. See the [technical architecture](../../../../../docs/TECHNICAL.md#8-authentication-and-sessions).
