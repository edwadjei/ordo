import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Every random value the API draws comes from here. Workers forbid random
 * values in global scope, so the startup warm-up (src/warm-up.ts) runs inside
 * `duringWarmUp`, where ids are fixed and bytes are zero. The scope is an
 * AsyncLocalStorage context: only the warm-up's own async chain sees it, and
 * a real request, which always runs outside it, gets real randomness however
 * the two interleave.
 */
const warmUp = new AsyncLocalStorage<true>();
const WARM_UP_ID = '00000000-0000-4000-8000-000000000000';

export function duringWarmUp<T>(work: () => T): T {
  return warmUp.run(true, work);
}

export const randomId = () =>
  warmUp.getStore() ? WARM_UP_ID : crypto.randomUUID();

export function fillRandom<T extends Uint8Array | Uint32Array>(array: T): T {
  return warmUp.getStore() ? array : crypto.getRandomValues(array);
}
