import type { HttpRoutes } from './http.js';

export function registerHealth(routes: HttpRoutes) {
  routes.get('/health', () => ({ status: 'ok' }));
}
