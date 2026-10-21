import { z } from 'zod';
import type { OtpService } from './otp.service.js';
import type { FastifyInstance } from 'fastify';
import { registration, userCredentials } from '@ordo/core';
import { currentUser } from '../../platform/http/request-context.js';
import {
  readSession,
  sessionCookie,
} from '../../platform/http/session-cookie.js';
import type { IdentityService } from './identity.service.js';

export function registerIdentityController(
  app: FastifyInstance,
  service: IdentityService,
  secureCookies: boolean,
  otp: OtpService,
) {
  app.post('/v1/auth/otp/request', async (request, reply) => {
    const input = z
      .object({ contact: z.string().min(3).max(254) })
      .strict()
      .parse(request.body);
    const result = await otp.request(input.contact);
    return reply.code(202).send(result);
  });
  app.post('/v1/auth/otp/verify', async (request, reply) => {
    const input = z
      .object({
        challengeId: z.uuid(),
        code: z.string().regex(/^\d{6}$/),
        displayName: z.string().trim().min(1).max(80).optional(),
      })
      .strict()
      .parse(request.body);
    const result = await otp.verify(input);
    reply.header('Set-Cookie', sessionCookie(result.token, secureCookies));
    return { user: result.user };
  });
  app.post('/v1/auth/register', async (request, reply) => {
    const result = await service.register(registration.parse(request.body));
    reply.header('Set-Cookie', sessionCookie(result.token, secureCookies));
    return reply.code(201).send({ user: result.user });
  });
  app.post('/v1/auth/login', async (request, reply) => {
    const result = await service.login(userCredentials.parse(request.body));
    reply.header('Set-Cookie', sessionCookie(result.token, secureCookies));
    return { user: result.user };
  });
  app.get('/v1/auth/me', async (request) => ({ user: currentUser(request) }));
  app.post('/v1/auth/logout', async (request, reply) => {
    await service.logout(readSession(request.headers.cookie)!);
    reply.header('Set-Cookie', sessionCookie('', secureCookies, true));
    return { ok: true };
  });
}
