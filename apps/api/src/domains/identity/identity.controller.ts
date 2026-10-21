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
) {
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
