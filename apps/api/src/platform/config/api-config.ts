import { resolve } from 'node:path';

export function readApiConfig(
  environment: NodeJS.ProcessEnv,
  repositoryRoot: string,
) {
  const production = environment.NODE_ENV === 'production';
  if (production && (!environment.DATABASE_URL || !environment.TRUSTED_ORIGINS))
    throw new Error(
      'Production requires DATABASE_URL and TRUSTED_ORIGINS. Embedded local storage is development-only.',
    );
  // Sign-in codes are HMAC-hashed with this secret. Locally a generated key
  // file stands in; production must never fall back to one.
  if (production && !environment.OTP_HMAC_KEY?.trim())
    throw new Error('Production requires the OTP_HMAC_KEY secret.');
  if (
    environment.OTP_HMAC_KEY?.trim() &&
    !/^[a-fA-F0-9]{64}$/.test(environment.OTP_HMAC_KEY.trim())
  )
    throw new Error('OTP_HMAC_KEY must be 64 hexadecimal characters.');
  return {
    databaseUrl: environment.DATABASE_URL,
    dataDir: environment.ORDO_DATA_DIR ?? resolve(repositoryRoot, '.data/ordo'),
    secureCookies: production,
    trustedOrigins: environment.TRUSTED_ORIGINS?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? ['http://localhost:3318', 'http://127.0.0.1:3318'],
    otpHmacKey: environment.OTP_HMAC_KEY?.trim() || undefined,
    port: Number(environment.API_PORT ?? 4318),
    host: '127.0.0.1',
  };
}
