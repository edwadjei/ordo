export abstract class Transcriber {
  abstract transcribe(
    audio: Uint8Array,
    mimeType: string,
    signal?: AbortSignal,
  ): Promise<string>;
}
