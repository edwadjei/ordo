import type { TextProvider } from '@ordo/core';

export interface TextModelRequest {
  /** Fixed instructions; never contains the person's text. */
  system: string;
  /** The capture data (note text and project names), sent as data. */
  prompt: string;
  /** JSON Schema the reply must match; the API validates it again with Zod. */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface TextModelResult {
  /** The parsed JSON reply, not yet validated. */
  output: unknown;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    /** Workers AI only: estimated neurons from the model's published rates. */
    neurons: number | null;
  };
}

/**
 * A text model that returns JSON. Adapters throw an `ApiFailure` with status
 * 429 or 503 when the provider is unavailable (the run is kept as `pending`);
 * any other error means the provider failed (the run is `failed`). Errors
 * never carry the prompt, the reply or a key.
 */
export abstract class TextModel {
  abstract readonly provider: TextProvider;
  abstract readonly model: string;
  /** Longest note text, in characters, that fits this model's context. */
  abstract readonly maxInputCharacters: number;
  abstract generate(request: TextModelRequest): Promise<TextModelResult>;
}

/** Text-AI providers for this runtime. */
export abstract class TextModelProviders {
  /** Whether the Worker has an `AI` binding. */
  abstract workersAiAvailable(): boolean;
  abstract workersAi(): TextModel;
  abstract openAi(apiKey: string): TextModel;
  abstract anthropic(apiKey: string): TextModel;
}
