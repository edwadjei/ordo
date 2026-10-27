// Serves the static export in apps/web/out and forwards same-origin /api/* to
// the local API's /v1/*, the way the Worker will in Phase 2. Local checks only.
import { createServer, request } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../out', import.meta.url));
const port = Number(process.env.WEB_PORT ?? 3318);
const upstream = new URL(process.env.ORDO_API_URL || 'http://127.0.0.1:4318');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function file(candidate) {
  try {
    return statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function serveStatic(pathname, response) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = '';
  }
  const target = path.resolve(root, '.' + decoded);
  const inside = target === root || target.startsWith(root + path.sep);
  const found =
    inside &&
    (file(path.join(target, 'index.html')) ||
      file(target) ||
      file(target + '.html'));
  const chosen = found || path.join(root, '404.html');
  response.writeHead(found ? 200 : 404, {
    'Content-Type': types[path.extname(chosen)] ?? 'application/octet-stream',
    'Cache-Control': chosen.includes(`${path.sep}_next${path.sep}static`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });
  createReadStream(chosen).pipe(response);
}

function proxy(incoming, outgoing, url) {
  const forwarded = request(
    {
      hostname: upstream.hostname,
      port: upstream.port,
      path: '/v1' + url.pathname.slice('/api'.length) + url.search,
      method: incoming.method,
      headers: { ...incoming.headers, host: upstream.host },
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    },
  );
  forwarded.on('error', () => {
    if (!outgoing.headersSent)
      outgoing.writeHead(502, { 'Content-Type': 'application/json' });
    outgoing.end(
      JSON.stringify({
        error: { code: 'API_UNAVAILABLE', message: 'The API is unavailable.' },
      }),
    );
  });
  outgoing.on('close', () => forwarded.destroy());
  incoming.pipe(forwarded);
}

const server = createServer((incoming, outgoing) => {
  const url = new URL(incoming.url ?? '/', 'http://localhost');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/'))
    return proxy(incoming, outgoing, url);
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
    outgoing.writeHead(405, { Allow: 'GET, HEAD' });
    return outgoing.end();
  }
  serveStatic(url.pathname, outgoing);
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Ordo static export on http://127.0.0.1:${port}, /api -> ${upstream.origin}/v1`,
  ),
);
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
