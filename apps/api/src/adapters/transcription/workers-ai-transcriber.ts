import { Transcriber } from '../../capabilities/transcriber.contract.js';
import { ApiFailure } from '../../platform/http/api-failure.js';

export const workersAiModel = '@cf/openai/whisper-large-v3-turbo';

/** The part of the Worker's `AI` binding this adapter uses. */
export interface WorkersAiBinding {
  run(
    model: typeof workersAiModel,
    inputs: {
      audio: string | { body?: object; contentType?: string };
      task?: string;
    },
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

/** Shown when the account's daily Workers AI allowance is used up. */
export const allowanceUsedMessage =
  "Today's free transcription is used up; it resets at midnight UTC, or add an OpenAI key in Settings.";

export const workersAiUnavailableMessage =
  "Cloudflare transcription isn't available on this server. Add an OpenAI key in Settings to transcribe here.";

/**
 * Workers AI Whisper (`@cf/openai/whisper-large-v3-turbo`) through the `AI`
 * binding. The recording is passed as `{ body, contentType }` (the model's
 * documented alternative to a base64 string), streamed from the request
 * buffer, so the Worker never base64-encodes audio: encoding in JavaScript
 * costs about 4 ms of CPU per MiB, far beyond the Free plan's 10 ms budget
 * for a long recording. Inference time on Cloudflare's GPUs is not Worker CPU.
 */
export class WorkersAiTranscriber extends Transcriber {
  constructor(private readonly ai: WorkersAiBinding) {
    super();
  }
  async transcribe(audio: Uint8Array, mimeType: string, signal?: AbortSignal) {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(audio);
        controller.close();
      },
    });
    let result: unknown;
    try {
      result = await this.ai.run(
        workersAiModel,
        { audio: { body, contentType: mimeType }, task: 'transcribe' },
        {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
            : AbortSignal.timeout(60000),
        },
      );
    } catch (error) {
      throw workersAiFailure(error);
    }
    const text = transcriptText(result);
    if (typeof text !== 'string' || text.length > 200000)
      throw new Error('Workers AI returned an invalid transcript.');
    return text.trim();
  }
}

/**
 * The binding's typed output has `text` at the top level; the model page's
 * example nests it in `transcription_info`. Accept either.
 */
function transcriptText(result: unknown) {
  if (!result || typeof result !== 'object') return undefined;
  const value = result as {
    text?: unknown;
    transcription_info?: { text?: unknown };
  };
  return typeof value.text === 'string'
    ? value.text
    : value.transcription_info?.text;
}

/**
 * Maps Workers AI errors to specific API failures. The binding reports the
 * internal code in the error message (for example `3036: …`); see
 * https://developers.cloudflare.com/workers-ai/platform/errors/. Provider
 * messages are never passed on.
 */
export function workersAiFailure(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code = /\b(3036|3040|3006)\b/.exec(message)?.[1];
  if (code === '3036' || /daily free allocation/i.test(message))
    return new ApiFailure(
      429,
      'TRANSCRIPTION_ALLOWANCE_USED',
      allowanceUsedMessage,
    );
  if (code === '3040' || /capacity temporarily exceeded/i.test(message))
    return new ApiFailure(
      429,
      'TRANSCRIPTION_BUSY',
      'Cloudflare transcription is busy. Please retry shortly.',
    );
  // `wrangler dev --local`: the binding exists but cannot reach Cloudflare.
  if (/needs to be run remotely/i.test(message))
    return new ApiFailure(
      503,
      'WORKERS_AI_UNAVAILABLE',
      workersAiUnavailableMessage,
    );
  if (code === '3006')
    return new ApiFailure(
      413,
      'PAYLOAD_TOO_LARGE',
      'This recording is too large to transcribe. Record a shorter clip.',
    );
  return new Error('Workers AI could not process the recording.');
}
