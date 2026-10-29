import type { SessionAuthenticator } from '../../capabilities/session-authenticator.contract.js';
import type { AgentAuthenticator } from '../../capabilities/agent-authenticator.contract.js';
import { agentRule } from './agent-policy.js';
import type { SignInThrottle } from '../../capabilities/sign-in-throttle.contract.js';
import { fail } from './api-failure.js';
import type { RequestGuard } from './http.js';
import { currentUser } from './request-context.js';
import { readSession } from './session-cookie.js';

export interface RequestSecurityOptions {
  authenticator: SessionAuthenticator;
  /** Per-route, per-client sign-in limit; omitted means unthrottled (tests only). */
  throttle?: SignInThrottle;
  trustedOrigins: string[];
  /** Agent access tokens (`Authorization: Bearer ordo_pat_…`); off when absent. */
  agents?: AgentAuthenticator;
}

const bearer = /^Bearer\s+(\S+)$/i;

const signInPaths = new Set(['/v1/auth/otp/request', '/v1/auth/otp/verify']);
const publicPaths = new Set([...signInPaths, '/health', '/v1/capabilities']);

/**
 * Origin check for mutations, per-client sign-in throttle, session resolution
 * and the `X-Ordo-Account` guard. Runs before every request, before the body
 * is read. Sign-out is never throttled.
 */
export function createRequestSecurity(
  options: RequestSecurityOptions,
): RequestGuard {
  const origins = new Set(options.trustedOrigins);
  return async (request, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff');
    const pathname = request.path;
    const authorization = request.header('authorization');
    if (authorization !== undefined) {
      // An agent access token. It never falls back to the session cookie.
      const token = bearer.exec(authorization)?.[1];
      const identity =
        token && options.agents
          ? await options.agents.authenticate(token)
          : null;
      if (!identity)
        fail(
          401,
          'UNAUTHORIZED',
          'This access key is not valid. It may have been revoked or have expired.',
        );
      // Not a browser session, so no same-origin rule; but a browser origin
      // that is present must still be ours (DNS-rebinding protection).
      const origin = request.header('origin');
      if (origin && !origins.has(origin))
        fail(
          403,
          'ORIGIN_REJECTED',
          'This request did not come from an allowed app origin.',
        );
      const rule = agentRule(request.method, pathname);
      if (!rule) fail(403, 'AGENT_NOT_ALLOWED', 'Access keys cannot do this.');
      if (rule.scope === 'write' && !identity.scopes.includes('write'))
        fail(
          403,
          'INSUFFICIENT_SCOPE',
          'This access key can only read. Create a read-and-write key to make changes.',
        );
      request.actor = identity.user;
      request.agent = {
        tokenId: identity.tokenId,
        scopes: identity.scopes,
        action: rule.action,
        entityType: rule.entityType,
      };
      return;
    }
    if (pathname === '/v1/mcp')
      fail(
        401,
        'UNAUTHORIZED',
        'Connect with an access key: Authorization: Bearer ordo_pat_….',
      );
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (mutation) {
      const origin = request.header('origin');
      if (!origin || !origins.has(origin))
        fail(
          403,
          'ORIGIN_REJECTED',
          'This request did not come from an allowed app origin.',
        );
      if (
        signInPaths.has(pathname) &&
        options.throttle &&
        !(await options.throttle.attempt(pathname, request.ip))
      ) {
        reply.header('Retry-After', '60');
        fail(
          429,
          'RATE_LIMITED',
          'Too many sign-in attempts. Try again in a minute.',
        );
      }
    }
    if (publicPaths.has(pathname)) {
      // Capabilities are public, but a signed-in caller also learns whether
      // its own saved OpenAI key makes transcription available.
      const token =
        pathname === '/v1/capabilities' ? readSession(request) : null;
      if (token)
        request.actor = await options.authenticator.resolveSession(token);
      return;
    }
    const token = readSession(request);
    if (!token) fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
    request.actor = await options.authenticator.resolveSession(token);
    const actor = currentUser(request);
    const expectedAccount = request.header('x-ordo-account');
    if (expectedAccount && expectedAccount !== actor.id)
      fail(
        409,
        'SESSION_CHANGED',
        'The signed-in account changed. Return to the account that owns this saved capture.',
      );
  };
}
