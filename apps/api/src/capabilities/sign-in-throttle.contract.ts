/** Per-route, per-client limit on sign-in requests, shared by every Worker instance. */
export abstract class SignInThrottle {
  /** Counts one request; `false` when the client is over the limit. */
  abstract attempt(route: string, client: string): Promise<boolean>;
}
