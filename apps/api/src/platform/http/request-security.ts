import type { FastifyInstance } from 'fastify';
import type { SessionAuthenticator } from '../../capabilities/session-authenticator.contract.js';
import { fail } from './api-failure.js';
import { currentUser } from './request-context.js';
import { readSession } from './session-cookie.js';

export interface RequestSecurityOptions {
  authenticator: SessionAuthenticator;
  trustedOrigins: string[];
}

export function registerRequestSecurity(
  app: FastifyInstance,
  options: RequestSecurityOptions,
) {
  const origins = new Set(options.trustedOrigins);
  const rate = new Map<string, { count: number; reset: number }>();
  app.decorateRequest('actor', null);
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff');
    const pathname = request.url.split('?')[0];
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (mutation) {
      if (!request.headers.origin || !origins.has(request.headers.origin))
        fail(
          403,
          'ORIGIN_REJECTED',
          'This request did not come from an allowed app origin.',
        );
      if (pathname === '/v1/auth/register' || pathname === '/v1/auth/login') {
        const now = Date.now();
        if (rate.size > 10000)
          for (const [key, bucket] of rate)
            if (bucket.reset < now) rate.delete(key);
        const key = request.ip;
        let bucket = rate.get(key);
        if (!bucket || bucket.reset < now) {
          bucket = { count: 0, reset: now + 60000 };
          rate.set(key, bucket);
        }
        bucket.count++;
        if (bucket.count > 12) {
          reply.header('Retry-After', '60');
          fail(
            429,
            'RATE_LIMITED',
            'Too many sign-in attempts. Try again in a minute.',
          );
        }
      }
    }
    if (
      pathname === '/health' ||
      pathname === '/v1/auth/register' ||
      pathname === '/v1/auth/login'
    )
      return;
    const token = readSession(request.headers.cookie);
    if (!token) fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
    request.actor = await options.authenticator.resolveSession(token);
    const actor = currentUser(request);
    const expectedAccount = request.headers['x-ordo-account'];
    if (mutation && expectedAccount && expectedAccount !== actor.id)
      fail(
        409,
        'SESSION_CHANGED',
        'The signed-in account changed. Return to the account that owns this saved capture.',
      );
  });
}
