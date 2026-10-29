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
import { createHmac } from 'node:crypto';
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
  owner: string;
  workspaceIds: string[];
  projectIds: string[];
  taskIds: string[];
  noteIds: string[];
  /** Transcripts of about 2,000 and 10,000 words, for capture processing. */
  longNotes: { words2k: string; words10k: string };
}

/**
 * The size of a real Workers AI reply (the first hosted run returned 526
 * output tokens): a summary, five tasks and an email draft. The binding
 * stub below returns it as a JSON string, so the Worker parses it.
 */
const modelReply = JSON.stringify({
  summary:
    'The team reviewed the website relaunch and hiring. The homepage copy still needs approval, the hosting quote is pending from Yaw, and a job description is due. A review meeting is planned for the 14th.',
  tasks: [
    [
      'Send the homepage copy to Ama for approval',
      '2026-10-30',
      null,
      null,
      null,
    ],
    ['Follow up with Yaw on the hosting quote', null, null, null, 'Yaw'],
    [
      'Draft the job description for the frontend developer role',
      '2026-11-04',
      null,
      'Kofi',
      null,
    ],
    [
      'Email the design agency for the final logo files',
      '2026-10-29',
      null,
      null,
      null,
    ],
    [
      'Book a review meeting for the site relaunch',
      '2026-11-14',
      '10:00',
      null,
      null,
    ],
  ].map(([title, dueDate, dueTime, responsiblePerson, waitingOn]) => ({
    title,
    dueDate,
    dueTime,
    followUpDate: waitingOn ? '2026-11-02' : null,
    followUpTime: null,
    priority: dueTime ? 'high' : null,
    responsiblePerson,
    waitingOn,
    isFollowUp: Boolean(waitingOn),
  })),
  drafts: [
    {
      kind: 'email',
      to: 'the design agency',
      subject: 'Final logo files',
      body: 'Hi,\n\nThank you for all your work on our new logo. We are very happy with how it turned out. Could you please send us the final logo files in all the formats you prepared, including the vector versions for print and the PNG versions for the web? It would help us finish the homepage before the relaunch.\n\nThanks again,',
    },
  ],
  destination: {
    projectRef: 'p1',
    confidence: 'high',
    reason: 'Names the site relaunch.',
  },
});
const OTP_KEY = '0f'.repeat(32);

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
    ORDO_WORKERS_AI: 'on',
    // Workers AI as the hosted Worker uses it, answered locally: no call.
    AI: {
      run: async () => ({
        response: modelReply,
        usage: { prompt_tokens: 3000, completion_tokens: 526 },
      }),
    },
    TRUSTED_ORIGINS: origin,
    OTP_HMAC_KEY: OTP_KEY,
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
  const vocabulary =
    'launch vendor pricing review checklist venue supplier contract budget meeting follow agenda design rollout timeline'.split(
      ' ',
    );
  const text = (length: number, seed: number) => {
    let out = '';
    for (let i = 0; out.length < length; i++)
      out += `${vocabulary[(seed * 7 + i * 13) % vocabulary.length]}${i % 12 === 11 ? '.\n' : ' '}`;
    return out.slice(0, length);
  };
  const id = () => crypto.randomUUID();
  // Spoken English averages under five letters a word, so 10,000 words
  // fit Workers AI's 64,000 characters, as a real transcript would.
  const speech =
    'we need to send the new copy to Ama by Friday and then ask Kofi about the quote for the site so that the team can plan the launch next week with the agency'.split(
      ' ',
    );
  const words = (count: number, seed: number) => {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      out.push(speech[(seed * 7 + i * 13) % speech.length]);
      if (i % 14 === 13) out[out.length - 1] += '.\n';
    }
    return out.join(' ');
  };
  const seedData: Seed = {
    cookie,
    owner,
    longNotes: { words2k: id(), words10k: id() },
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
  for (const [key, count] of [
    ['words2k', 2000],
    ['words10k', 10000],
  ] as const)
    run(
      'INSERT INTO notes (id, owner_user_id, workspace_id, title, body, source) VALUES (?, ?, ?, ?, ?, ?)',
      seedData.longNotes[key],
      owner,
      workspaceIds[0],
      `Transcript (${count} words)`,
      words(count, count),
      'transcript',
    );
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
    // A ready challenge is written straight into D1 (untimed), so verify is
    // measured on its own, cold or warm.
    'POST /auth/otp/verify': () => {
      const challengeId = crypto.randomUUID();
      const code = '123456';
      const hash = createHmac('sha256', Buffer.from(OTP_KEY, 'hex'))
        .update(`${challengeId}:${code}`)
        .digest('hex');
      sqlite.db
        .prepare(
          `INSERT INTO otp_challenges (contact, challenge_id, code_hash, expires_at, next_send_at, window_started_at, requests, attempts, ready, consumed)
           VALUES (?, ?, ?, '2999-01-01T00:00:00.000Z', ?, ?, 1, 0, 1, 0)`,
        )
        .run(
          `verify-${seq++}-${Math.random()}@example.test`,
          challengeId,
          `hmac-sha256:${hash}`,
          new Date().toISOString(),
          new Date().toISOString(),
        );
      return request('POST', '/auth/otp/verify', {
        body: { challengeId, code },
        headers: { 'cf-connecting-ip': nextIp() },
      });
    },
    'POST /notes/:id/process': () => process(data.noteIds[seq++ % sizes.notes]),
    'POST /notes/:id/process (2,000 words)': () =>
      process(data.longNotes.words2k),
    'POST /notes/:id/process (10,000 words)': () =>
      process(data.longNotes.words10k),
    // A ready run with 10 tasks and 2 drafts is written straight into D1
    // (untimed), then saved with all of them.
    'POST /capture-runs/:id/save (10 tasks, 2 drafts)': () => {
      const runId = crypto.randomUUID();
      const reply = JSON.parse(modelReply);
      const suggestions = {
        summary: reply.summary,
        tasks: Array.from({ length: 10 }, (_, i) => ({
          ...reply.tasks[i % 5],
          key: `t${i + 1}`,
          title: `${reply.tasks[i % 5].title} (${i + 1})`,
        })),
        drafts: [0, 1].map((i) => ({ ...reply.drafts[0], key: `d${i + 1}` })),
        destination: {
          workspaceId,
          projectId: null,
          confidence: 'low',
          reason: 'No project named.',
        },
      };
      sqlite.db
        .prepare(
          `INSERT INTO capture_runs (id, owner_user_id, note_id, note_revision, workspace_id, status, provider, model, suggestions)
           VALUES (?, ?, ?, 1, ?, 'ready', 'workers_ai', 'bench', ?)`,
        )
        .run(
          runId,
          data.owner,
          data.noteIds[0],
          workspaceId,
          JSON.stringify(suggestions),
        );
      const strip = <T extends { key: string }>({ key: _key, ...item }: T) =>
        item;
      return request('POST', `/capture-runs/${runId}/save`, {
        headers: { ...auth, 'idempotency-key': crypto.randomUUID() },
        body: {
          workspaceId,
          tasks: suggestions.tasks.map(strip),
          drafts: suggestions.drafts.map(strip),
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
    }
    // An idle Mac moves the process to a slow core or clock, which would
    // inflate the one request we time; keep the CPU busy just before it.
    const until = performance.now() + 100;
    let spin = 0;
    while (performance.now() < until) spin += Math.sqrt(spin + 1);
    await new Promise((resolve) => setImmediate(resolve, spin));
    if (session) await post('Profiler.start');
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
      owner: '',
      longNotes: { words2k: '', words10k: '' },
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
