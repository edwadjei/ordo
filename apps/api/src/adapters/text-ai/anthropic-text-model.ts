import {
  TextModel,
  type TextModelRequest,
} from '../../capabilities/text-model.contract.js';
import { ApiFailure } from '../../platform/http/api-failure.js';
import { providerHttpFailure } from './failures.js';
import { timeout } from './workers-ai-text-model.js';

/**
 * Claude Sonnet 5.5 ($2 / $10 per million tokens) on the account's own key.
 * Extraction does not need Opus. Thinking cannot be turned off on this
 * model, so it runs adaptive at low effort.
 */
export const anthropicTextModel = 'claude-sonnet-5-5';
/** Thinking tokens count against this cap; only tokens used are billed. */
const maxTokens = 16000;

interface MessageResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * The Messages API over fetch, like the OpenAI adapter, so the Worker carries
 * no SDK. Structured outputs (`output_config.format`) at low effort; a refused
 * request is re-run server-side on Anthropic's recommended fallback model
 * (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
 */
export class AnthropicTextModel extends TextModel {
  readonly provider = 'anthropic' as const;
  readonly model = anthropicTextModel;
  readonly maxInputCharacters = 100000;
  constructor(
    private readonly apiKey: string,
    // Called unbound: Workers reject the global fetch called as a method.
    private readonly transport: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {
    super();
  }
  async generate(request: TextModelRequest) {
    let response: Response;
    try {
      response = await this.transport('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: anthropicTextModel,
          max_tokens: maxTokens,
          fallbacks: 'default',
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: request.schema },
          },
        }),
        signal: timeout(request.signal),
        redirect: 'error',
      });
    } catch {
      throw new Error('Anthropic could not be reached.');
    }
    if (!response.ok) throw providerHttpFailure('Anthropic', response.status);
    const message = (await response.json()) as MessageResponse;
    if (message.stop_reason === 'refusal')
      throw new ApiFailure(
        422,
        'AI_REFUSED',
        'The AI declined to process this capture.',
      );
    const text = message.content?.find((block) => block.type === 'text')?.text;
    if (typeof text !== 'string' || message.stop_reason === 'max_tokens')
      throw new Error('Anthropic returned incomplete suggestions.');
    return {
      output: JSON.parse(text),
      usage: {
        inputTokens: message.usage?.input_tokens ?? null,
        outputTokens: message.usage?.output_tokens ?? null,
        neurons: null,
      },
    };
  }
}
