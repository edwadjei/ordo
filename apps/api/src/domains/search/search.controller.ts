import type { HttpRoutes } from '../../platform/http/http.js';
import { z } from 'zod';
import { archivedQuery } from '@ordo/core';
import { actorId } from '../../platform/http/request-context.js';
import type { SearchService } from './search.service.js';
const query = archivedQuery.extend({
  q: z.string().trim().min(1).max(200),
});
export function registerSearchController(
  routes: HttpRoutes,
  service: SearchService,
) {
  routes.get('/v1/search', async (request) => {
    const { q, includeArchived } = query.parse(request.query);
    return {
      results: await service.search(actorId(request), q, includeArchived),
    };
  });
}
