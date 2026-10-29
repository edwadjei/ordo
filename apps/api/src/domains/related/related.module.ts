import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { RelatedRepository } from './related.repository.js';
import { RelatedService } from './related.service.js';
import { registerRelatedController } from './related.controller.js';

export function createRelatedModule(database: DatabaseAdapter) {
  const service = new RelatedService(new RelatedRepository(database));
  return {
    service,
    register: (routes: HttpRoutes) =>
      registerRelatedController(routes, service),
  };
}
