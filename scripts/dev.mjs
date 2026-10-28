// `npm run dev`: Ordo locally on the Worker. Prepares the local D1 database,
// then runs `wrangler dev` (the API and the last static export on
// 127.0.0.1:8788) beside `next dev` (hot-reloading web on 127.0.0.1:3358,
// proxying /api to the Worker). Local only: no Cloudflare account is used.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const workerUrl = 'http://127.0.0.1:8788';
const devVars = fileURLToPath(
  new URL('../apps/api/.dev.vars', import.meta.url),
);
const devVarsExample = fileURLToPath(
  new URL('../apps/api/.dev.vars.example', import.meta.url),
);
const webExport = fileURLToPath(new URL('../apps/web/out', import.meta.url));

if (!existsSync(devVars)) {
  copyFileSync(devVarsExample, devVars);
  console.log(
    '[ordo dev] Created apps/api/.dev.vars from the example (development mode, console sign-in codes).',
  );
}
if (!existsSync(webExport)) {
  // wrangler dev needs the assets directory to exist. Port 3358 is unaffected;
  // `npm run build --workspace @ordo/web` fills it for port 8788.
  mkdirSync(webExport, { recursive: true });
  console.log(
    '[ordo dev] apps/web/out is empty: use port 3358, or build the web app to serve it on 8788.',
  );
}

function run(args, options = {}) {
  return spawn(npm, args, { stdio: 'inherit', env: process.env, ...options });
}

// Applies any new migrations to the local D1 database. Stdin is not a
// terminal, so wrangler skips its confirmation prompt.
const migrate = run(['run', 'db:migrate:local', '--workspace', '@ordo/api'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
migrate.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
migrate.on('exit', (code) => {
  if (code) {
    console.error('[ordo dev] Local D1 migrations failed; not starting.');
    process.exitCode = code;
    return;
  }
  start();
});

function start() {
  const processes = [
    run(['run', 'dev', '--workspace', '@ordo/api']),
    run(['run', 'dev', '--workspace', '@ordo/web'], {
      env: { ...process.env, ORDO_API_URL: workerUrl },
    }),
  ];
  console.log(
    `[ordo dev] Web (hot reload): http://127.0.0.1:3358  Worker: ${workerUrl}`,
  );
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of processes) child.kill('SIGTERM');
    process.exitCode = code;
  }
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  for (const child of processes) {
    child.on('error', (error) => {
      console.error(error.message);
      stop(1);
    });
    child.on('exit', (code, signal) => {
      if (!stopping) stop(code || (signal ? 1 : 0));
    });
  }
}
