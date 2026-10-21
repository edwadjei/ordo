import { fail } from './api-failure.js';

export function assertRevision(actual: number, expected: number) {
  if (actual !== expected)
    fail(
      409,
      'REVISION_CONFLICT',
      'This item changed elsewhere. Reload it before saving your changes.',
    );
}
