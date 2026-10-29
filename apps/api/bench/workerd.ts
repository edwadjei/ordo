/**
 * Cold CPU per request inside workerd itself, the runtime Cloudflare uses.
 * See bench/README.md ("Inside workerd").
 *
 *   npm run bench:workerd --workspace @ordo/api [-- <route filter>]
 *
 * For each sample it starts `wrangler dev --local` on a fresh isolate (port
 * 8829, inspector 9239, its own local D1 under bench/.build), lets the
 * startup warm-up finish, then profiles exactly one request through the
 * DevTools protocol. Each sample's CPU is the profile's non-idle time: the
 * Worker's JavaScript plus workerd's own JavaScript for bindings such as D1,
 * with SQLite (a separate process) and I/O waits left out. Data a route needs
 * (a ready capture run, a sign-in challenge) is written beforehand with
 * `wrangler d1 execute --local`, so no earlier request warms the path.
 * AI capture uses the development fake model (`ORDO_FAKE_TEXT_AI`): workerd
 * cannot reach Workers AI locally, and no real AI is called.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Node's built-in WebSocket is refused by wrangler's inspector proxy; ws is not.
import WebSocket from 'ws';

const here = fileURLToPath(new URL('.', import.meta.url));
// BENCH_COMPARE=<another checkout's apps/api>: alternate isolates of this
// checkout ("this") and that one ("other", for example main), so machine
// load falls on both alike.
const sides = [
  { name: 'this', api: fileURLToPath(new URL('..', import.meta.url)) },
  ...(process.env.BENCH_COMPARE
    ? [{ name: 'other', api: process.env.BENCH_COMPARE }]
    : []),
];
let api = sides[0].api;
let persist = '';
const port = 8829;
const inspector = 9239;
const origin = `http://127.0.0.1:${port}`;
const OTP_KEY = '0f'.repeat(32);
const SAMPLES = Number(process.env.BENCH_COLD_SAMPLES ?? 5);

let child: ChildProcess | undefined;
let log = '';

async function start() {
  log = '';
  child = spawn(
    'npx',
    [
      'wrangler',
      'dev',
      '--local',
      '--port',
      String(port),
      '--inspector-port',
      String(inspector),
      '--persist-to',
      persist,
      '--var',
      'ORDO_ENV:development',
      '--var',
      'ORDO_FAKE_TEXT_AI:on',
      '--var',
      `OTP_HMAC_KEY:${OTP_KEY}`,
      '--var',
      `TRUSTED_ORIGINS:${origin}`,
    ],
    { cwd: api, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout!.on('data', (chunk) => (log += chunk));
  child.stderr!.on('data', (chunk) => (log += chunk));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Let the startup warm-up finish before anything is measured.
  await new Promise((r) => setTimeout(r, 500));
}

async function stop() {
  if (!child) return;
  child.kill('SIGINT');
  await new Promise((r) => child!.once('exit', r));
  child = undefined;
}

function d1(sql: string) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'ordo',
      '--local',
      '--persist-to',
      persist,
      '--command',
      sql,
    ],
    { cwd: api, stdio: 'ignore' },
  );
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (response.status >= 400)
    throw new Error(
      `${method} ${path} → ${response.status} ${text.slice(0, 200)}`,
    );
  return { text, headers: response.headers };
}

/** One request profiled in the running isolate; returns its CPU in ms. */
async function profiled(run: () => Promise<unknown>) {
  const targets = (await (
    await fetch(`http://127.0.0.1:${inspector}/json`)
  ).json()) as {
    webSocketDebuggerUrl: string;
  }[];
  const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  let next = 1;
  const pending = new Map<number, (value: unknown) => void>();
  socket.on('message', (data) => {
    const message = JSON.parse(String(data));
    pending.get(message.id)?.(message.result);
  });
  const send = (method: string, params: object = {}) =>
    new Promise<unknown>((resolve) => {
      const id = next++;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 50 });
  await send('Profiler.start');
  await run();
  const { profile } = (await send('Profiler.stop')) as {
    profile: {
      nodes: { id: number; callFrame: { functionName: string; url: string } }[];
      samples: number[];
      timeDeltas: number[];
    };
  };
  socket.close();
  if (process.env.BENCH_PROFILE)
    (await import('node:fs')).writeFileSync(
      `${process.env.BENCH_PROFILE}-${Date.now()}.cpuprofile`,
      JSON.stringify(profile),
    );
  const nodes = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
  let cpu = 0;
  const byUrl = new Map<string, number>();
  profile.samples.forEach((id, i) => {
    const frame = nodes.get(id)!;
    if (frame.functionName === '(idle)') return;
    cpu += profile.timeDeltas[i];
    const where = frame.url
      ? frame.url.includes('worker.js') || frame.url.includes('.ts')
        ? 'ordo'
        : frame.url.split('/').pop()!
      : frame.functionName;
    byUrl.set(where, (byUrl.get(where) ?? 0) + profile.timeDeltas[i]);
  });
  return { cpu: cpu / 1000, byUrl };
}

type Route = {
  setup?: () => (() => Promise<unknown>) | void;
  run?: () => Promise<unknown>;
};

/** Seeds this side's own local D1 and returns its routes. */
async function prepare(): Promise<Record<string, Route>> {
  // --- Setup: a signed-in fictional account with long transcripts ---------
  const longText = (words: number) => {
    const speech =
      'we need to send the new copy to Ama by Friday and then ask Kofi about the quote for the site so that the team can plan the launch next week with the agency'.split(
        ' ',
      );
    return Array.from(
      { length: words },
      (_, i) => speech[(i * 13) % speech.length],
    ).join(' ');
  };

  persist = `${here}.build/workerd-d1-${sides.findIndex((side) => side.api === api)}`;
  rmSync(persist, { recursive: true, force: true });
  mkdirSync(persist, { recursive: true });
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'ordo',
      '--local',
      '--persist-to',
      persist,
    ],
    {
      cwd: api,
      stdio: 'ignore',
    },
  );
  await start();
  const asked = JSON.parse(
    (
      await call('POST', '/auth/otp/request', {
        contact: 'workerd-bench@example.test',
      })
    ).text,
  );
  await new Promise((r) => setTimeout(r, 300));
  const code = /\b(\d{6})\b(?![\s\S]*\b\d{6}\b)/.exec(log)?.[1];
  const verified = await call('POST', '/auth/otp/verify', {
    challengeId: asked.challengeId,
    code,
  });
  const cookie = verified.headers.getSetCookie()[0].split(';')[0];
  const owner = JSON.parse(verified.text).user.id as string;
  const auth = { cookie };
  const workspace = JSON.parse(
    (await call('POST', '/workspaces', { name: 'DAMSYN' }, auth)).text,
  );
  await call(
    'POST',
    '/projects',
    {
      name: 'Website Relaunch',
      workspaceId: workspace.id,
      aliases: ['site relaunch'],
    },
    auth,
  );
  const note2k = JSON.parse(
    (
      await call(
        'POST',
        '/notes',
        { title: '2,000 words', body: longText(2000), source: 'transcript' },
        auth,
      )
    ).text,
  );
  const note10k = JSON.parse(
    (
      await call(
        'POST',
        '/notes',
        { title: '10,000 words', body: longText(10000), source: 'transcript' },
        auth,
      )
    ).text,
  );
  const task = JSON.parse(
    (
      await call(
        'POST',
        '/tasks',
        { title: 'Bench task', workspaceId: workspace.id },
        { ...auth, 'idempotency-key': crypto.randomUUID() },
      )
    ).text,
  );
  await stop();

  // --- Routes: setup (untimed, before the isolate starts) and the request --
  let taskRevision = task.revision as number;
  let seq = 0;
  const routes: Record<string, Route> = {
    'GET /auth/me': { run: () => call('GET', '/auth/me', undefined, auth) },
    'GET /home': { run: () => call('GET', '/home', undefined, auth) },
    'POST /tasks': {
      run: () =>
        call(
          'POST',
          '/tasks',
          { title: `Bench ${seq++}`, workspaceId: workspace.id },
          { ...auth, 'idempotency-key': crypto.randomUUID() },
        ),
    },
    'PATCH /tasks/:id': {
      run: async () => {
        await call(
          'PATCH',
          `/tasks/${task.id}`,
          { title: `Renamed ${seq++}`, expectedRevision: taskRevision },
          auth,
        );
        taskRevision++;
      },
    },
    'POST /auth/otp/request': {
      run: () =>
        call('POST', '/auth/otp/request', {
          contact: `request-${seq++}-${Date.now()}@example.test`,
        }),
    },
    'POST /auth/otp/verify': {
      setup: () => {
        const challengeId = crypto.randomUUID();
        const hash = createHmac('sha256', Buffer.from(OTP_KEY, 'hex'))
          .update(`${challengeId}:123456`)
          .digest('hex');
        const now = new Date().toISOString();
        d1(
          `INSERT INTO otp_challenges (contact, challenge_id, code_hash, expires_at, next_send_at, window_started_at, requests, attempts, ready, consumed) VALUES ('verify-${Date.now()}@example.test', '${challengeId}', 'hmac-sha256:${hash}', '2999-01-01T00:00:00.000Z', '${now}', '${now}', 1, 0, 1, 0)`,
        );
        return () =>
          call('POST', '/auth/otp/verify', { challengeId, code: '123456' });
      },
    },
    'POST /notes/:id/process (2,000 words)': {
      run: () =>
        call(
          'POST',
          `/notes/${note2k.id}/process`,
          { workspaceId: workspace.id },
          auth,
        ),
    },
    'POST /notes/:id/process (10,000 words)': {
      run: () =>
        call(
          'POST',
          `/notes/${note10k.id}/process`,
          { workspaceId: workspace.id },
          auth,
        ),
    },
    'POST /capture-runs/:id/save (10 tasks, 2 drafts)': {
      setup: () => {
        const runId = crypto.randomUUID();
        const task = (i: number) => ({
          title: `Send the homepage copy to Ama for approval (${i})`,
          dueDate: '2026-10-30',
          dueTime: null,
          followUpDate: null,
          followUpTime: null,
          priority: null,
          responsiblePerson: null,
          waitingOn: i % 3 ? null : 'Yaw',
          isFollowUp: i % 3 === 0,
        });
        const draft = {
          kind: 'email',
          to: 'the design agency',
          subject: 'Final logo files',
          body: 'Hi,\n\nThank you for all your work on our new logo. Could you please send us the final logo files in all the formats you prepared?\n\nThanks again,',
        };
        const suggestions = {
          summary: 'A summary.',
          tasks: Array.from({ length: 10 }, (_, i) => ({
            key: `t${i + 1}`,
            ...task(i),
          })),
          drafts: [0, 1].map((i) => ({ key: `d${i + 1}`, ...draft })),
          destination: {
            workspaceId: workspace.id,
            projectId: null,
            confidence: 'low',
            reason: 'None named.',
          },
        };
        d1(
          `INSERT INTO capture_runs (id, owner_user_id, note_id, note_revision, workspace_id, status, provider, model, suggestions) VALUES ('${runId}', '${owner}', '${note2k.id}', 1, '${workspace.id}', 'ready', 'workers_ai', 'bench', '${JSON.stringify(suggestions).replaceAll("'", "''")}')`,
        );
        return () =>
          call(
            'POST',
            `/capture-runs/${runId}/save`,
            {
              workspaceId: workspace.id,
              tasks: Array.from({ length: 10 }, (_, i) => task(i)),
              drafts: [draft, draft],
            },
            { ...auth, 'idempotency-key': crypto.randomUUID() },
          );
      },
    },
  };

  return routes;
}

const filters = process.argv.slice(2);
const prepared: {
  name: string;
  api: string;
  persist: string;
  routes: Record<string, Route>;
}[] = [];
for (const side of sides) {
  api = side.api;
  prepared.push({ ...side, routes: await prepare(), persist });
}
console.log(
  `Cold CPU inside workerd (ms; ${SAMPLES} fresh isolates per route${prepared.length > 1 ? ' and side, alternating' : ''})\n`,
);
console.log(
  `| Route | ${prepared.map((p) => `${p.name} median | ${p.name} max`).join(' | ')} | Where (${prepared[0].name}, median sample) |\n|---|${prepared.map(() => '---|---|').join('')}---|`,
);
try {
  for (const name of Object.keys(prepared[0].routes)) {
    if (filters.length && !filters.some((f) => name.includes(f))) continue;
    const samples = prepared.map(
      () => [] as { cpu: number; byUrl: Map<string, number> }[],
    );
    for (let i = 0; i < SAMPLES; i++)
      for (const [index, side] of prepared.entries()) {
        api = side.api;
        persist = side.persist;
        const route = side.routes[name];
        const run = (route.setup?.() || route.run)!;
        await start();
        samples[index].push(await profiled(run));
        await stop();
      }
    const cells = samples.map((list) => {
      list.sort((a, b) => a.cpu - b.cpu);
      return list;
    });
    const mid = cells[0][Math.floor(cells[0].length / 2)];
    const where = [...mid.byUrl]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`)
      .join(', ');
    console.log(
      `| ${name} | ${cells
        .map(
          (list) =>
            `${list[Math.floor(list.length / 2)].cpu.toFixed(1)} | ${list.at(-1)!.cpu.toFixed(1)}`,
        )
        .join(' | ')} | ${where} |`,
    );
  }
} finally {
  await stop();
}
