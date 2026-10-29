import { createDatabase } from '@ordo/db';
import { composeApp } from './app.js';
import { DatabaseAdapter } from './adapters/database/database.adapter.js';
import { ordoSignInEmail } from './adapters/gatekeeper/ordo-sign-in-email.js';
import { DevelopmentTextModelProviders } from './adapters/text-ai/development-text-model.js';
import { OtpDelivery } from './capabilities/otp-delivery.contract.js';
import { errorEnvelope } from './platform/http/error-handler.js';
import {
  cookieValue,
  type HttpReply,
  type HttpRequest,
} from './platform/http/http.js';
import { duringWarmUp } from './platform/identifiers/random.js';

/**
 * Startup warm-up. V8 compiles each function the first time it runs, and a
 * new isolate's first requests used to pay for compiling the guards, Zod,
 * Drizzle and the domains: 10–20 ms of CPU against the Free plan's 10 ms
 * per request. Cloudflare limits a Worker's startup (global scope)
 * separately, at 1 second, so this runs the main request paths once while
 * the isolate starts.
 *
 * Global scope forbids I/O, timers, random values and even creating a
 * `Request` or `Response`, so the warm-up drives the framework-neutral
 * pipeline (guards, route handlers, the error envelope and JSON) with plain
 * request and reply objects, on a throwaway app whose database is
 * `WarmUpD1`: an in-memory stand-in that answers every query with one
 * made-up row and does no I/O. Nothing is read or written anywhere, no
 * message is sent, and randomness is fixed only inside this scope
 * (`duringWarmUp`). Only the thin Hono adapter stays cold. Every failure is
 * ignored: warming is an optimisation, never a dependency. Returns each
 * request's status (0 when it threw), so a test can check that the paths
 * still run through.
 */
export function warmUp(): Promise<number[]> {
  return duringWarmUp(async () => {
    const statuses: number[] = [];
    try {
      const pipeline = composeApp({
        database: new DatabaseAdapter(
          createDatabase(new WarmUpD1() as unknown as D1Database),
        ),
        trustedOrigins: [origin],
        secureCookies: true,
        otpDelivery: new WarmUpDelivery(),
        otpHmacKey: new Uint8Array(32),
        aiSettings: { providers: new DevelopmentTextModelProviders() },
      });
      for (const [method, path, body] of requests)
        statuses.push(await dispatch(pipeline, method, path, body));
    } catch {
      // Warming is best-effort.
    }
    return statuses;
  });
}

type Pipeline = ReturnType<typeof composeApp>;

/** Guards then the matching route, as the Hono host runs them. */
async function dispatch(
  pipeline: Pipeline,
  method: string,
  url: string,
  body?: object,
) {
  const [path, search = ''] = url.split('?');
  const headers: Record<string, string> = {
    origin,
    cookie: `ordo_session=${'0'.repeat(64)}`,
    'idempotency-key': 'warm-up',
  };
  let status = 200;
  const reply: HttpReply = {
    status(code) {
      status = code;
      return reply;
    },
    header: () => reply,
    setCookie: () => reply,
  };
  try {
    const route = pipeline.routes.find(
      (candidate) =>
        candidate.method === method && matches(candidate.path, path),
    );
    const request: HttpRequest = {
      method,
      path,
      params: route ? parameters(route.path, path) : {},
      query: Object.fromEntries(new URLSearchParams(search)),
      body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)),
      ip: '192.0.2.1',
      signal: new AbortController().signal,
      actor: null,
      header: (name) => headers[name.toLowerCase()],
      cookie: (name) => cookieValue(headers.cookie, name),
    };
    for (const guard of pipeline.guards) await guard(request, reply);
    if (!route) return 404;
    JSON.stringify(await route.handler(request, reply));
    return status;
  } catch (error) {
    const envelope = errorEnvelope(error);
    JSON.stringify(envelope.body);
    return envelope.status;
  }
}

const matches = (pattern: string, path: string) => {
  const a = pattern.split('/');
  const b = path.split('/');
  return (
    a.length === b.length &&
    a.every((part, i) => part[0] === ':' || part === b[i])
  );
};
const parameters = (pattern: string, path: string) => {
  const values = path.split('/');
  return Object.fromEntries(
    pattern
      .split('/')
      .flatMap((part, i) =>
        part[0] === ':' ? [[part.slice(1), values[i]]] : [],
      ),
  );
};

/** Builds the real sign-in email, then sends nothing. */
class WarmUpDelivery extends OtpDelivery {
  available() {
    return true;
  }
  async send(_contact: string, code: string) {
    JSON.stringify(ordoSignInEmail(code));
  }
}

const origin = 'https://warm-up.invalid';
const id = '00000000-0000-4000-8000-000000000001';
const task = { title: 'Warm-up', workspaceId: id, projectId: id };
const requests: [string, string, object?][] = [
  ['GET', '/v1/auth/me'],
  ['GET', '/v1/home'],
  ['GET', '/v1/capabilities'],
  ['GET', '/v1/search?q=warm'],
  ['POST', '/v1/tasks', { ...task, dueDate: '2026-01-01' }],
  ['PATCH', `/v1/tasks/${id}`, { title: 'Warm-up', expectedRevision: 1 }],
  ['POST', '/v1/notes', { ...task, body: 'Warm-up.' }],
  ['PATCH', `/v1/notes/${id}`, { body: 'Warm-up.', expectedRevision: 1 }],
  ['POST', '/v1/auth/otp/request', { contact: 'warm-up@example.invalid' }],
  ['POST', '/v1/auth/otp/verify', { challengeId: id, code: '000000' }],
  ['POST', `/v1/notes/${id}/process`, { workspaceId: id }],
  [
    'POST',
    `/v1/capture-runs/${id}/save`,
    { workspaceId: id, tasks: [{ title: 'Warm-up' }], drafts: [] },
  ],
  ['GET', '/v1/drafts'],
];

/**
 * A D1 binding that does no I/O: each query returns one row whose values are
 * picked from the column names, plausible enough for the request paths to
 * run through to the end.
 */
class WarmUpD1 {
  prepare(sql: string) {
    return new WarmUpStatement(sql);
  }
  async batch(statements: WarmUpStatement[]) {
    return statements.map((statement) => statement.result());
  }
  withSession() {
    return this;
  }
}

class WarmUpStatement {
  constructor(private readonly sql: string) {}
  bind() {
    return this;
  }
  private columns() {
    // No stored retry key: a create runs through to its insert.
    if (/^\s*select[\s\S]+from\s+"idempotency_keys"/i.test(this.sql)) return [];
    const select =
      /^\s*select\s+([\s\S]+?)\s+from\s/i.exec(this.sql)?.[1] ??
      /\sreturning\s+([\s\S]+)$/i.exec(this.sql)?.[1];
    return select ? splitColumns(select).map(columnName) : [];
  }
  private row() {
    return this.columns().map(sampleValue);
  }
  private hasRows() {
    return this.columns().length > 0;
  }
  result() {
    const columns = this.columns();
    return {
      success: true,
      meta: { changes: 1, last_row_id: 1 },
      results: columns.length
        ? [Object.fromEntries(columns.map((c) => [c, sampleValue(c)]))]
        : [],
    };
  }
  async raw() {
    return this.hasRows() ? [this.row()] : [];
  }
  async all() {
    return this.result();
  }
  async run() {
    return this.result();
  }
  async first() {
    return null;
  }
}

/** Splits a select list on top-level commas (subqueries keep theirs). */
function splitColumns(list: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts;
}

/** `"t"."id"`, `t.id AS id` or `count`: the name the row is keyed by. */
function columnName(expression: string) {
  return /"?(\w+)"?\s*$/.exec(expression.trim())?.[1] ?? '';
}

function sampleValue(name: string): unknown {
  // Raw queries alias columns in camelCase (`codeHash`).
  const column = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  if (column === 'id' || column.endsWith('_id'))
    return column === 'parent_id' ? null : id;
  if (column === 'revision' || column === 'note_revision') return 1;
  if (['deleted_at', 'completed_at', 'used_at', 'saved_at'].includes(column))
    return null;
  if (column === 'expires_at') return '2999-01-01T00:00:00.000Z';
  if (column.endsWith('_at')) return '2026-01-01T00:00:00.000Z';
  const values: Record<string, unknown> = {
    status: 'ready',
    aliases: '[]',
    favorite: 0,
    email: 'warm-up@example.invalid',
    timezone: 'UTC',
    title: 'Warm-up',
    name: 'Warm-up',
    body: 'Warm-up.',
    description: '',
    source: 'manual',
    origin: 'manual',
    kind: 'email',
    provider: 'workers_ai',
    text_provider: 'workers_ai',
    color: '#577664',
    count: 1,
    rank: 0,
    // HMAC-SHA256 of `<id>:000000` under the warm-up's all-zero key, so
    // the verify request runs through to issuing a session.
    code_hash:
      'hmac-sha256:b6b2969b8b1b9ef0d607df7ce6ab67be604b0857f5305b6f8943881e66df5881',
    attempts: 0,
    requests: 1,
    ready: 1,
    consumed: 0,
    contact: 'warm-up@example.invalid',
  };
  return column in values ? values[column] : null;
}
