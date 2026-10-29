import { TextModelProviders } from '../../capabilities/text-model.contract.js';
import { AnthropicTextModel } from './anthropic-text-model.js';
import { OpenAiTextModel } from './openai-text-model.js';
import {
  WorkersAiTextModel,
  type WorkersAiTextBinding,
} from './workers-ai-text-model.js';

/**
 * Text providers on the Worker: Workers AI through the `AI` binding (when the
 * Worker has one) and the account's own OpenAI or Anthropic key.
 */
export class ConfiguredTextModelProviders extends TextModelProviders {
  constructor(
    private readonly ai?: WorkersAiTextBinding,
    private readonly transport: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {
    super();
  }
  workersAiAvailable() {
    return Boolean(this.ai);
  }
  workersAi() {
    if (!this.ai) throw new Error('The Workers AI binding is not configured.');
    return new WorkersAiTextModel(this.ai);
  }
  openAi(apiKey: string) {
    return new OpenAiTextModel(apiKey, this.transport);
  }
  anthropic(apiKey: string) {
    return new AnthropicTextModel(apiKey, this.transport);
  }
}
