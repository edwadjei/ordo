/**
 * One real AI capture run on the fictional weekly sync
 * (test/fixtures/weekly-sync.txt), to check the instructions against a real
 * model. It calls a paid or allowance-limited provider, so it runs only with
 * the owner's approval at the time, and only with `--yes`.
 *
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… \
 *     npx tsx scripts/capture-real-run.ts --yes
 *   OPENAI_API_KEY=… npx tsx scripts/capture-real-run.ts --provider openai --yes
 *   ANTHROPIC_API_KEY=… npx tsx scripts/capture-real-run.ts --provider anthropic --yes
 *
 * Run from apps/api. Workers AI is called through Cloudflare's REST API
 * (`/accounts/{id}/ai/run/{model}`) with an API token that has Workers AI
 * access; it spends about 125 neurons of the account's daily allowance. The
 * transcript is fictional. Keys are read from the environment and never
 * printed. Nothing is stored and no Ordo data is touched.
 */
import type { TextModel } from '../src/capabilities/text-model.contract.js';
import {
  WorkersAiTextModel,
  workersAiTextModel,
  type WorkersAiTextBinding,
} from '../src/adapters/text-ai/workers-ai-text-model.js';
import { OpenAiTextModel } from '../src/adapters/text-ai/openai-text-model.js';
import { AnthropicTextModel } from '../src/adapters/text-ai/anthropic-text-model.js';
import {
  captureOutputSchema,
  capturePrompt,
  captureSystemPrompt,
  readSuggestions,
} from '../src/domains/capture/capture.prompt.js';
import {
  weeklySyncExpectations,
  weeklySyncInput,
} from '../test/fixtures/weekly-sync.js';

const args = process.argv.slice(2);
const provider = args.includes('--provider')
  ? args[args.indexOf('--provider') + 1]
  : 'workers_ai';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in the environment.`);
  return value;
}

function model(): TextModel {
  if (provider === 'openai')
    return new OpenAiTextModel(required('OPENAI_API_KEY'));
  if (provider === 'anthropic')
    return new AnthropicTextModel(required('ANTHROPIC_API_KEY'));
  if (provider !== 'workers_ai')
    throw new Error(`Unknown provider ${provider}.`);
  const account = required('CLOUDFLARE_ACCOUNT_ID');
  const token = required('CLOUDFLARE_API_TOKEN');
  // The Worker's AI binding, over Cloudflare's REST API.
  const binding: WorkersAiTextBinding = {
    async run(name, inputs, options) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${name}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(inputs),
          signal: options?.signal,
        },
      );
      const body = (await response.json()) as {
        result?: unknown;
        errors?: { code?: number; message?: string }[];
      };
      if (!response.ok)
        // Cloudflare's error codes and messages carry no prompt or key.
        throw new Error(
          (body.errors ?? [])
            .map((e) => `${e.code}: ${e.message}`)
            .join('; ') || `HTTP ${response.status}`,
        );
      return body.result;
    },
  };
  return new WorkersAiTextModel(binding);
}

if (!args.includes('--yes')) {
  console.log(
    `This calls ${provider === 'workers_ai' ? workersAiTextModel : provider} once with a fictional transcript.\n` +
      'It needs the owner’s approval at the time. Re-run with --yes to call it.',
  );
  process.exit(0);
}

const textModel = model();
const started = Date.now();
const result = await textModel.generate({
  system: captureSystemPrompt,
  prompt: capturePrompt(weeklySyncInput),
  schema: captureOutputSchema,
  maxOutputTokens: 2000,
});
const suggestions = readSuggestions(result.output, weeklySyncInput);
console.log(
  `${textModel.model}: ${suggestions ? 'ready' : 'failed (invalid output)'} in ${((Date.now() - started) / 1000).toFixed(1)} s; ` +
    `${result.usage.inputTokens} input and ${result.usage.outputTokens} output tokens` +
    (result.usage.neurons === null
      ? ''
      : `, about ${result.usage.neurons} neurons`),
);
if (!suggestions) process.exit(1);
console.log(JSON.stringify(suggestions, null, 2));

// The expectations a reviewer checks by eye, checked here too.
let misses = 0;
for (const expected of weeklySyncExpectations) {
  const task = suggestions.tasks.find((t) => expected.title.test(t.title));
  const problems = !task
    ? ['missing']
    : Object.entries(expected)
        .filter(([key]) => key !== 'title')
        .filter(([key, value]) => task[key as keyof typeof task] !== value)
        .map(
          ([key, value]) =>
            `${key} is ${JSON.stringify(task[key as keyof typeof task])}, expected ${JSON.stringify(value)}`,
        );
  if (problems.length) misses++;
  console.log(
    `${problems.length ? '✗' : '✓'} ${expected.title.source}${problems.length ? `: ${problems.join('; ')}` : ''}`,
  );
}
const draft = suggestions.drafts[0];
console.log(
  draft
    ? `Draft to ${draft.to ?? '(no recipient)'}, subject ${JSON.stringify(draft.subject)}. Read the body: it should be the email itself.`
    : '✗ no draft',
);
console.log(
  `Destination: ${suggestions.destination.projectId === weeklySyncInput.projects[0].id ? '✓ Website Relaunch' : `✗ ${suggestions.destination.projectId}`} (${suggestions.destination.confidence})`,
);
process.exit(misses ? 1 : 0);
