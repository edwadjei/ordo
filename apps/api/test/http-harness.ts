import {
  createHonoHost,
  type HostedApp,
} from '../src/adapters/http/hono-host.js';
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
  /** Aborting it simulates the client disconnecting. */
  signal?: AbortSignal;
}

export interface InjectResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
  cookies: { name: string; value: string }[];
  json(): any;
}

/**
 * Test shim: requests go through Hono's `app.request()` and come back in the
 * `{ statusCode, body, headers, cookies, json() }` shape the tests use.
 */
export interface TestApp {
  inject(options: InjectOptions | string): Promise<InjectResponse>;
  close(): Promise<void>;
}

export async function toInjectResponse(
  response: Response,
): Promise<InjectResponse> {
  const text = await response.text();
  const result: InjectResponse['headers'] = {};
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') result[name] = value;
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length)
    result['set-cookie'] = setCookies.length === 1 ? setCookies[0] : setCookies;
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
}

export function requestInit(options: InjectOptions): RequestInit {
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
  return {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
  };
}

export function testClient(
  hosted: HostedApp,
  cleanup: () => Promise<void> = async () => {},
): TestApp {
  return {
    async inject(input) {
      const options = typeof input === 'string' ? { url: input } : input;
      return toInjectResponse(
        await hosted.hono.request(options.url, requestInit(options)),
      );
    },
    async close() {
      await hosted.close();
      await cleanup();
    },
  };
}

/** A partial API with the platform guards and only the given modules. */
export function guardedApp(
  security: RequestSecurityOptions,
  ...modules: { register(routes: HttpRoutes): void }[]
) {
  const http = new HttpPipeline();
  http.guard(createRequestSecurity(security));
  for (const module of modules) module.register(http);
  return testClient(createHonoHost(http));
}
