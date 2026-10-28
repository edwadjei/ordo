import type { HttpRequest } from './http.js';

export const SESSION_COOKIE = 'ordo_session';

export function readSession(request: HttpRequest) {
  const token = request.cookie(SESSION_COOKIE);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function sessionCookie(token: string, secure: boolean, clear = false) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 604800}${secure ? '; Secure' : ''}`;
}
