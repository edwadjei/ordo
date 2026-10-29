/**
 * AI capture contract (release slice 2): a note is processed on request into
 * suggestions the person reviews; only what they save becomes tasks and
 * drafts, linked to the source note. Drafts are never sent by Ordo.
 */
export type TextProvider = 'workers_ai' | 'openai' | 'anthropic';
export type CaptureRunStatus = 'ready' | 'failed' | 'pending' | 'saved';
export type Confidence = 'high' | 'low';
export type DraftKind = 'email' | 'message';
export type TaskOrigin = 'manual' | 'capture' | 'agent';

export interface SuggestedTask {
  key: string;
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  followUpDate?: string | null;
  followUpTime?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
  responsiblePerson?: string | null;
  waitingOn?: string | null;
  isFollowUp: boolean;
}
export interface SuggestedDraft {
  key: string;
  kind: DraftKind;
  to?: string | null;
  subject?: string | null;
  body: string;
}
export interface Suggestions {
  summary: string;
  tasks: SuggestedTask[];
  drafts: SuggestedDraft[];
  destination: {
    workspaceId: string;
    projectId: string | null;
    confidence: Confidence;
    reason: string;
  };
}
export interface CaptureRun {
  id: string;
  noteId: string;
  status: CaptureRunStatus;
  provider: string;
  model: string;
  suggestions?: Suggestions | null;
  errorCode?: string | null;
  usage?: Record<string, number> | null;
  createdAt?: string;
}
/** An edited suggestion as saved; it may name its own destination. */
export type SavedTask = Omit<SuggestedTask, 'key'> & {
  key?: string;
  workspaceId?: string;
  projectId?: string | null;
};
export type SavedDraft = Omit<SuggestedDraft, 'key'> & {
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
export interface Draft {
  id: string;
  workspaceId: string;
  projectId: string | null;
  sourceNoteId: string | null;
  kind: DraftKind;
  to: string | null;
  subject: string | null;
  body: string;
  usedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface CaptureSaveResult {
  run: CaptureRun;
  tasks: { id: string; title: string }[];
  drafts: { id: string; subject: string | null; kind: DraftKind }[];
}
export interface AiSettings {
  textProvider: TextProvider;
  workersAiAvailable: boolean;
  hasOpenAiKey: boolean;
  hasAnthropicKey: boolean;
  configured: boolean;
}
export interface AiSettingsInput {
  textProvider: TextProvider;
  apiKey?: string;
  removeApiKey?: boolean;
  /** Which provider apiKey/removeApiKey is for. The OpenAI key is shared with transcription. */
  keyProvider?: 'openai' | 'anthropic';
}
