import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { Transcriber } from '../../capabilities/transcriber.contract.js';
export class FfmpegDecoder {
  constructor(
    private readonly executable = '/opt/homebrew/bin/ffmpeg',
    private readonly launch: typeof spawn = spawn,
  ) {}
  async available() {
    try {
      await access(this.executable);
      return true;
    } catch {
      return false;
    }
  }
  decode(audio: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Audio decoding cancelled'));
        return;
      }
      const child = this.launch(
        this.executable,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-protocol_whitelist',
          'pipe',
          '-i',
          'pipe:0',
          '-ar',
          '16000',
          '-ac',
          '1',
          '-f',
          'wav',
          '-acodec',
          'pcm_s16le',
          'pipe:1',
        ],
        { stdio: ['pipe', 'pipe', 'ignore'] },
      );
      const chunks: Buffer[] = [];
      let size = 0,
        settled = false;
      const cleanup = () => {
        signal?.removeEventListener('abort', cancel);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        cleanup();
        for (const chunk of chunks) chunk.fill(0);
        reject(new Error('Audio decoding failed'));
      };
      const cancel = () => fail();
      signal?.addEventListener('abort', cancel, { once: true });
      child.on('error', fail);
      child.stdin?.on('error', fail);
      child.stdout?.on('data', (chunk: Buffer) => {
        if (settled) {
          chunk.fill(0);
          return;
        }
        size += chunk.length;
        if (size > 16 * 1024 * 1024) {
          chunk.fill(0);
          fail();
          return;
        }
        chunks.push(chunk);
      });
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0 || !size) {
          fail();
          return;
        }
        settled = true;
        cleanup();
        const result = Buffer.concat(chunks);
        for (const chunk of chunks) chunk.fill(0);
        resolve(result);
      });
      child.stdin?.end(audio);
    });
  }
}
export class LocalWhisperTranscriber extends Transcriber {
  private readonly base: string;
  constructor(
    base = 'http://127.0.0.1:4316',
    private readonly decoder = new FfmpegDecoder(),
    private readonly transport: typeof fetch = fetch,
  ) {
    super();
    const url = new URL(base);
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('Whisper must use a loopback server URL');
    this.base = url.origin;
  }
  async available() {
    if (!(await this.decoder.available())) return false;
    try {
      const response = await this.transport(`${this.base}/health`, {
        signal: AbortSignal.timeout(1500),
        redirect: 'error',
      });
      return (
        response.ok &&
        ((await response.json()) as { status?: unknown }).status === 'ok'
      );
    } catch {
      return false;
    }
  }
  async transcribe(audio: Uint8Array, _mimeType: string, signal?: AbortSignal) {
    const stop = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000);
    const wav = await this.decoder.decode(audio, stop);
    try {
      const form = new FormData();
      form.set(
        'file',
        new Blob([new Uint8Array(wav)], { type: 'audio/wav' }),
        'recording.wav',
      );
      form.set('response_format', 'json');
      form.set('language', 'en');
      const response = await this.transport(`${this.base}/inference`, {
        method: 'POST',
        body: form,
        signal: stop,
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Local transcription failed');
      const body = (await response.json()) as { text?: unknown };
      if (typeof body.text !== 'string' || body.text.length > 200000)
        throw new Error('Invalid local transcript');
      return body.text.trim();
    } finally {
      wav.fill(0);
    }
  }
}
