import { spawn } from 'node:child_process';
import { access, constants, existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const environmentFile = new URL('../.env', import.meta.url);
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
const binary =
  process.env.ORDO_WHISPER_BIN ?? '/opt/homebrew/bin/whisper-server';
const model =
  process.env.ORDO_WHISPER_MODEL ??
  resolve(homedir(), '.cache/whisper/ggml-base.en.bin');
const origin = new URL(process.env.ORDO_WHISPER_URL ?? 'http://127.0.0.1:4316');
if (
  origin.protocol !== 'http:' ||
  origin.hostname !== '127.0.0.1' ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
) {
  throw new Error(
    'The managed Whisper server requires an http://127.0.0.1 origin.',
  );
}
await promisify(access)(binary, constants.X_OK);
await promisify(access)(model, constants.R_OK);
const existing = await fetch(`${origin.origin}/health`, {
  signal: AbortSignal.timeout(1000),
})
  .then(
    async (response) => response.ok && (await response.json()).status === 'ok',
  )
  .catch(() => false);
if (existing) {
  console.log('Local Whisper is already ready.');
  process.exit(0);
}
// Never enable --convert: it writes audio files. Decoder input/output use memory pipes.
// Suppress native output so transcripts never become terminal or file logs.
const child = spawn(
  binary,
  [
    '--host',
    '127.0.0.1',
    '--port',
    origin.port || '80',
    '--model',
    model,
    '--no-timestamps',
  ],
  { stdio: 'ignore' },
);
let stopped = false;
const stop = () => {
  stopped = true;
  child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('error', () => {
  console.error(
    'Could not launch local Whisper. Check binary/model configuration.',
  );
  process.exitCode = 1;
});
child.on('exit', (code) => {
  stopped = true;
  if (code && !process.exitCode) process.exitCode = code;
});
for (let attempt = 0; attempt < 60 && !stopped; attempt++) {
  const ready = await fetch(`${origin.origin}/health`, {
    signal: AbortSignal.timeout(1000),
  })
    .then(
      async (response) =>
        response.ok && (await response.json()).status === 'ok',
    )
    .catch(() => false);
  if (ready) {
    console.log(
      `Local Whisper ready on ${origin.origin}. Audio file conversion and transcript logging are disabled.`,
    );
    break;
  }
  if (attempt === 59) {
    console.error('Local Whisper did not become ready.');
    process.exitCode = 1;
    stop();
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
