import type { HttpRoutes } from '../../platform/http/http.js';
import { currentUser } from '../../platform/http/request-context.js';
import type { HomeService } from './home.service.js';

export function registerHomeController(
  routes: HttpRoutes,
  service: HomeService,
) {
  routes.get('/v1/home', async (request) =>
    service.snapshot(currentUser(request)),
  );
}
