/**
 * Local CPU benchmark for the main API routes. See bench/README.md.
 *
 *   npm run bench:cpu --workspace @ordo/api            # warm and cold
 *   npm run bench:cpu --workspace @ordo/api -- warm    # one of them
 *   npm run bench:cpu --workspace @ordo/api -- cold home
 *
 * It measures the real Worker bundle (`wrangler deploy --dry-run`, nothing is
 * uploaded) imported into Node and called through its own `fetch` handler,
 * so routing, configuration, the per-request Drizzle database and every
 * domain run exactly as on Cloudflare. D1 is `SqliteD1`, an in-process
 * stand-in on `node:sqlite`; its calls are synchronous, so the CPU spent
 * inside SQLite is timed exactly and subtracted, because on Cloudflare
 * queries run in D1, not in the Worker's CPU time. What remains is the
 * Worker's part: routing, guards, Web Crypto, Zod, Drizzle's SQL building
 * and row mapping, and JSON. Not counted: the binding's own (de)serialisation
 * of D1 results. Gatekeeper is a fake `fetch` and the text model is the
 * development fake, so nothing leaves the machine.
 *
 * Warm: one process serves every route repeatedly (a busy isolate).
 * Cold: each sample is a fresh process that imports the bundle and serves
 * one request (a new isolate, the common case with little traffic). V8
 * compiles functions on first use, so cold requests cost several times more.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unstable_splitSqlQuery } from 'wrangler';
import { migrationsDirectory } from '@ordo/db/migrations';
import { SqliteD1 } from './sqlite-d1.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const build = `${here}.build`;
// BENCH_BUNDLE=<folder with worker.js>: measure a prebuilt bundle (for
// example main's) instead of building this checkout.
const bundle = process.env.BENCH_BUNDLE ?? build;
const seeded = `${build}/seed.sqlite`;
const state = `${build}/seed.json`;
const origin = 'http://127.0.0.1:8788';
const sizes = { workspaces: 3, projects: 20, tasks: 300, notes: 100 };
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 40);
const COLD_SAMPLES = Number(process.env.BENCH_COLD_SAMPLES ?? 7);
const WARMUP = 5;

interface Seed {
  cookie: string;
  workspaceIds: string[];
  projectIds: string[];
  taskIds: string[];
  noteIds: string[];
}

// --- The Worker under test ------------------------------------------------
type WorkerModule = {
  default: {
    fetch(request: Request, env: Record<string, unknown>): Promise<Response>;
  };
};
let sqlite: SqliteD1;
let worker: WorkerModule['default'];
let env: Record<string, unknown>;
const codes: string[] = [];

async function loadWorker(databasePath: string) {
  sqlite = new SqliteD1(databasePath);
  env = {
    DB: sqlite,
    ASSETS: { fetch: () => new Response('asset') },
    ORDO_ENV: 'development',
    ORDO_FAKE_TEXT_AI: 'on',
    ORDO_WORKERS_AI: 'off',
    TRUSTED_ORIGINS: origin,
    OTP_HMAC_KEY: '0f'.repeat(32),
    ORDO_CREDENTIAL_KEY: '1e'.repeat(32),
    GATEKEEPER_API_KEY: 'fictional',
    GATEKEEPER_API_URL: 'https://gatekeeper.example.test',
  };
  // Gatekeeper is the only outbound fetch: answer it here, keep the code.
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    codes.push(
      /letter-spacing:8px;[^>]*>(\d{6})</.exec(String(init?.body))![1],
    );
    return Response.json({ success: true });
  }) as typeof fetch;
  const before = process.threadCpuUsage();
  worker = (
    (await import(pathToFileURL(`${bundle}/worker.js`).href)) as WorkerModule
  ).default;
  // The bundle warms its request paths at startup (src/warm-up.ts). In
  // workerd that finishes during startup; Node resolves Web Crypto on a
  // thread pool, so give it time to finish before any request is timed.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const used = process.threadCpuUsage(before);
  return (used.user + used.system) / 1000;
}

/** One request through the Worker's fetch handler; CPU in ms without SQLite. */
async function request(
  method: string,
  path: string,
  {
    body,
    headers = {},
  }: { body?: unknown; headers?: Record<string, string> } = {},
) {
  sqlite.sqliteMicros = 0;
  sqlite.calls = 0;
  const before = process.threadCpuUsage();
  const response = await worker.fetch(
    new Request(`${origin}/api${path}`, {
      method,
      headers: {
        origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  const text = await response.text();
  const used = process.threadCpuUsage(before);
  return {
    status: response.status,
    text,
    headers: response.headers,
    cpuMs: (used.user + used.system - sqlite.sqliteMicros) / 1000,
    d1Calls: sqlite.calls,
  };
}

let ip = 0;
const nextIp = () => `198.51.100.${(ip++ % 250) + 1}`;

// --- Seeding: fictional data at a realistic size --------------------------
async function seed() {
  mkdirSync(build, { recursive: true });
  if (!process.env.BENCH_BUNDLE)
    execFileSync(
      'npx',
      ['wrangler', 'deploy', '--dry-run', '--outdir', build],
      {
        stdio: 'ignore',
      },
    );
  rmSync(seeded, { force: true });
  await loadWorker(seeded);
  const d1 = sqlite as unknown as D1Database;
  for (const name of (await readdir(migrationsDirectory)).sort())
    if (/^\d{4}_[\w-]+\.sql$/.test(name))
      await d1.batch(
        unstable_splitSqlQuery(
          await readFile(new URL(name, migrationsDirectory), 'utf8'),
        ).map((sql) => d1.prepare(sql)),
      );
  const asked = await request('POST', '/auth/otp/request', {
    body: { contact: 'bench-owner@example.test' },
    headers: { 'cf-connecting-ip': nextIp() },
  });
  const verified = await request('POST', '/auth/otp/verify', {
    body: {
      challengeId: JSON.parse(asked.text).challengeId,
      code: codes.at(-1),
      displayName: 'Bench Fiction',
    },
    headers: { 'cf-connecting-ip': nextIp() },
  });
  if (verified.status !== 200)
    throw new Error(`Sign-in failed: ${verified.text}`);
  const cookie = verified.headers.getSetCookie()[0].split(';')[0];
  const owner = JSON.parse(verified.text).user.id as string;
  const words =
    'launch vendor pricing review checklist venue supplier contract budget meeting follow agenda design rollout timeline'.split(
      ' ',
    );
  const text = (length: number, seed: number) => {
    let out = '';
    for (let i = 0; out.length < length; i++)
      out += `${words[(seed * 7 + i * 13) % words.length]}${i % 12 === 11 ? '.\n' : ' '}`;
    return out.slice(0, length);
  };
  const id = () => crypto.randomUUID();
  const seedData: Seed = {
    cookie,
    workspaceIds: Array.from({ length: sizes.workspaces }, id),
    projectIds: Array.from({ length: sizes.projects }, id),
    taskIds: [],
    noteIds: [],
  };
  const { workspaceIds, projectIds, taskIds, noteIds } = seedData;
  const run = (sql: string, ...values: unknown[]) =>
    sqlite.db.prepare(sql).run(...(values as never[]));
  sqlite.db.exec('BEGIN');
  workspaceIds.forEach((w, i) =>
    run(
      "INSERT INTO workspaces (id, owner_user_id, name, color) VALUES (?, ?, ?, '#577664')",
      w,
      owner,
      `Workspace ${i + 1}`,
    ),
  );
  projectIds.forEach((p, i) =>
    run(
      'INSERT INTO projects (id, owner_user_id, workspace_id, name, description, aliases) VALUES (?, ?, ?, ?, ?, ?)',
      p,
      owner,
      workspaceIds[i % sizes.workspaces],
      `Project ${i + 1}`,
      text(300, i),
      JSON.stringify([`Alias ${i + 1}`]),
    ),
  );
  for (let i = 0; i < sizes.tasks; i++) {
    const t = id();
    taskIds.push(t);
    run(
      `INSERT INTO tasks (id, owner_user_id, workspace_id, project_id, parent_id, title, description, status, priority, due_date, responsible_person, waiting_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t,
      owner,
      workspaceIds[(i % sizes.projects) % sizes.workspaces],
      projectIds[i % sizes.projects],
      // Every tenth task is a subtask of the one before it.
      i % 10 === 9 ? taskIds[i - 1] : null,
      `Task ${i + 1}: ${text(60, i)}`,
      text(i % 3 === 0 ? 600 : 80, i),
      ['todo', 'in_progress', 'waiting', 'done'][i % 4],
      ['low', 'medium', 'high', null][i % 4],
      `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
      i % 5 === 0 ? 'Ama' : null,
      i % 4 === 2 ? 'Kofi' : null,
    );
  }
  // Notes of 1,000 to 20,000 characters: about 1 MB of note text in all.
  for (let i = 0; i < sizes.notes; i++) {
    const n = id();
    noteIds.push(n);
    run(
      'INSERT INTO notes (id, owner_user_id, workspace_id, project_id, title, body, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      n,
      owner,
      workspaceIds[(i % sizes.projects) % sizes.workspaces],
      projectIds[i % sizes.projects],
      `Meeting notes ${i + 1}`,
      text(1000 + ((i * 1900) % 19000), i),
      ['manual', 'recording', 'email', 'transcript'][i % 4],
    );
  }
  sqlite.db.exec('COMMIT');
  sqlite.db.close();
  writeFileSync(state, JSON.stringify(seedData));
}

// --- Routes ---------------------------------------------------------------
type Result = Awaited<ReturnType<typeof request>>;
function routes(data: Seed): Record<string, () => Promise<Result>> {
  const auth = { cookie: data.cookie };
  const revisions = new Map<string, number>();
  const revision = async (kind: 'tasks' | 'notes', id: string) => {
    if (!revisions.has(id))
      revisions.set(
        id,
        Number(
          (
            sqlite.db
              .prepare(`SELECT revision FROM ${kind} WHERE id = ?`)
              .get(id) as {
              revision: number;
            }
          ).revision,
        ),
      );
    return revisions.get(id)!;
  };
  const longBody = 'Notes from the vendor pricing review. '.repeat(210);
  let seq = 0;
  const workspaceId = data.workspaceIds[0];
  const process = (note: string) =>
    request('POST', `/notes/${note}/process`, {
      headers: auth,
      body: { workspaceId },
    });
  return {
    'GET /home': () => request('GET', '/home', { headers: auth }),
    'GET /auth/me': () => request('GET', '/auth/me', { headers: auth }),
    'POST /tasks': () =>
      request('POST', '/tasks', {
        headers: { ...auth, 'idempotency-key': crypto.randomUUID() },
        body: {
          title: `Bench task ${seq++}`,
          workspaceId,
          projectId: data.projectIds[0],
          dueDate: '2026-11-30',
        },
      }),
    'PATCH /tasks/:id': async () => {
      const id = data.taskIds[0];
      const expectedRevision = await revision('tasks', id);
      const result = await request('PATCH', `/tasks/${id}`, {
        headers: auth,
        body: { title: `Renamed ${seq++}`, expectedRevision },
      });
      revisions.set(id, expectedRevision + 1);
      return result;
    },
    'POST /notes': () =>
      request('POST', '/notes', {
        headers: auth,
        body: { title: `Bench note ${seq++}`, body: longBody },
      }),
    'PATCH /notes/:id': async () => {
      const id = data.noteIds[50];
      const expectedRevision = await revision('notes', id);
      const result = await request('PATCH', `/notes/${id}`, {
        headers: auth,
        body: { body: `${longBody} ${seq++}`, expectedRevision },
      });
      revisions.set(id, expectedRevision + 1);
      return result;
    },
    'GET /search': () =>
      request('GET', '/search?q=vendor%20pricing', { headers: auth }),
    'POST /auth/otp/request': () =>
      request('POST', '/auth/otp/request', {
        body: { contact: `bench-${seq++}-${Math.random()}@example.test` },
        headers: { 'cf-connecting-ip': nextIp() },
      }),
    // Preceded by its code request, which warms the shared sign-in code.
    'POST /auth/otp/verify': async () => {
      const asked = await request('POST', '/auth/otp/request', {
        body: { contact: `bench-${seq++}-${Math.random()}@example.test` },
        headers: { 'cf-connecting-ip': nextIp() },
      });
      return request('POST', '/auth/otp/verify', {
        body: {
          challengeId: JSON.parse(asked.text).challengeId,
          code: codes.at(-1),
        },
        headers: { 'cf-connecting-ip': nextIp() },
      });
    },
    'POST /notes/:id/process': () => process(data.noteIds[seq++ % sizes.notes]),
    // Preceded by its process request, which warms the shared capture code.
    'POST /capture-runs/:id/save': async () => {
      const run = JSON.parse(
        (await process(data.noteIds[seq++ % sizes.notes])).text,
      );
      return request('POST', `/capture-runs/${run.id}/save`, {
        headers: { ...auth, 'idempotency-key': crypto.randomUUID() },
        body: {
          workspaceId,
          tasks: run.suggestions.tasks,
          drafts: run.suggestions.drafts,
        },
      });
    },
  };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const check = (name: string, result: Result) => {
  if (result.status >= 400)
    throw new Error(
      `${name} returned ${result.status}: ${result.text.slice(0, 200)}`,
    );
  return result;
};
const filters = (args: string[]) => (name: string) =>
  !args.length || args.some((filter) => name.includes(filter));

async function warm(args: string[]) {
  const copy = `${build}/warm.sqlite`;
  copyFileSync(seeded, copy);
  await loadWorker(copy);
  const data = JSON.parse(readFileSync(state, 'utf8')) as Seed;
  const all = routes(data);
  console.log(
    `\nWarm: one process, ${ITERATIONS} runs per route after ${WARMUP} warm-up runs.\n`,
  );
  console.log(
    '| Route | Median | p90 | Max | D1 calls |\n|---|---|---|---|---|',
  );
  for (const [name, run] of Object.entries(all).filter(([n]) =>
    filters(args)(n),
  )) {
    const samples: number[] = [];
    let last: Result | undefined;
    for (let i = 0; i < WARMUP + ITERATIONS; i++) {
      last = check(name, await run());
      if (i >= WARMUP) samples.push(last.cpuMs);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const size =
      name === 'GET /home'
        ? ` (${Math.round(last!.text.length / 1024)} KiB)`
        : '';
    console.log(
      `| ${name}${size} | ${median(samples).toFixed(1)} | ${sorted[Math.floor(sorted.length * 0.9)].toFixed(1)} | ${sorted.at(-1)!.toFixed(1)} | ${last!.d1Calls} |`,
    );
  }
}

/** Runs in a child process: a fresh "isolate" serving one request. */
async function coldOne(name: string) {
  const copy = `${build}/cold-${process.pid}.sqlite`;
  copyFileSync(seeded, copy);
  try {
    const startup = await loadWorker(copy);
    const data = JSON.parse(readFileSync(state, 'utf8')) as Seed;
    const all = routes(data);
    const run = all[name];
    // BENCH_PROFILE=<file>: a V8 CPU profile of this one cold request.
    const profile = process.env.BENCH_PROFILE;
    const session = profile
      ? new (await import('node:inspector')).Session()
      : undefined;
    const post = (method: string, params?: object) =>
      new Promise<unknown>((resolve, reject) =>
        (
          session!.post as (
            m: string,
            p: object | undefined,
            cb: (e: Error | null, r: unknown) => void,
          ) => void
        )(method, params, (error, result) =>
          error ? reject(error) : resolve(result),
        ),
      );
    if (session) {
      session.connect();
      await post('Profiler.enable');
      await post('Profiler.setSamplingInterval', { interval: 50 });
      await post('Profiler.start');
    }
    // An idle Mac moves the process to a slow core or clock, which would
    // inflate the one request we time; keep the CPU busy just before it.
    const until = performance.now() + 100;
    let spin = 0;
    while (performance.now() < until) spin += Math.sqrt(spin + 1);
    await new Promise((resolve) => setImmediate(resolve, spin));
    const result = check(name, await run());
    if (session)
      writeFileSync(
        profile!,
        JSON.stringify(
          ((await post('Profiler.stop')) as { profile: unknown }).profile,
        ),
      );
    console.log(JSON.stringify({ startup, cpuMs: result.cpuMs }));
  } finally {
    rmSync(copy, { force: true });
  }
}

function cold(args: string[]) {
  const names = Object.keys(
    routes({
      workspaceIds: [],
      projectIds: [],
      taskIds: [],
      noteIds: [],
      cookie: '',
    }),
  ).filter(filters(args));
  console.log(
    `\nCold: each sample is a fresh process that imports the bundle and serves one request (${COLD_SAMPLES} samples).\n`,
  );
  console.log(
    '| Route | Median | Max | Startup: bundle and warm-up (median) |\n|---|---|---|---|',
  );
  for (const name of names) {
    const samples: { startup: number; cpuMs: number }[] = [];
    for (let i = 0; i < COLD_SAMPLES; i++) {
      const child = spawnSync(
        process.execPath,
        [
          '--no-warnings',
          '--import',
          'tsx',
          fileURLToPath(import.meta.url),
          'cold-one',
          name,
        ],
        { encoding: 'utf8' },
      );
      if (child.status !== 0) throw new Error(child.stderr);
      samples.push(JSON.parse(child.stdout.trim().split('\n').at(-1)!));
    }
    const cpu = samples.map((s) => s.cpuMs);
    console.log(
      `| ${name} | ${median(cpu).toFixed(1)} | ${Math.max(...cpu).toFixed(1)} | ${median(samples.map((s) => s.startup)).toFixed(1)} |`,
    );
  }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'cold-one') await coldOne(rest.join(' '));
else {
  if (!existsSync(state) || process.env.BENCH_RESEED !== '0') await seed();
  console.log(
    `CPU ms per request, without SQLite (${sizes.tasks} tasks, ${sizes.notes} notes, ${sizes.projects} projects).`,
  );
  if (mode !== 'cold')
    await warm(mode === 'warm' ? rest : mode ? [mode, ...rest] : []);
  if (mode !== 'warm')
    cold(mode === 'cold' ? rest : mode ? [mode, ...rest] : []);
}
