import { Hono, type Context } from 'hono';
import { LinearRouter } from 'hono/router/linear-router';
import type { User } from '@ordo/core';
import {
  JSON_BODY_LIMIT,
  cookieValue,
  queryValues,
  type AgentContext,
  type HttpPipeline,
  type HttpReply,
  type HttpRequest,
  type RouteDefinition,
} from '../../platform/http/http.js';
import { errorEnvelope } from '../../platform/http/error-handler.js';
import { fail } from '../../platform/http/api-failure.js';

/** Reads the client address for the sign-in throttle. */
export type ClientAddress = (context: Context) => string | undefined;

/**
 * On Cloudflare the edge sets `CF-Connecting-IP` (clients cannot supply their
 * own); `wrangler dev` sets it locally. Without it every request shares one
 * throttle bucket.
 */
export const cloudflareClientAddress: ClientAddress = (context) =>
  context.req.header('cf-connecting-ip') || undefined;

export interface HonoHostOptions {
  clientAddress?: ClientAddress;
}

export interface HostedApp {
  /** The Hono app; the Worker serves `hono.fetch`, tests call `hono.request`. */
  readonly hono: Hono;
  /** Runs the pipeline's close hooks (database connection cleanup). */
  close(): Promise<void>;
}

/** Thrown for body problems; the error envelope maps `statusCode`. */
class BodyError extends Error {
  constructor(readonly statusCode: 400 | 413 | 415) {
    super('Request body rejected');
  }
}

class HonoHttpRequest implements HttpRequest {
  actor: User | null = null;
  agent: AgentContext | null = null;
  body: unknown = undefined;
  readonly method: string;
  readonly path: string;
  readonly query;
  readonly ip: string;

  constructor(
    private readonly context: Context,
    readonly params: Record<string, string>,
    clientAddress: ClientAddress | undefined,
  ) {
    const url = new URL(context.req.url);
    this.method = context.req.method;
    this.path = url.pathname;
    this.query = queryValues(url.searchParams);
    this.ip = (clientAddress ?? cloudflareClientAddress)(context) ?? 'unknown';
  }
  get signal() {
    return this.context.req.raw.signal;
  }
  header(name: string) {
    return this.context.req.header(name);
  }
  cookie(name: string) {
    return cookieValue(this.header('cookie'), name);
  }
}

class HonoHttpReply implements HttpReply {
  code = 200;
  readonly headers = new Headers();
  status(code: number) {
    this.code = code;
    return this;
  }
  header(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }
  setCookie(serialized: string) {
    this.headers.append('Set-Cookie', serialized);
    return this;
  }
  json(body: unknown) {
    this.headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status: this.code,
      headers: this.headers,
    });
  }
}

/** Reads a request body as bytes, refusing more than `limit` bytes. */
async function readBytes(request: Request, limit: number) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new BodyError(413);
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      for (const chunk of chunks) chunk.fill(0);
      value.fill(0);
      await reader.cancel().catch(() => undefined);
      throw new BodyError(413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }
  return bytes;
}

// Same protection as Fastify's secure JSON parsing: refuse prototype keys.
function safeJson(text: string) {
  try {
    return JSON.parse(text, (key, value) => {
      if (key === '__proto__') throw new BodyError(400);
      if (
        key === 'constructor' &&
        value &&
        typeof value === 'object' &&
        Object.prototype.hasOwnProperty.call(value, 'prototype')
      )
        throw new BodyError(400);
      return value;
    });
  } catch {
    throw new BodyError(400);
  }
}

/**
 * Parses the body the way the former Fastify host did: JSON (150,000 bytes,
 * or the route's own `jsonLimit`),
 * plain text, or a route's declared raw content types as bytes (with the
 * route's own limit). No content type means no body; others are 415.
 */
async function parseBody(raw: Request, route: RouteDefinition) {
  if (raw.method === 'GET' || raw.method === 'HEAD') return undefined;
  const contentType = raw.headers.get('content-type');
  if (!contentType) return undefined;
  const rawBody = route.options.rawBody;
  if (rawBody?.contentType.test(contentType))
    return readBytes(raw, rawBody.limit);
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (mediaType === 'application/json') {
    const bytes = await readBytes(
      raw,
      route.options.jsonLimit ?? JSON_BODY_LIMIT,
    );
    if (!bytes.length) throw new BodyError(400);
    return safeJson(new TextDecoder().decode(bytes));
  }
  if (mediaType === 'text/plain')
    return new TextDecoder().decode(await readBytes(raw, JSON_BODY_LIMIT));
  throw new BodyError(415);
}

/** Serves a framework-neutral pipeline with Hono. */
export function createHonoHost(
  pipeline: HttpPipeline,
  options: HonoHostOptions = {},
): HostedApp {
  // LinearRouter registers routes without compiling them, so a new isolate's
  // first request does not pay to build a matcher (Hono's default
  // SmartRouter compiles a RegExp router then). About 50 routes match fast
  // enough linearly.
  const hono = new Hono({ router: new LinearRouter() });
  const dispatch = async (context: Context, route?: RouteDefinition) => {
    const request = new HonoHttpRequest(
      context,
      route ? context.req.param() : {},
      options.clientAddress,
    );
    const reply = new HonoHttpReply();
    try {
      // Guards run first, before the body is read, as they always have.
      for (const guard of pipeline.guards) await guard(request, reply);
      if (!route) fail(404, 'NOT_FOUND', 'This route does not exist.');
      request.body = await parseBody(context.req.raw, route);
      const result = await route.handler(request, reply);
      for (const hook of pipeline.afterHooks) await hook(request, result);
      return reply.json(result);
    } catch (error) {
      const { status, body } = errorEnvelope(error);
      return reply.status(status).json(body);
    }
  };
  for (const route of pipeline.routes)
    hono.on(route.method, route.path, (context) => dispatch(context, route));
  hono.notFound((context) => dispatch(context));
  hono.onError((error, context) => {
    const { status, body } = errorEnvelope(error);
    return context.json(body, status as 500);
  });
  let closed: Promise<void> | undefined;
  return {
    hono,
    close: () =>
      (closed ??= (async () => {
        for (const hook of pipeline.closeHooks) await hook();
      })()),
  };
}
