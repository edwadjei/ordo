import type { FastifyInstance } from 'fastify';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { SearchRepository } from './search.repository.js';
import { SearchService } from './search.service.js';
import { registerSearchController } from './search.controller.js';
export function createSearchModule(database: DatabaseAdapter) {
  const service = new SearchService(new SearchRepository(database));
  return {
    service,
    register: (app: FastifyInstance) => registerSearchController(app, service),
  };
}
