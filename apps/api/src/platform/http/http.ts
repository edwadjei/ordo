import type { User } from '@ordo/core';

// Framework-neutral HTTP surface. Controllers, modules and platform guards
// depend only on these types; a host adapter (adapters/http) maps a concrete
// framework onto them. Nothing under platform/ or domains/ imports a
// framework type.

/** Largest accepted JSON request body, in bytes. */
export const JSON_BODY_LIMIT = 150_000;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export type QueryValues = Record<string, string | string[]>;

export interface HttpRequest {
  readonly method: string;
  /** URL pathname without the query string, e.g. `/v1/tasks/…`. */
  readonly path: string;
  /** Route parameters such as `{ id }` from `/v1/tasks/:id`. */
  readonly params: Record<string, string>;
  /** Query values; a repeated key becomes an array. */
  readonly query: QueryValues;
  /** Parsed JSON for JSON routes, bytes for raw-body routes, else undefined. */
  readonly body: unknown;
  /** Remote address used by the sign-in throttle. */
  readonly ip: string;
  /** Aborted when the client disconnects before the response is sent. */
  readonly signal: AbortSignal;
  /** The signed-in user, set by the session guard on private routes. */
  actor: User | null;
  /** Case-insensitive request header. */
  header(name: string): string | undefined;
  cookie(name: string): string | undefined;
}

export interface HttpReply {
  status(code: number): HttpReply;
  header(name: string, value: string): HttpReply;
  /** Appends a serialized `Set-Cookie` value. */
  setCookie(serialized: string): HttpReply;
}

/** A handler returns the JSON response body; status and headers go on reply. */
export type HttpHandler = (
  request: HttpRequest,
  reply: HttpReply,
) => unknown | Promise<unknown>;

/** Runs before every request (including unknown routes) and before the body is read. */
export type RequestGuard = (
  request: HttpRequest,
  reply: HttpReply,
) => void | Promise<void>;

export interface RawBodyOptions {
  /** Content types accepted as raw bytes; anything else is 415. */
  contentType: RegExp;
  /** Largest accepted body in bytes; larger is 413. */
  limit: number;
}

export interface RouteOptions {
  rawBody?: RawBodyOptions;
}

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: HttpHandler;
  options: RouteOptions;
}

/** What a module's `register` receives: route registration and nothing else. */
export interface HttpRoutes {
  get(path: string, handler: HttpHandler): void;
  post(path: string, handler: HttpHandler, options?: RouteOptions): void;
  patch(path: string, handler: HttpHandler): void;
  delete(path: string, handler: HttpHandler): void;
}

/**
 * The application as data: guards, routes, and cleanup. A host adapter mounts
 * it on a framework, so the same pipeline can be served by any runtime.
 */
export class HttpPipeline implements HttpRoutes {
  readonly routes: RouteDefinition[] = [];
  readonly guards: RequestGuard[] = [];
  readonly closeHooks: (() => Promise<void>)[] = [];

  private add(
    method: HttpMethod,
    path: string,
    handler: HttpHandler,
    options: RouteOptions = {},
  ) {
    this.routes.push({ method, path, handler, options });
  }
  get(path: string, handler: HttpHandler) {
    this.add('GET', path, handler);
  }
  post(path: string, handler: HttpHandler, options?: RouteOptions) {
    this.add('POST', path, handler, options);
  }
  patch(path: string, handler: HttpHandler) {
    this.add('PATCH', path, handler);
  }
  delete(path: string, handler: HttpHandler) {
    this.add('DELETE', path, handler);
  }
  guard(guard: RequestGuard) {
    this.guards.push(guard);
  }
  onClose(hook: () => Promise<void>) {
    this.closeHooks.push(hook);
  }
}

/** Reads query values from a URL search string, keeping repeated keys. */
export function queryValues(search: URLSearchParams): QueryValues {
  const result: QueryValues = {};
  for (const [key, value] of search) {
    const existing = result[key];
    result[key] =
      existing === undefined
        ? value
        : Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
  }
  return result;
}

/** Reads one cookie value from a `Cookie` header. */
export function cookieValue(header: string | undefined, name: string) {
  return header
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
