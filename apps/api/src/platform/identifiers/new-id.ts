import { randomId } from './random.js';

// Web Crypto global: available in Node 22 and Cloudflare Workers alike.
export const newId = () => randomId();
