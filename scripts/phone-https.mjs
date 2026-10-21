import { createServer } from 'node:https';
import { request } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

const env = new URL('../.env', import.meta.url);
if (existsSync(env)) process.loadEnvFile(env);
const keyPath = process.env.ORDO_TLS_KEY;
const certPath = process.env.ORDO_TLS_CERT;
if (!keyPath || !certPath) {
  console.error(
    'Set ORDO_TLS_KEY and ORDO_TLS_CERT in .env to a certificate trusted by your phone. See docs/PHONE-TESTING.md.',
  );
  process.exit(1);
}
const port = Number(process.env.ORDO_HTTPS_PORT ?? 3443);
const server = createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (incoming, outgoing) => {
    // Fixed loopback upstream: this cannot become an open forward proxy.
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: 3318,
        path: incoming.url,
        method: incoming.method,
        headers: { ...incoming.headers, 'x-forwarded-proto': 'https' },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
        response.on('error', () => outgoing.destroy());
      },
    );
    upstream.setTimeout(120000, () => upstream.destroy());
    upstream.on('error', () => {
      if (!outgoing.headersSent)
        outgoing.writeHead(502, { 'Content-Type': 'text/plain' });
      outgoing.end(
        'Ordo is unavailable. Start the local web server and retry.',
      );
    });
    incoming.on('aborted', () => upstream.destroy());
    outgoing.on('close', () => upstream.destroy());
    incoming.pipe(upstream);
  },
);
server.requestTimeout = 120000;
server.listen(port, '0.0.0.0', () =>
  console.log(`Ordo phone HTTPS proxy listening on port ${port}.`),
);
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
