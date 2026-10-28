/**
 * UTC time as ISO 8601 text (`YYYY-MM-DDTHH:MM:SS.sssZ`), the format every
 * timestamp column uses, so stored timestamps compare correctly as text.
 */
export const isoNow = (ms = Date.now()) => new Date(ms).toISOString();
