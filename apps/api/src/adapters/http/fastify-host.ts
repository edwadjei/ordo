import Fastify, {
  type FastifyReply,
  type FastifyRequest,
  type FastifyInstance,
} from 'fastify';
import type { User } from '@ordo/core';
import {
  JSON_BODY_LIMIT,
  cookieValue,
  queryValues,
  type HttpPipeline,
  type HttpReply,
  type HttpRequest,
} from '../../platform/http/http.js';
import { errorEnvelope } from '../../platform/http/error-handler.js';

class FastifyHttpRequest implements HttpRequest {
  actor: User | null = null;
  readonly path: string;
  readonly query;
  private readonly control = new AbortController();
  readonly signal = this.control.signal;

  constructor(private readonly raw: FastifyRequest) {
    const url = new URL(raw.url, 'http://ordo.invalid');
    this.path = raw.url.split('?')[0];
    this.query = queryValues(url.searchParams);
  }
  get method() {
    return this.raw.method;
  }
  get params() {
    return (this.raw.params ?? {}) as Record<string, string>;
  }
  get body() {
    return this.raw.body;
  }
  get ip() {
    return this.raw.ip;
  }
  header(name: string) {
    const value = this.raw.headers[name.toLowerCase()];
    return Array.isArray(value) ? value.join(', ') : value;
  }
  cookie(name: string) {
    return cookieValue(this.header('cookie'), name);
  }
  abort() {
    this.control.abort();
  }
}

class FastifyHttpReply implements HttpReply {
  constructor(private readonly raw: FastifyReply) {}
  status(code: number) {
    this.raw.code(code);
    return this;
  }
  header(name: string, value: string) {
    this.raw.header(name, value);
    return this;
  }
  setCookie(serialized: string) {
    this.raw.header('Set-Cookie', serialized);
    return this;
  }
}

/** Serves a framework-neutral pipeline with Fastify (temporary host). */
export function createFastifyHost(pipeline: HttpPipeline): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: JSON_BODY_LIMIT,
    trustProxy: false,
  });
  const requests = new WeakMap<FastifyRequest, FastifyHttpRequest>();
  const replies = new WeakMap<FastifyReply, FastifyHttpReply>();
  const neutral = (request: FastifyRequest, reply: FastifyReply) => {
    let httpRequest = requests.get(request);
    if (!httpRequest) {
      httpRequest = new FastifyHttpRequest(request);
      requests.set(request, httpRequest);
    }
    let httpReply = replies.get(reply);
    if (!httpReply) {
      httpReply = new FastifyHttpReply(reply);
      replies.set(reply, httpReply);
    }
    return { request: httpRequest, reply: httpReply };
  };

  app.setErrorHandler((error, _request, reply) => {
    const { status, body } = errorEnvelope(error);
    return reply.code(status).send(body);
  });
  app.addHook('onRequest', async (request, reply) => {
    const context = neutral(request, reply);
    for (const guard of pipeline.guards)
      await guard(context.request, context.reply);
  });
  for (const hook of pipeline.closeHooks) app.addHook('onClose', hook);

  const rawParsers = new Set<string>();
  for (const route of pipeline.routes) {
    const raw = route.options.rawBody;
    if (raw && !rawParsers.has(raw.contentType.source)) {
      rawParsers.add(raw.contentType.source);
      app.addContentTypeParser(
        raw.contentType,
        { parseAs: 'buffer', bodyLimit: raw.limit },
        (_request, body, done) => done(null, body),
      );
    }
    app.route({
      method: route.method,
      url: route.path,
      ...(raw ? { bodyLimit: raw.limit } : {}),
      handler: async (request, reply) => {
        const context = neutral(request, reply);
        // Client disconnect cancels in-flight work through request.signal.
        const abort = () => context.request.abort();
        const closed = () => {
          if (!reply.raw.writableEnded) context.request.abort();
        };
        request.raw.once('aborted', abort);
        reply.raw.once('close', closed);
        try {
          return await route.handler(context.request, context.reply);
        } finally {
          request.raw.off('aborted', abort);
          reply.raw.off('close', closed);
        }
      },
    });
  }
  return app;
}
