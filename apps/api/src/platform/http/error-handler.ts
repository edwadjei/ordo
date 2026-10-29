import { ZodError } from 'zod';
import { ApiFailure } from './api-failure.js';

export interface ErrorEnvelope {
  status: number;
  body: { error: { code: string; message: string } };
}

const envelope = (
  status: number,
  code: string,
  message: string,
): ErrorEnvelope => ({ status, body: { error: { code, message } } });

/**
 * True when SQLite refused a write on a foreign key. Every foreign key in
 * Ordo points at something only a permanent delete removes (a workspace,
 * project, note or task), so this means the write lost a race with one.
 * D1 reports it in the message, sometimes on a wrapped cause.
 */
function isForeignKeyFailure(error: unknown) {
  let cause = error;
  for (let depth = 0; cause && depth < 5; depth++) {
    if (/FOREIGN KEY constraint failed/i.test(String((cause as Error).message)))
      return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Maps any thrown value to Ordo's `{ error: { code, message } }` envelope.
 * Host adapters call this for every failure, so internal details never leak.
 * Hosts report body problems as errors carrying `statusCode` 400/413/415.
 */
export function errorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof ApiFailure)
    return envelope(error.status, error.code, error.message);
  if (error instanceof ZodError)
    return envelope(
      400,
      'INVALID_INPUT',
      'Check the required fields and their formats.',
    );
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;
  if (statusCode === 415)
    return envelope(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'This upload format is not supported.',
    );
  if (statusCode === 413)
    return envelope(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  if (statusCode === 400)
    return envelope(400, 'INVALID_INPUT', 'The request body is invalid.');
  // Nothing was written: the statement failed as a whole.
  if (isForeignKeyFailure(error))
    return envelope(
      409,
      'SCOPE_DELETED',
      'Something this change points to was just deleted. Reload and choose another destination.',
    );
  return envelope(
    500,
    'INTERNAL_ERROR',
    'The request could not be completed. Please retry.',
  );
}
