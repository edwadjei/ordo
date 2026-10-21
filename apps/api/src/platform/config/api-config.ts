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
  return {
    databaseUrl: environment.DATABASE_URL,
    dataDir: environment.ORDO_DATA_DIR ?? resolve(repositoryRoot, '.data/ordo'),
    secureCookies: production,
    trustedOrigins: environment.TRUSTED_ORIGINS?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? ['http://localhost:3318', 'http://127.0.0.1:3318'],
    port: Number(environment.API_PORT ?? 4318),
    host: '127.0.0.1',
  };
}
