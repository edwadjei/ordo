import type { FastifyInstance } from 'fastify';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { NodePasswordHasher } from '../../adapters/cryptography/node-password-hasher.js';
import { NodeSessionTokens } from '../../adapters/cryptography/node-session-tokens.js';
import { IdentityRepository } from './identity.repository.js';
import { IdentityService } from './identity.service.js';
import { registerIdentityController } from './identity.controller.js';

export async function createIdentityModule(
  database: DatabaseAdapter,
  secureCookies: boolean,
) {
  const service = new IdentityService(
    new IdentityRepository(database),
    new NodePasswordHasher(),
    new NodeSessionTokens(),
  );
  await service.prepare();
  return {
    service,
    register: (app: FastifyInstance) =>
      registerIdentityController(app, service, secureCookies),
  };
}
