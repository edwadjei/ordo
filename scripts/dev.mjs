import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const environmentFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

const processes = ['@ordo/api', '@ordo/web'].map((workspace) =>
  spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--workspace', workspace],
    {
      stdio: 'inherit',
      env: process.env,
    },
  ),
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
