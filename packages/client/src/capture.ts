/**
 * AI capture contract (release slice 2): a note is processed on request into
 * suggestions the person reviews; only what they save becomes tasks and
 * drafts, linked to the source note. Drafts are never sent by Ordo.
 */
import type {
  CaptureRun,
  CaptureSuggestions,
  Draft,
  DraftKind,
  Task,
  TextProvider,
} from '@ordo/core';
export type {
  CaptureRun,
  CaptureRunStatus,
  Draft,
  DraftKind,
  TaskOrigin,
  TextProvider,
} from '@ordo/core';

export type Suggestions = CaptureSuggestions;
export type SuggestedTask = CaptureSuggestions['tasks'][number];
export type SuggestedDraft = CaptureSuggestions['drafts'][number];

/** An edited suggestion as saved; it may name its own destination. */
export type SavedTask = Partial<Omit<SuggestedTask, 'key' | 'title'>> & {
  title: string;
  key?: string;
  workspaceId?: string;
  projectId?: string | null;
};
export type SavedDraft = Partial<
  Omit<SuggestedDraft, 'key' | 'body' | 'kind'>
> & {
  kind: DraftKind;
  body: string;
  key?: string;
  workspaceId?: string;
  projectId?: string | null;
};
export interface CaptureSave {
  workspaceId: string;
  projectId?: string | null;
  tasks: SavedTask[];
  drafts: SavedDraft[];
}
/** What a save created; a retry with the same key returns the same result. */
export interface CaptureSaveResult {
  run: CaptureRun;
  tasks: Task[];
  drafts: Draft[];
}
export interface AiSettings {
  textProvider: TextProvider;
  workersAiAvailable: boolean;
  /** One OpenAI key per account, shared with transcription. */
  hasOpenAiKey: boolean;
  hasAnthropicKey: boolean;
  configured: boolean;
}
/**
 * `PATCH /v1/settings/ai`: apiKey/removeApiKey apply to keyProvider, or to
 * textProvider when it is omitted. The OpenAI key is shared with transcription.
 */
export interface AiSettingsInput {
  textProvider?: TextProvider;
  apiKey?: string;
  removeApiKey?: boolean;
  keyProvider?: 'openai' | 'anthropic';
}
