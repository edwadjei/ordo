import { createFastifyHost } from '../src/adapters/http/fastify-host.js';
import { HttpPipeline, type HttpRoutes } from '../src/platform/http/http.js';
import {
  createRequestSecurity,
  type RequestSecurityOptions,
} from '../src/platform/http/request-security.js';

/** A partial API with the platform guards and only the given modules. */
export async function guardedApp(
  security: RequestSecurityOptions,
  ...modules: { register(routes: HttpRoutes): void }[]
) {
  const http = new HttpPipeline();
  http.guard(createRequestSecurity(security));
  for (const module of modules) module.register(http);
  const app = createFastifyHost(http);
  await app.ready();
  return app;
}
