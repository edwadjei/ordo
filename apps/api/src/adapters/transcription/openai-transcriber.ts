import { Transcriber } from '../../capabilities/transcriber.contract.js';
const extensions: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};
export class OpenAiTranscriber extends Transcriber {
  constructor(
    private readonly apiKey: string,
    // Called unbound: Workers reject the global fetch called as a method.
    private readonly transport: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {
    super();
  }
  async transcribe(audio: Uint8Array, mimeType: string, signal?: AbortSignal) {
    const form = new FormData();
    form.set(
      'file',
      new Blob([new Uint8Array(audio)], { type: mimeType }),
      `recording.${extensions[mimeType] ?? 'webm'}`,
    );
    form.set('model', 'gpt-4o-mini-transcribe');
    form.set('response_format', 'json');
    const response = await this.transport(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
          : AbortSignal.timeout(60000),
      },
    );
    if (!response.ok)
      throw new Error(
        'Transcription provider could not process the recording.',
      );
    const result = (await response.json()) as { text?: unknown };
    if (typeof result.text !== 'string' || result.text.length > 200000)
      throw new Error('Transcription provider returned an invalid transcript.');
    return result.text;
  }
}
