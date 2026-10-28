import { fail } from './api-failure.js';

/** `409 REVISION_CONFLICT`: the record changed elsewhere; nothing was written. */
export function revisionConflict(): never {
  return fail(
    409,
    'REVISION_CONFLICT',
    'This item changed elsewhere. Reload it before saving your changes.',
  );
}

export function assertRevision(actual: number, expected: number) {
  if (actual !== expected) revisionConflict();
}
