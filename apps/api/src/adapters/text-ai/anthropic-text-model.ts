import Anthropic from '@anthropic-ai/sdk';
import {
  TextModel,
  type TextModelRequest,
} from '../../capabilities/text-model.contract.js';
import { ApiFailure } from '../../platform/http/api-failure.js';
import { providerHttpFailure } from './failures.js';
import { timeout } from './workers-ai-text-model.js';

export const anthropicTextModel = 'claude-opus-5-5';

/**
 * Claude through the Anthropic SDK on the account's own key, with structured
 * outputs (`output_config.format`) and low effort for a short extraction. A
 * refused request is re-run server-side on Anthropic's recommended fallback
 * model (`fallbacks: "default"`).
 */
export class AnthropicTextModel extends TextModel {
  readonly provider = 'anthropic' as const;
  readonly model = anthropicTextModel;
  readonly maxInputCharacters = 100000;
  private readonly client: Anthropic;
  constructor(
    apiKey: string,
    // Called unbound: Workers reject the global fetch called as a method.
    transport: typeof fetch = (input, init) => fetch(input, init),
  ) {
    super();
    this.client = new Anthropic({ apiKey, fetch: transport, maxRetries: 0 });
  }
  async generate(request: TextModelRequest) {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await this.client.beta.messages.create(
        {
          model: anthropicTextModel,
          max_tokens: request.maxOutputTokens,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: request.schema },
          },
        },
        { signal: timeout(request.signal) },
      );
    } catch (error) {
      if (error instanceof Anthropic.APIError && error.status)
        throw providerHttpFailure('Anthropic', error.status);
      throw new Error('Anthropic could not be reached.');
    }
    if (message.stop_reason === 'refusal')
      throw new ApiFailure(
        422,
        'AI_REFUSED',
        'The AI declined to process this capture.',
      );
    const text = message.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
    );
    if (!text || message.stop_reason === 'max_tokens')
      throw new Error('Anthropic returned incomplete suggestions.');
    return {
      output: JSON.parse(text.text),
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        neurons: null,
      },
    };
  }
}
