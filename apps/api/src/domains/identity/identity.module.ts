import { OtpDelivery } from '../../capabilities/otp-delivery.contract.js';
import { GatekeeperOtpDelivery } from '../../adapters/gatekeeper/gatekeeper-otp-delivery.js';
import { NodeOtpSecrets } from '../../adapters/cryptography/node-otp-secrets.js';
import { OtpRepository } from './otp.repository.js';
import { OtpService } from './otp.service.js';
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
  options: { otpDelivery?: OtpDelivery; otpNow?: () => number } = {},
) {
  const service = new IdentityService(
    new IdentityRepository(database),
    new NodePasswordHasher(),
    new NodeSessionTokens(),
  );
  await service.prepare();
  const delivery =
    options.otpDelivery ??
    new GatekeeperOtpDelivery({
      apiKey: process.env.GATEKEEPER_API_KEY,
      apiUrl: process.env.GATEKEEPER_API_URL,
      emailHtml: process.env.GATEKEEPER_EMAIL_HTML !== 'false',
    });
  const otp = new OtpService(
    new OtpRepository(database),
    new NodePasswordHasher(),
    new NodeSessionTokens(),
    new NodeOtpSecrets(),
    delivery,
    options.otpNow,
  );
  return {
    service,
    register: (app: FastifyInstance) =>
      registerIdentityController(app, service, secureCookies, otp),
  };
}
