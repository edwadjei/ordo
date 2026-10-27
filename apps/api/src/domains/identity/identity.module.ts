import { fileURLToPath } from 'node:url';
import { OtpDelivery } from '../../capabilities/otp-delivery.contract.js';
import { GatekeeperOtpDelivery } from '../../adapters/gatekeeper/gatekeeper-otp-delivery.js';
import { WebOtpSecrets } from '../../adapters/cryptography/web-otp-secrets.js';
import { localKeySource } from '../../adapters/secrets/local-key-file.js';
import { OtpRepository } from './otp.repository.js';
import { OtpService } from './otp.service.js';
import type { FastifyInstance } from 'fastify';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { NodePasswordHasher } from '../../adapters/cryptography/node-password-hasher.js';
import { WebSessionTokens } from '../../adapters/cryptography/web-session-tokens.js';
import { IdentityRepository } from './identity.repository.js';
import { IdentityService } from './identity.service.js';
import { registerIdentityController } from './identity.controller.js';

export interface IdentityOptions {
  otpDelivery?: OtpDelivery;
  otpNow?: () => number;
  /** 64 hex characters; defaults to the `OTP_HMAC_KEY` environment value. */
  otpHmacKey?: string;
  /** Local-only fallback key file used when no OTP key is configured. */
  otpKeyFile?: string;
}

export async function createIdentityModule(
  database: DatabaseAdapter,
  secureCookies: boolean,
  options: IdentityOptions = {},
) {
  const sessionTokens = new WebSessionTokens();
  // Legacy local password accounts only; Node scrypt never ships to a Worker.
  const legacyPasswords = new NodePasswordHasher();
  const service = new IdentityService(
    new IdentityRepository(database),
    legacyPasswords,
    sessionTokens,
  );
  await service.prepare();
  const delivery =
    options.otpDelivery ??
    new GatekeeperOtpDelivery({
      apiKey: process.env.GATEKEEPER_API_KEY,
      apiUrl: process.env.GATEKEEPER_API_URL,
      emailHtml: process.env.GATEKEEPER_EMAIL_HTML !== 'false',
    });
  const otpSecrets = new WebOtpSecrets(
    localKeySource(
      options.otpKeyFile ??
        fileURLToPath(
          new URL('../../../../../.data/secrets/otp-key', import.meta.url),
        ),
      options.otpHmacKey ?? process.env.OTP_HMAC_KEY,
      'Invalid OTP key configuration',
    ),
  );
  const otp = new OtpService(
    new OtpRepository(database),
    sessionTokens,
    otpSecrets,
    delivery,
    options.otpNow,
  );
  return {
    service,
    register: (app: FastifyInstance) =>
      registerIdentityController(app, service, secureCookies, otp),
  };
}
