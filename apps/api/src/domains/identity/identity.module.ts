import { OtpDelivery } from '../../capabilities/otp-delivery.contract.js';
import { WebOtpSecrets } from '../../adapters/cryptography/web-otp-secrets.js';
import { OtpRepository } from './otp.repository.js';
import { OtpService } from './otp.service.js';
import type { HttpRoutes } from '../../platform/http/http.js';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import { WebSessionTokens } from '../../adapters/cryptography/web-session-tokens.js';
import { IdentityRepository } from './identity.repository.js';
import { IdentityService, IdentitySignInThrottle } from './identity.service.js';
import { registerIdentityController } from './identity.controller.js';

export interface IdentityOptions {
  /** Code transport: Gatekeeper, or the development-only console. */
  otpDelivery: OtpDelivery;
  /** The 32-byte `OTP_HMAC_KEY` secret. */
  otpHmacKey: Uint8Array;
  /** Clock for code expiry and the sign-in throttle (tests move it). */
  otpNow?: () => number;
}

export function createIdentityModule(
  database: DatabaseAdapter,
  secureCookies: boolean,
  options: IdentityOptions,
) {
  const sessionTokens = new WebSessionTokens();
  const repository = new IdentityRepository(database);
  const service = new IdentityService(repository, sessionTokens);
  const throttle = new IdentitySignInThrottle(
    repository,
    sessionTokens,
    options.otpNow,
  );
  const otpSecrets = new WebOtpSecrets(async () => options.otpHmacKey);
  const otp = new OtpService(
    new OtpRepository(database),
    sessionTokens,
    otpSecrets,
    options.otpDelivery,
    options.otpNow,
  );
  return {
    service,
    throttle,
    register: (routes: HttpRoutes) =>
      registerIdentityController(routes, service, secureCookies, otp),
  };
}
