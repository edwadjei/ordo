import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '@ordo/db';
import { buildApp } from './app.js';
import { readApiConfig } from './platform/config/api-config.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const environmentFile = resolve(repositoryRoot, '.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
const config = readApiConfig(process.env, repositoryRoot);
const connection = await openDatabase({
  url: config.databaseUrl,
  dataDir: config.dataDir,
});
const app = await buildApp({
  connection,
  secureCookies: config.secureCookies,
  trustedOrigins: config.trustedOrigins,
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
await app.listen({ host: config.host, port: config.port });
console.log(
  'Ordo API listening on loopback. No request content logging is enabled.',
);
