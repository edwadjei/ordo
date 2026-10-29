import {
  TextModel,
  type TextModelRequest,
} from '../../capabilities/text-model.contract.js';
import { ApiFailure } from '../../platform/http/api-failure.js';

export const workersAiTextModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** The part of the Worker's `AI` binding the text adapter uses. */
export interface WorkersAiTextBinding {
  run(
    model: typeof workersAiTextModel,
    inputs: {
      messages: { role: 'system' | 'user'; content: string }[];
      response_format: { type: 'json_schema'; json_schema: object };
      max_tokens: number;
    },
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

// Published rates for this model, in neurons per million tokens. The daily
// free allowance is 10,000 neurons, shared with transcription.
const neuronsPerMillionInput = 26668;
const neuronsPerMillionOutput = 204805;

/**
 * Llama 3.3 70B (fp8, fast) on Workers AI, in JSON mode. Its context window
 * is 24,000 tokens shared by prompt and reply: 64,000 characters of note text
 * (about 18,000 tokens at 3.5 characters a token) leaves room for the
 * instructions, the project names and a 2,000-token reply.
 */
export class WorkersAiTextModel extends TextModel {
  readonly provider = 'workers_ai' as const;
  readonly model = workersAiTextModel;
  readonly maxInputCharacters = 64000;
  constructor(private readonly ai: WorkersAiTextBinding) {
    super();
  }
  async generate(request: TextModelRequest) {
    let result: unknown;
    try {
      result = await this.ai.run(
        workersAiTextModel,
        {
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          response_format: { type: 'json_schema', json_schema: request.schema },
          max_tokens: request.maxOutputTokens,
        },
        { signal: timeout(request.signal) },
      );
    } catch (error) {
      throw workersAiTextFailure(error);
    }
    const value = (result ?? {}) as {
      response?: unknown;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    const inputTokens = count(value.usage?.prompt_tokens);
    const outputTokens = count(value.usage?.completion_tokens);
    return {
      output:
        typeof value.response === 'string'
          ? JSON.parse(value.response)
          : value.response,
      usage: {
        inputTokens,
        outputTokens,
        neurons:
          inputTokens === null || outputTokens === null
            ? null
            : Math.ceil(
                (inputTokens * neuronsPerMillionInput +
                  outputTokens * neuronsPerMillionOutput) /
                  1_000_000,
              ),
      },
    };
  }
}

export function timeout(signal?: AbortSignal) {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
    : AbortSignal.timeout(60000);
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Maps Workers AI errors (the binding puts the internal code in the message,
 * for example `3036: …`) to a pending run or a failure. Provider messages are
 * never passed on.
 */
export function workersAiTextFailure(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code = /\b(3036|3040)\b/.exec(message)?.[1];
  if (code === '3036' || /daily free allocation/i.test(message))
    return new ApiFailure(
      429,
      'AI_ALLOWANCE_USED',
      "Today's built-in AI limit is used up; it resets at midnight UTC. Process this capture later, or add your own key in Settings.",
    );
  if (code === '3040' || /capacity temporarily exceeded/i.test(message))
    return new ApiFailure(
      429,
      'AI_BUSY',
      'Built-in AI is busy. Process this capture later.',
    );
  if (/needs to be run remotely/i.test(message))
    return new ApiFailure(
      503,
      'AI_UNAVAILABLE',
      "Built-in AI isn't available on this server.",
    );
  return new Error('Workers AI could not process the capture.');
}
