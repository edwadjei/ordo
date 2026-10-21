import type {
  CaptureRecord,
  CaptureStore,
} from '../../capabilities/capture-store.contract.js';
import type { Transcriber } from '../../capabilities/transcriber.contract.js';
import { fail } from '../../platform/http/api-failure.js';
import { newId } from '../../platform/identifiers/new-id.js';
export const maximumCaptureBytes = 20 * 1024 * 1024;
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
export class CapturesService {
  private active = new Set<string>();
  private uploading = new Set<string>();
  constructor(
    private readonly store: CaptureStore,
    private readonly transcriber?: Transcriber,
  ) {}
  get transcriptionAvailable() {
    return Boolean(this.transcriber);
  }
  async list(owner: string) {
    return Promise.all(
      (await this.store.list(owner)).map((row) => this.get(owner, row.id)),
    );
  }
  async get(owner: string, id: string) {
    const record = await this.store.get(owner, id);
    if (!record) fail(404, 'NOT_FOUND', 'Recording not found.');
    // A process restart interrupts synchronous work; the original audio stays retryable.
    if (
      record.status === 'transcribing' &&
      !this.active.has(`${owner}:${id}`)
    ) {
      record.status = 'recorded';
      record.updatedAt = new Date().toISOString();
      delete record.error;
      await this.store.update(owner, record);
    }
    return record;
  }
  async create(owner: string, mime: string, audio: Uint8Array) {
    const mimeType = mime.split(';')[0].trim().toLowerCase();
    if (!allowedTypes.has(mimeType))
      fail(415, 'UNSUPPORTED_AUDIO', 'This recording format is not supported.');
    if (!audio.length) fail(400, 'EMPTY_RECORDING', 'The recording is empty.');
    if (!matchesAudioHeader(mimeType, audio))
      fail(
        400,
        'INVALID_AUDIO',
        'The recording does not match its audio format.',
      );
    if (audio.length > maximumCaptureBytes)
      fail(413, 'PAYLOAD_TOO_LARGE', 'Recordings must be at most 20 MB.');
    if (this.uploading.has(owner))
      fail(
        409,
        'UPLOAD_IN_PROGRESS',
        'Wait for the current recording to save.',
      );
    this.uploading.add(owner);
    try {
      const existing = await this.store.list(owner);
      if (
        existing.length >= 100 ||
        existing.reduce((sum, row) => sum + row.size, 0) + audio.length >
          200 * 1024 * 1024
      )
        fail(409, 'CAPTURE_STORAGE_FULL', 'Recording storage is full.');
      const now = new Date().toISOString();
      const record: CaptureRecord = {
        id: newId(),
        status: 'recorded',
        mimeType,
        size: audio.length,
        createdAt: now,
        updatedAt: now,
      };
      await this.store.create(owner, record, audio);
      return record;
    } finally {
      this.uploading.delete(owner);
    }
  }
  async audio(owner: string, id: string) {
    const record = await this.get(owner, id);
    const audio = await this.store.audio(owner, id);
    if (!audio) fail(404, 'NOT_FOUND', 'Recording not found.');
    return { record, audio: Buffer.from(audio) };
  }
  async transcribe(owner: string, id: string) {
    const key = `${owner}:${id}`;
    if (this.active.has(key))
      fail(
        409,
        'TRANSCRIPTION_IN_PROGRESS',
        'This recording is already being transcribed.',
      );
    this.active.add(key);
    try {
      const record = await this.get(owner, id);
      if (record.status === 'transcribed') return record;
      if (!this.transcriber)
        fail(503, 'FEATURE_UNAVAILABLE', 'Transcription is coming soon.');
      const audio = await this.store.audio(owner, id);
      if (!audio) fail(404, 'NOT_FOUND', 'Recording not found.');
      record.status = 'transcribing';
      record.updatedAt = new Date().toISOString();
      delete record.error;
      await this.store.update(owner, record);
      try {
        const transcript = await this.transcriber.transcribe(
          audio,
          record.mimeType,
        );
        if (transcript.length > 200000)
          throw new Error('Transcript is too large');
        record.status = 'transcribed';
        record.transcript = transcript;
        record.updatedAt = new Date().toISOString();
        await this.store.update(owner, record);
        return record;
      } catch {
        record.status = 'failed';
        record.error =
          'Transcription failed. Your recording is saved; please retry.';
        record.updatedAt = new Date().toISOString();
        await this.store.update(owner, record);
        fail(502, 'TRANSCRIPTION_FAILED', record.error);
      }
    } finally {
      this.active.delete(key);
    }
  }
}
