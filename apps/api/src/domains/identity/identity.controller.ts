import { z } from 'zod';
import type { OtpService } from './otp.service.js';
import type { HttpRoutes } from '../../platform/http/http.js';
import { currentUser } from '../../platform/http/request-context.js';
import {
  readSession,
  sessionCookie,
} from '../../platform/http/session-cookie.js';
import type { IdentityService } from './identity.service.js';

export function registerIdentityController(
  routes: HttpRoutes,
  service: IdentityService,
  secureCookies: boolean,
  otp: OtpService,
) {
  routes.post('/v1/auth/otp/request', async (request, reply) => {
    const input = z
      .object({ contact: z.string().min(3).max(254) })
      .strict()
      .parse(request.body);
    const result = await otp.request(input.contact);
    reply.status(202);
    return result;
  });
  routes.post('/v1/auth/otp/verify', async (request, reply) => {
    const input = z
      .object({
        challengeId: z.uuid(),
        code: z.string().regex(/^\d{6}$/),
        displayName: z.string().trim().min(1).max(80).optional(),
      })
      .strict()
      .parse(request.body);
    const result = await otp.verify(input);
    reply.setCookie(sessionCookie(result.token, secureCookies));
    return { user: result.user };
  });
  routes.get('/v1/auth/me', async (request) => ({
    user: currentUser(request),
  }));
  routes.post('/v1/auth/logout', async (request, reply) => {
    await service.logout(readSession(request)!);
    reply.setCookie(sessionCookie('', secureCookies, true));
    return { ok: true };
  });
}
