import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiFailure } from '../src/platform/http/api-failure.js';
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
} from '../src/domains/capture/capture.prompt.js';
import {
  DevelopmentTextModelProviders,
  developmentReply,
} from '../src/adapters/text-ai/development-text-model.js';
import { readWorkerConfig } from '../src/platform/config/worker-config.js';

// Request shapes and error mapping for each text adapter, against fake
// transports: no real Workers AI, OpenAI or Anthropic call is made.

const request = {
  system: 'Fixed instructions.',
  prompt: '<capture>fictional</capture>',
  schema: captureOutputSchema,
  maxOutputTokens: 2000,
};
const reply = { summary: 'Done.', tasks: [], drafts: [], destination: null };

test('Workers AI: JSON mode request, object or string reply, neurons from usage', async () => {
  const calls: unknown[][] = [];
  let response: unknown = {
    response: reply,
    usage: { prompt_tokens: 2000, completion_tokens: 500 },
  };
  const binding: WorkersAiTextBinding = {
    async run(...args) {
      calls.push(args);
      return response;
    },
  };
  const model = new WorkersAiTextModel(binding);
  const result = await model.generate(request);
  assert.deepEqual(result.output, reply);
  // 2,000 × 26,668 / 1M + 500 × 204,805 / 1M = 53.3 + 102.4 → 156
  assert.deepEqual(result.usage, {
    inputTokens: 2000,
    outputTokens: 500,
    neurons: 156,
  });
  const [name, inputs] = calls[0] as [string, Record<string, unknown>];
  assert.equal(name, workersAiTextModel);
  assert.deepEqual(inputs.messages, [
    { role: 'system', content: request.system },
    { role: 'user', content: request.prompt },
  ]);
  assert.deepEqual(inputs.response_format, {
    type: 'json_schema',
    json_schema: captureOutputSchema,
  });
  assert.equal(inputs.max_tokens, 2000);
  response = { response: JSON.stringify(reply) };
  const text = await model.generate(request);
  assert.deepEqual(text.output, reply);
  assert.equal(text.usage.neurons, null);
});

test('Workers AI errors: allowance and busy are 429, local is 503, others fail', async () => {
  const failing = (message: string) =>
    new WorkersAiTextModel({
      run: async () => {
        throw new Error(message);
      },
    }).generate(request);
  for (const [message, status, code] of [
    ['3036: daily free allocation exceeded', 429, 'AI_ALLOWANCE_USED'],
    ['3040: Capacity temporarily exceeded', 429, 'AI_BUSY'],
    ['Binding AI needs to be run remotely', 503, 'AI_UNAVAILABLE'],
  ] as const)
    await assert.rejects(failing(message), (error: unknown) => {
      assert.ok(error instanceof ApiFailure);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      return true;
    });
  await assert.rejects(failing("JSON Mode couldn't be met"), (error: Error) => {
    assert.ok(!(error instanceof ApiFailure));
    assert.ok(
      !error.message.includes('JSON Mode'),
      'provider text stays private',
    );
    return true;
  });
});

test('OpenAI: strict structured outputs with the account key; HTTP errors mapped', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  let status = 200;
  const transport = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(reply) } }],
        usage: { prompt_tokens: 900, completion_tokens: 120 },
      }),
      { status },
    );
  }) as unknown as typeof fetch;
  const model = new OpenAiTextModel('sk-fictional', transport);
  const result = await model.generate(request);
  assert.deepEqual(result.output, reply);
  assert.deepEqual(result.usage, {
    inputTokens: 900,
    outputTokens: 120,
    neurons: null,
  });
  assert.equal(seen[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(
    (seen[0].init.headers as Record<string, string>).Authorization,
    'Bearer sk-fictional',
  );
  const body = JSON.parse(seen[0].init.body as string);
  assert.equal(body.model, 'gpt-6.1-sol');
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.max_completion_tokens, 16000);
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(
    body.response_format.json_schema.schema,
    captureOutputSchema,
  );
  for (const [code, expected] of [
    [401, 'AI_KEY_REJECTED'],
    [429, 'AI_BUSY'],
    [500, 'AI_UNAVAILABLE'],
  ] as const) {
    status = code;
    await assert.rejects(model.generate(request), (error: unknown) => {
      assert.ok(error instanceof ApiFailure);
      assert.equal(error.code, expected);
      return true;
    });
  }
  status = 400;
  await assert.rejects(model.generate(request), (error: unknown) => {
    assert.ok(!(error instanceof ApiFailure));
    return true;
  });
});

test('Anthropic: structured outputs, low effort and default fallbacks; refusals and errors mapped', async () => {
  const seen: {
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[] = [];
  let respond = () =>
    Response.json({
      id: 'msg_fictional',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text: JSON.stringify(reply) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 800, output_tokens: 100 },
    });
  const transport = (async (url: string, init: RequestInit) => {
    seen.push({
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(init.body as string),
    });
    return respond();
  }) as unknown as typeof fetch;
  const model = new AnthropicTextModel('sk-ant-fictional', transport);
  const result = await model.generate(request);
  assert.deepEqual(result.output, reply);
  assert.deepEqual(result.usage, {
    inputTokens: 800,
    outputTokens: 100,
    neurons: null,
  });
  const [call] = seen;
  assert.match(call.url, /\/v1\/messages/);
  assert.equal(call.headers.get('x-api-key'), 'sk-ant-fictional');
  assert.match(
    call.headers.get('anthropic-beta') ?? '',
    /server-side-fallback-2026-07-01/,
  );
  assert.equal(call.body.model, 'claude-sonnet-5-5');
  assert.equal(call.body.max_tokens, 16000);
  assert.equal(call.body.fallbacks, 'default');
  assert.equal(call.body.system, request.system);
  assert.deepEqual(call.body.output_config, {
    effort: 'low',
    format: { type: 'json_schema', schema: captureOutputSchema },
  });
  assert.equal('thinking' in call.body, false);
  respond = () =>
    Response.json({
      id: 'msg_fictional',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: 'refusal',
      stop_sequence: null,
      usage: { input_tokens: 800, output_tokens: 0 },
    });
  await assert.rejects(model.generate(request), (error: unknown) => {
    assert.ok(error instanceof ApiFailure);
    assert.equal(error.code, 'AI_REFUSED');
    return true;
  });
  respond = () =>
    Response.json(
      { type: 'error', error: { type: 'rate_limit_error', message: 'slow' } },
      { status: 429 },
    );
  await assert.rejects(model.generate(request), (error: unknown) => {
    assert.ok(error instanceof ApiFailure);
    assert.equal(error.code, 'AI_BUSY');
    return true;
  });
});

test('development fake model: deterministic suggestions from the note, no network', async () => {
  const prompt = capturePrompt({
    note: {
      title: 'Sync',
      source: 'transcript',
      body: 'Send the go-live checklist. Book the venue. Waiting on pricing from Kofi.',
    },
    workspace: { id: 'w', name: 'DAMSYN' },
    projects: [
      { id: 'a', name: 'Vendor portal', description: '', aliases: [] },
      { id: 'b', name: 'Launch', description: '', aliases: ['Go-live'] },
    ],
    chosenProjectId: null,
    today: { date: '2026-10-29', weekday: 'Thursday', timezone: 'UTC' },
  });
  const model = new DevelopmentTextModelProviders().workersAi();
  const first = await model.generate({ ...request, prompt });
  assert.deepEqual(
    (await model.generate({ ...request, prompt })).output,
    first.output,
  );
  const reply = first.output as ReturnType<typeof developmentReply>;
  assert.deepEqual(
    reply.tasks.map((task) => [task.title, task.dueDate, task.waitingOn]),
    [
      ['Send the go-live checklist.', '2026-10-30', null],
      ['Book the venue.', null, null],
      ['Follow up: Waiting on pricing from Kofi.', null, 'Kofi'],
    ],
  );
  assert.equal(reply.tasks[2].isFollowUp, true);
  assert.equal(reply.drafts[0].to, 'Kofi');
  assert.deepEqual(reply.destination, {
    projectRef: 'p2',
    confidence: 'high',
    reason: 'The capture names this project.',
  });
  const unnamed = developmentReply(prompt.replace('go-live', 'final'));
  assert.equal(unnamed.destination.confidence, 'low');
  assert.equal(unnamed.destination.projectRef, null);
});

test('the development fake model is refused outside development', () => {
  assert.equal(
    readWorkerConfig({ ORDO_ENV: 'development', ORDO_FAKE_TEXT_AI: 'on' })
      .fakeTextAi,
    true,
  );
  assert.equal(readWorkerConfig({ ORDO_ENV: 'development' }).fakeTextAi, false);
  assert.throws(
    () =>
      readWorkerConfig({
        OTP_HMAC_KEY: '0f'.repeat(32),
        TRUSTED_ORIGINS: 'https://ordo.example.test',
        ORDO_FAKE_TEXT_AI: 'on',
      }),
    /local development only/,
  );
  assert.throws(
    () =>
      readWorkerConfig({ ORDO_ENV: 'development', ORDO_FAKE_TEXT_AI: 'yes' }),
    /ORDO_FAKE_TEXT_AI/,
  );
});
