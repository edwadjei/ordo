import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from 'next/constants';
import config, { defaultWorkerUrl } from '../next.config.ts';

test('production build is a static export without request-time rewrites', () => {
  const built = config(PHASE_PRODUCTION_BUILD);
  assert.equal(built.output, 'export');
  assert.equal(built.rewrites, undefined);
  assert.equal(built.headers, undefined);
  assert.equal(built.redirects, undefined);
});

test('dev server proxies same-origin /api to the local Worker', async () => {
  const dev = config(PHASE_DEVELOPMENT_SERVER);
  assert.equal(dev.output, undefined);
  const rewrites = await dev.rewrites!();
  assert.deepEqual(rewrites, [
    {
      source: '/api/:path*',
      destination: `${process.env.ORDO_API_URL || defaultWorkerUrl}/api/:path*`,
    },
  ]);
});

test('the default dev upstream is wrangler dev on 8788, not the old Node API', () => {
  assert.equal(defaultWorkerUrl, 'http://127.0.0.1:8788');
});
