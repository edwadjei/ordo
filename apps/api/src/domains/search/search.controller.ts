import type { HttpRoutes } from '../../platform/http/http.js';
import { z } from 'zod';
import { actorId } from '../../platform/http/request-context.js';
import type { SearchService } from './search.service.js';
const query = z.object({ q: z.string().trim().min(1).max(200) });
export function registerSearchController(
  routes: HttpRoutes,
  service: SearchService,
) {
  routes.get('/v1/search', async (request) => ({
    results: await service.search(
      actorId(request),
      query.parse(request.query).q,
    ),
  }));
}
