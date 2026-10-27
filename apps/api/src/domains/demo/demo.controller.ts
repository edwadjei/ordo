import type { HttpRoutes } from '../../platform/http/http.js';
import { currentUser } from '../../platform/http/request-context.js';
import type { DemoService } from './demo.service.js';

export function registerDemoController(
  routes: HttpRoutes,
  service: DemoService,
) {
  routes.post('/v1/demo', async (request) =>
    service.load(currentUser(request)),
  );
}
