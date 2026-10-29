import {
  TextModel,
  type TextModelRequest,
} from '../../capabilities/text-model.contract.js';
import { providerHttpFailure } from './failures.js';
import { timeout } from './workers-ai-text-model.js';

/**
 * GPT-6.1 Sol ($2 / $10 per million tokens): OpenAI's current mid-priced
 * model with Structured Outputs, on the account's own key. GPT-6 Astra, at
 * five times the price, is not needed for extraction.
 */
export const openAiTextModel = 'gpt-6.1-sol';
/** Reasoning tokens count against this cap; only tokens used are billed. */
const maxCompletionTokens = 16000;

/** OpenAI Chat Completions with strict Structured Outputs, on the account's own key. */
export class OpenAiTextModel extends TextModel {
  readonly provider = 'openai' as const;
  readonly model = openAiTextModel;
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
      response = await this.transport(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: openAiTextModel,
            reasoning_effort: 'low',
            max_completion_tokens: maxCompletionTokens,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.prompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'capture_suggestions',
                strict: true,
                schema: request.schema,
              },
            },
          }),
          signal: timeout(request.signal),
          redirect: 'error',
        },
      );
    } catch {
      throw new Error('OpenAI could not be reached.');
    }
    if (!response.ok) throw providerHttpFailure('OpenAI', response.status);
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown; refusal?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string')
      throw new Error('OpenAI returned no suggestions.');
    return {
      output: JSON.parse(content),
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
        neurons: null,
      },
    };
  }
}
