export abstract class Transcriber {
  abstract transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}
