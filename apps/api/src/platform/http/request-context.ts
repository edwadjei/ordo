import type { FastifyRequest } from 'fastify';
import type { User } from '@ordo/core';
import { z } from 'zod';
import { fail } from './api-failure.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor: User | null;
  }
}
const parameters = z.object({ id: z.uuid() });
export const entityId = (request: FastifyRequest) =>
  parameters.parse(request.params).id;
export const currentUser = (request: FastifyRequest) =>
  request.actor ?? fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
export const actorId = (request: FastifyRequest) => currentUser(request).id;
