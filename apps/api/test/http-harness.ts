import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import {
  createHonoHost,
  type HostedApp,
} from '../src/adapters/http/hono-host.js';
import { nodeClientAddress } from '../src/adapters/http/node-client-address.js';
import { HttpPipeline, type HttpRoutes } from '../src/platform/http/http.js';
import {
  createRequestSecurity,
  type RequestSecurityOptions,
} from '../src/platform/http/request-security.js';

export type HttpMethods = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'HEAD';

export interface InjectOptions {
  method?: HttpMethods;
  url: string;
  headers?: Record<string, string>;
  /** An object is sent as JSON; bytes are sent as-is. */
  payload?: object | Uint8Array | string;
}

export interface InjectResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
  cookies: { name: string; value: string }[];
  json(): any;
}

/**
 * Test shim replacing Fastify's `app.inject`: requests go through Hono's
 * `app.request()` and come back in the shape the tests already use.
 */
export interface TestApp {
  inject(options: InjectOptions | string): Promise<InjectResponse>;
  ready(): Promise<void>;
  /** Serves the app on a real socket (for client-disconnect tests). */
  listen(options: { port: number; host: string }): Promise<string>;
  close(): Promise<void>;
}

export function testClient(hosted: HostedApp): TestApp {
  let server: ServerType | undefined;
  return {
    async inject(input) {
      const options = typeof input === 'string' ? { url: input } : input;
      const headers = new Headers(options.headers);
      let body: RequestInit['body'];
      if (options.payload instanceof Uint8Array)
        body = options.payload as Uint8Array<ArrayBuffer>;
      else if (typeof options.payload === 'string') body = options.payload;
      else if (options.payload !== undefined) {
        body = JSON.stringify(options.payload);
        if (!headers.has('content-type'))
          headers.set('content-type', 'application/json');
      }
      const response = await hosted.hono.request(options.url, {
        method: options.method ?? 'GET',
        headers,
        body,
      });
      const text = await response.text();
      const result: InjectResponse['headers'] = {};
      response.headers.forEach((value, name) => {
        if (name !== 'set-cookie') result[name] = value;
      });
      const setCookies = response.headers.getSetCookie();
      if (setCookies.length)
        result['set-cookie'] =
          setCookies.length === 1 ? setCookies[0] : setCookies;
      return {
        statusCode: response.status,
        body: text,
        headers: result,
        cookies: setCookies.map((cookie) => {
          const [pair] = cookie.split(';');
          const index = pair.indexOf('=');
          return { name: pair.slice(0, index), value: pair.slice(index + 1) };
        }),
        json: () => JSON.parse(text),
      };
    },
    async ready() {},
    listen({ port, host }) {
      return new Promise((resolve) => {
        server = serve(
          { fetch: hosted.hono.fetch, port, hostname: host },
          (info: AddressInfo) => resolve(`http://${host}:${info.port}`),
        );
      });
    },
    async close() {
      const listening = server;
      server = undefined;
      if (listening)
        await new Promise<void>((resolve) => listening.close(() => resolve()));
      await hosted.close();
    },
  };
}

/** A partial API with the platform guards and only the given modules. */
export async function guardedApp(
  security: RequestSecurityOptions,
  ...modules: { register(routes: HttpRoutes): void }[]
) {
  const http = new HttpPipeline();
  http.guard(createRequestSecurity(security));
  for (const module of modules) module.register(http);
  return testClient(createHonoHost(http, { clientAddress: nodeClientAddress }));
}
