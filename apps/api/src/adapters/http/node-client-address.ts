import { getConnInfo } from '@hono/node-server/conninfo';
import type { ClientAddress } from './hono-host.js';

/**
 * Socket address of a request served by `@hono/node-server`. Requests
 * dispatched without a socket (tests calling `app.request()`) have none, and
 * share one sign-in throttle bucket. The Phase 2 Worker entry supplies its own
 * reader instead.
 */
export const nodeClientAddress: ClientAddress = (context) => {
  try {
    return getConnInfo(context).remote.address;
  } catch {
    return undefined;
  }
};
