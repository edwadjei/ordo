import type { NextConfig } from 'next';
const config: NextConfig = {
  agentRules: false,
  transpilePackages: ['@ordo/core', '@ordo/client'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.ORDO_API_URL || 'http://127.0.0.1:4318'}/v1/:path*`,
      },
    ];
  },
};
export default config;
