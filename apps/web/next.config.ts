import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const shared: NextConfig = {
  agentRules: false,
  transpilePackages: ['@ordo/core', '@ordo/client'],
};

/**
 * `next dev` proxies same-origin `/api/*` to the local API's `/v1/*`.
 * Every other phase builds a static export into `out/`; whatever serves
 * those files (the Worker in Phase 2, `npm run serve:export` locally) owns `/api`.
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER)
    return {
      ...shared,
      async rewrites() {
        return [
          {
            source: '/api/:path*',
            destination: `${process.env.ORDO_API_URL || 'http://127.0.0.1:4318'}/v1/:path*`,
          },
        ];
      },
    };
  return { ...shared, output: 'export' };
}
