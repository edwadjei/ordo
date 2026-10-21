import type { FastifyInstance } from 'fastify';
import { currentUser } from '../../platform/http/request-context.js';
import type { DemoService } from './demo.service.js';

export function registerDemoController(
  app: FastifyInstance,
  service: DemoService,
) {
  app.post('/v1/demo', async (request) => service.load(currentUser(request)));
}
