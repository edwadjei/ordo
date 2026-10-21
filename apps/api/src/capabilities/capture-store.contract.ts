export interface CaptureRecord {
  id: string;
  status: 'recorded' | 'transcribing' | 'transcribed' | 'failed';
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  transcript?: string;
  error?: string;
}
export abstract class CaptureStore {
  abstract list(owner: string): Promise<CaptureRecord[]>;
  abstract get(owner: string, id: string): Promise<CaptureRecord | null>;
  abstract create(
    owner: string,
    record: CaptureRecord,
    audio: Uint8Array,
  ): Promise<void>;
  abstract update(owner: string, record: CaptureRecord): Promise<void>;
  abstract audio(owner: string, id: string): Promise<Uint8Array | null>;
}
