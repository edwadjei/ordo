import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const shared: NextConfig = {
  agentRules: false,
  transpilePackages: ['@ordo/core', '@ordo/client'],
};

/** Where `next dev` forwards same-origin `/api/*`: the local `wrangler dev` Worker. */
export const defaultWorkerUrl = 'http://127.0.0.1:8788';

/**
 * `next dev` proxies same-origin `/api/*` unchanged to the Worker, which maps
 * it to the API's `/v1/*` exactly as it does for the static export it serves.
 * Every other phase builds a static export into `out/`, served by the Worker.
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER)
    return {
      ...shared,
      async rewrites() {
        return [
          {
            source: '/api/:path*',
            destination: `${process.env.ORDO_API_URL || defaultWorkerUrl}/api/:path*`,
          },
        ];
      },
    };
  return { ...shared, output: 'export' };
}
