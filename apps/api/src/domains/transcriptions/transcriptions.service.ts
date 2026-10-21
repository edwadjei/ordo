import type { Transcriber } from '../../capabilities/transcriber.contract.js';
import { fail } from '../../platform/http/api-failure.js';
export const maximumAudioBytes = 20 * 1024 * 1024;
const allowedTypes = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
]);
function matchesAudioHeader(mime: string, audio: Uint8Array) {
  const bytes = Array.from(audio.slice(0, 12));
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  return mime === 'audio/webm'
    ? bytes.slice(0, 4).join(',') === '26,69,223,163'
    : mime === 'audio/mp4'
      ? text(4, 8) === 'ftyp'
      : mime === 'audio/ogg'
        ? text(0, 4) === 'OggS'
        : text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE';
}
export class TranscriptionsService {
  private activeOwners = new Set<string>();
  private readonly timeoutMs: number;
  constructor(
    private readonly transcriber?: Transcriber,
    timeoutMs = 65000,
    private readonly resolveProvider?: (
      owner: string,
      expectedProvider?: 'local_whisper' | 'openai',
    ) => Promise<Transcriber | undefined>,
  ) {
    this.timeoutMs = Math.max(1, Math.min(timeoutMs, 65000));
  }
  get transcriptionAvailable() {
    return Boolean(this.transcriber || this.resolveProvider);
  }
  async transcribe(
    owner: string,
    mime: string,
    audio: Uint8Array,
    signal?: AbortSignal,
    expectedProvider?: 'local_whisper' | 'openai',
  ): Promise<{ transcript: string }> {
    let active = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let onCancel: (() => void) | undefined;
    try {
      const mimeType = mime.split(';')[0].trim().toLowerCase();
      if (!allowedTypes.has(mimeType))
        fail(
          415,
          'UNSUPPORTED_AUDIO',
          'This recording format is not supported.',
        );
      if (!audio.length)
        fail(400, 'EMPTY_RECORDING', 'The recording is empty.');
      if (audio.length > maximumAudioBytes)
        fail(413, 'PAYLOAD_TOO_LARGE', 'Recordings must be at most 20 MB.');
      if (!matchesAudioHeader(mimeType, audio))
        fail(
          400,
          'INVALID_AUDIO',
          'The recording does not match its audio format.',
        );
      const transcriber =
        this.transcriber ??
        (await this.resolveProvider?.(owner, expectedProvider));
      if (!transcriber)
        fail(
          503,
          'FEATURE_UNAVAILABLE',
          'Configure audio transcription in Settings.',
        );
      if (signal?.aborted)
        return fail(
          499,
          'TRANSCRIPTION_CANCELLED',
          'Transcription was cancelled.',
        );
      if (this.activeOwners.has(owner))
        fail(
          409,
          'TRANSCRIPTION_IN_PROGRESS',
          'Wait for your current transcription to finish.',
        );
      if (this.activeOwners.size >= 2)
        fail(
          429,
          'TRANSCRIPTION_BUSY',
          'Transcription is busy. Please retry shortly.',
        );
      this.activeOwners.add(owner);
      active = true;
      try {
        const deadline = new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('Transcription timed out'));
          }, this.timeoutMs);
        });
        const cancelled = new Promise<never>((_resolve, reject) => {
          onCancel = () => {
            controller.abort();
            reject(new Error('Transcription cancelled'));
          };
          signal?.addEventListener('abort', onCancel, { once: true });
        });
        const transcript = await Promise.race([
          transcriber.transcribe(audio, mimeType, controller.signal),
          deadline,
          cancelled,
        ]);
        if (typeof transcript !== 'string' || transcript.length > 200000)
          throw new Error('Invalid transcript');
        return { transcript };
      } catch {
        return fail(
          502,
          'TRANSCRIPTION_FAILED',
          'Transcription failed. Please record again and retry.',
        );
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      if (onCancel) signal?.removeEventListener('abort', onCancel);
      controller.abort();
      if (active) this.activeOwners.delete(owner);
      // The request is temporary; do not retain audio after any outcome.
      audio.fill(0);
    }
  }
}
