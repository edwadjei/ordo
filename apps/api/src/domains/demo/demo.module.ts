import type { FastifyInstance } from 'fastify';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import type { HomeService } from '../home/home.service.js';
import { DemoRepository } from './demo.repository.js';
import { DemoService } from './demo.service.js';
import { registerDemoController } from './demo.controller.js';

export function createDemoModule(database: DatabaseAdapter, home: HomeService) {
  const service = new DemoService(new DemoRepository(database), database, home);
  return {
    service,
    register: (app: FastifyInstance) => registerDemoController(app, service),
  };
}
