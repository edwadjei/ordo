import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '@ordo/db';
import { buildApp } from './app.js';

const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.DATABASE_URL || !process.env.TRUSTED_ORIGINS)) {
  throw new Error(
    'Production requires DATABASE_URL and TRUSTED_ORIGINS. Embedded local storage is development-only.',
  );
}
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const connection = await openDatabase({
  url: process.env.DATABASE_URL,
  dataDir: process.env.ORDO_DATA_DIR ?? resolve(repositoryRoot, '.data/ordo'),
});
const app = await buildApp({
  connection,
  secureCookies: production,
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',')
    .map((v) => v.trim())
    .filter(Boolean),
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await app.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await app.listen({
  host: '127.0.0.1',
  port: Number(process.env.API_PORT ?? 4318),
});
console.log(
  'Ordo API listening on loopback. No request content logging is enabled.',
);
