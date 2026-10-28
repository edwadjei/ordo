/**
 * Worker configuration from its bindings: plain `vars` and secrets
 * (`OTP_HMAC_KEY`, `ORDO_CREDENTIAL_KEY`, `GATEKEEPER_API_KEY`,
 * `GATEKEEPER_API_URL`). Locally, `wrangler dev` reads them from
 * `apps/api/.dev.vars`. Values are validated here and never logged.
 */
export interface WorkerVariables {
  ORDO_ENV?: string;
  TRUSTED_ORIGINS?: string;
  OTP_HMAC_KEY?: string;
  ORDO_CREDENTIAL_KEY?: string;
  GATEKEEPER_API_KEY?: string;
  GATEKEEPER_API_URL?: string;
  GATEKEEPER_SENDER_ID?: string;
  GATEKEEPER_EMAIL_HTML?: string;
}

export interface WorkerConfig {
  /** Only an explicit `ORDO_ENV=development` enables local-only behaviour. */
  development: boolean;
  trustedOrigins: string[];
  secureCookies: boolean;
  /** 64 hex characters; undefined only in development (an ephemeral key is used). */
  otpHmacKey?: string;
  /** 64 hex characters, or undefined when credential storage is off. */
  credentialKey?: string;
  gatekeeper: {
    apiKey?: string;
    apiUrl?: string;
    senderId?: string;
    emailHtml: boolean;
  };
}

const hexKey = /^[a-fA-F0-9]{64}$/;
export const localOrigins = [
  'http://127.0.0.1:8788',
  'http://localhost:8788',
  'http://127.0.0.1:3358',
  'http://localhost:3358',
];

export function readWorkerConfig(environment: WorkerVariables): WorkerConfig {
  const development = environment.ORDO_ENV?.trim() === 'development';
  const otpHmacKey = environment.OTP_HMAC_KEY?.trim() || undefined;
  if (otpHmacKey && !hexKey.test(otpHmacKey))
    throw new Error('OTP_HMAC_KEY must be 64 hexadecimal characters.');
  if (!otpHmacKey && !development)
    throw new Error('The OTP_HMAC_KEY secret is required.');
  const credentialKey = environment.ORDO_CREDENTIAL_KEY?.trim() || undefined;
  if (credentialKey && !hexKey.test(credentialKey))
    throw new Error('ORDO_CREDENTIAL_KEY must be 64 hexadecimal characters.');
  const trustedOrigins = environment.TRUSTED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!trustedOrigins?.length && !development)
    throw new Error('TRUSTED_ORIGINS is required outside development.');
  return {
    development,
    trustedOrigins: trustedOrigins?.length ? trustedOrigins : localOrigins,
    secureCookies: !development,
    otpHmacKey,
    credentialKey,
    gatekeeper: {
      apiKey: environment.GATEKEEPER_API_KEY?.trim() || undefined,
      apiUrl: environment.GATEKEEPER_API_URL?.trim() || undefined,
      senderId: environment.GATEKEEPER_SENDER_ID?.trim() || undefined,
      emailHtml: environment.GATEKEEPER_EMAIL_HTML !== 'false',
    },
  };
}
