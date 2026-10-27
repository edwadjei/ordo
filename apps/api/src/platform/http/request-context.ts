import { z } from 'zod';
import { fail } from './api-failure.js';
import type { HttpRequest } from './http.js';

const parameters = z.object({ id: z.uuid() });
export const entityId = (request: HttpRequest) =>
  parameters.parse(request.params).id;
export const currentUser = (request: HttpRequest) =>
  request.actor ?? fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
export const actorId = (request: HttpRequest) => currentUser(request).id;
