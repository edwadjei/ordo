import type { FastifyInstance } from 'fastify';
import { currentUser } from '../../platform/http/request-context.js';
import type { HomeService } from './home.service.js';

export function registerHomeController(
  app: FastifyInstance,
  service: HomeService,
) {
  app.get('/v1/home', async (request) =>
    service.snapshot(currentUser(request)),
  );
}
