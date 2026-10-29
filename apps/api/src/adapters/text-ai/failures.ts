import { ApiFailure } from '../../platform/http/api-failure.js';

/** AI is switched off, out of allowance, or busy: the capture is kept for later. */
export const aiUnavailable = (code: string, message: string) =>
  new ApiFailure(503, code, message);

/** Maps a provider's HTTP status to a pending run (429, 5xx) or a failure. */
export function providerHttpFailure(provider: string, status: number) {
  if (status === 401 || status === 403)
    return new ApiFailure(
      503,
      'AI_KEY_REJECTED',
      `${provider} did not accept the saved key. Check it in Settings.`,
    );
  if (status === 429)
    return new ApiFailure(
      429,
      'AI_BUSY',
      `${provider} is busy or out of quota. Process this capture later.`,
    );
  if (status >= 500)
    return new ApiFailure(
      503,
      'AI_UNAVAILABLE',
      `${provider} is unavailable. Process this capture later.`,
    );
  return new Error(`${provider} could not process the capture.`);
}
