import { z } from 'zod';

export const statuses = ['todo', 'in_progress', 'waiting', 'done'] as const;
export const priorities = ['low', 'medium', 'high'] as const;
const id = z.uuid();
const name = z.string().trim().min(1).max(200);
const dateOnly = z.iso.date();
// Local wall-clock time in the user's timezone; stored separately from its date-only field.
export const timeOfDayPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeOfDay = z.string().regex(timeOfDayPattern);
// Plain-text person name, never matched to accounts. Trimmed; empty becomes null.
const personName = z
  .string()
  .trim()
  .max(80)
  .transform((v) => (v === '' ? null : v));
/**
 * True when a submitted name is really a phone number (seven or more digits
 * once spaces, `+`, `-`, `.` and brackets are removed) or an email address.
 * Migration 0003 clears stored names with the same rule.
 */
export function looksLikeContact(value: string) {
  const text = value.trim();
  return (
    /\S@\S+\.\S/.test(text) || /^\d{7,}$/.test(text.replace(/[\s+().-]/g, ''))
  );
}
/** A display name worth storing, or null: blank and contact-like names are dropped. */
export function cleanDisplayName(value: string | null | undefined) {
  const text = value?.trim().slice(0, 80) ?? '';
  return text === '' || looksLikeContact(text) ? null : text;
}
export const workspaceInput = z
  .object({
    name,
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#577664'),
  })
  .strict();
// Alternative names an AI capture may match to the project (0005).
const projectAliases = z
  .array(z.string().trim().min(1).max(60))
  .max(10)
  .refine(
    (list) => new Set(list.map((a) => a.toLowerCase())).size === list.length,
    {
      message: 'Aliases must be different from each other.',
    },
  );
export const projectInput = z
  .object({
    name,
    workspaceId: id,
    description: z.string().max(5000).default(''),
    favorite: z.boolean().default(false),
    aliases: projectAliases.default([]),
  })
  .strict();
export const scopeInput = z.object({
  workspaceId: id.nullable().default(null),
  projectId: id.nullable().default(null),
});
/** Where a task came from: typed by hand, saved from an AI capture, or (later) an agent. */
export const taskOrigins = ['manual', 'capture', 'agent'] as const;
export type TaskOrigin = (typeof taskOrigins)[number];
export const taskInput = scopeInput
  .extend({
    title: name,
    description: z.string().max(20000).default(''),
    status: z.enum(statuses).default('todo'),
    priority: z.enum(priorities).nullable().default(null),
    dueDate: dateOnly.nullable().default(null),
    followUpDate: dateOnly.nullable().default(null),
    dueTime: timeOfDay.nullable().default(null),
    followUpTime: timeOfDay.nullable().default(null),
    responsiblePerson: personName.nullable().default(null),
    waitingOn: personName.nullable().default(null),
    parentId: id.nullable().default(null),
    // Provenance (0005): the source note is set on create only. `origin` is
    // set by the server, never by a client: `manual` here, `capture` by the
    // capture save route, `agent` later by agent tokens.
    sourceNoteId: id.nullable().default(null),
  })
  .strict();
// Update schemas deliberately omit creation defaults: omitted fields must remain unchanged.
export const taskPatch = z
  .object({
    title: name.optional(),
    description: z.string().max(20000).optional(),
    status: z.enum(statuses).optional(),
    priority: z.enum(priorities).nullable().optional(),
    dueDate: dateOnly.nullable().optional(),
    followUpDate: dateOnly.nullable().optional(),
    dueTime: timeOfDay.nullable().optional(),
    followUpTime: timeOfDay.nullable().optional(),
    responsiblePerson: personName.nullable().optional(),
    waitingOn: personName.nullable().optional(),
    workspaceId: id.nullable().optional(),
    projectId: id.nullable().optional(),
    parentId: id.nullable().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
/** Where a note came from; set on create and never changed. */
export const noteSources = [
  'manual',
  'recording',
  'email',
  'transcript',
] as const;
export type NoteSource = (typeof noteSources)[number];
// `body` is Markdown text; plain text is valid Markdown. The API stores text only.
export const noteInput = scopeInput
  .extend({
    title: name,
    body: z.string().max(100000).default(''),
    source: z.enum(noteSources).default('manual'),
  })
  .strict();
export const notePatch = z
  .object({
    title: name.optional(),
    body: z.string().max(100000).optional(),
    workspaceId: id.nullable().optional(),
    projectId: id.nullable().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
// `PATCH /v1/auth/me`: empty or null clears the name. A phone- or email-like
// name is refused by the identity service (`looksLikeContact`).
export const profilePatch = z
  .object({ displayName: z.string().trim().max(80).nullable() })
  .strict();
export const revisionInput = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export const workspacePatch = z
  .object({
    name: name.optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    // Archive (true) or restore (false); everything inside is kept.
    archived: z.boolean().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export const projectPatch = z
  .object({
    name: name.optional(),
    description: z.string().max(5000).optional(),
    favorite: z.boolean().optional(),
    aliases: projectAliases.optional(),
    archived: z.boolean().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
/**
 * What an access key may change on a project: its name and routing hints.
 * Archiving and favourites stay with the owner.
 */
export const agentProjectPatch = projectPatch
  .pick({
    name: true,
    description: true,
    aliases: true,
    expectedRevision: true,
  })
  .strict();

/** Most active (unarchived) workspaces and projects an account may have. */
export const WORKSPACE_LIMIT = 50;
export const PROJECT_LIMIT = 500;

/**
 * `DELETE /v1/workspaces/:id` and `DELETE /v1/projects/:id`: permanent, so
 * the current name must be typed exactly.
 */
export const permanentDeleteInput = z
  .object({
    confirmName: z.string(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
/** What a permanent delete removes (preview) or removed (result). */
export interface DeletedCounts {
  projects: number;
  tasks: number;
  notes: number;
  drafts: number;
  captureRuns: number;
}
export interface DeletePreview extends DeletedCounts {
  name: string;
}
export interface DeleteResult {
  deleted: DeletedCounts;
}

/** `?includeArchived=1` on lists and search also returns archived items. */
const includeArchived = z
  .enum(['1', 'true', '0', 'false'])
  .optional()
  .transform((value) => value === '1' || value === 'true');
// Not strict: these routes accepted any other query parameter before.
export const archivedQuery = z.object({ includeArchived });

/** `POST /v1/tasks/:id/links`: link one of the owner's notes to a task. */
export const taskLinkInput = z.object({ noteId: id }).strict();
export interface TaskNoteLink {
  taskId: string;
  noteId: string;
  createdAt: string;
}

/**
 * Transcription providers an account can choose. `workers_ai` (Cloudflare
 * Workers AI Whisper, through the Worker's `AI` binding) is the default;
 * `openai` uses the account's own saved key.
 */
export const audioProviders = ['workers_ai', 'openai'] as const;
export type AudioProvider = (typeof audioProviders)[number];
export const defaultAudioProvider: AudioProvider = 'workers_ai';

// ---------------------------------------------------------------------------
// AI capture (release slice 2). See apps/api/src/domains/capture/capture.md.

/**
 * Text-AI providers an account can choose. `workers_ai` (the Worker's `AI`
 * binding) is the default; `openai` and `anthropic` use the account's own key.
 */
export const textProviders = ['workers_ai', 'openai', 'anthropic'] as const;
export type TextProvider = (typeof textProviders)[number];
export const defaultTextProvider: TextProvider = 'workers_ai';

const providerKey = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);
/**
 * `PATCH /v1/settings/ai`. `apiKey` or `removeApiKey` applies to
 * `keyProvider`, which defaults to the chosen `textProvider`. The OpenAI key
 * is the account's one OpenAI key, shared with transcription.
 */
export const aiSettingsPatch = z
  .object({
    textProvider: z.enum(textProviders).optional(),
    apiKey: providerKey.optional(),
    removeApiKey: z.boolean().optional(),
    keyProvider: z.enum(['openai', 'anthropic']).optional(),
  })
  .strict();

export const draftKinds = ['email', 'message'] as const;
export type DraftKind = (typeof draftKinds)[number];
const draftTo = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === '' ? null : v));
const draftSubject = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === '' ? null : v));
const draftBody = z.string().max(20000);
/** `POST /v1/drafts`. Drafts are never sent by Ordo. */
export const draftInput = z
  .object({
    workspaceId: id,
    projectId: id.nullable().default(null),
    sourceNoteId: id.nullable().default(null),
    kind: z.enum(draftKinds),
    to: draftTo.nullable().default(null),
    subject: draftSubject.nullable().default(null),
    body: draftBody,
  })
  .strict();
/** `GET /v1/drafts` filters; both optional. */
export const draftListQuery = z
  .object({
    workspaceId: id.optional(),
    projectId: id.optional(),
    includeArchived,
  })
  .strict();
/** `PATCH /v1/drafts/:id`; `used: true` marks it used, `false` clears that. */
export const draftPatch = z
  .object({
    workspaceId: id.optional(),
    projectId: id.nullable().optional(),
    kind: z.enum(draftKinds).optional(),
    to: draftTo.nullable().optional(),
    subject: draftSubject.nullable().optional(),
    body: draftBody.optional(),
    used: z.boolean().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();

/** `POST /v1/notes/:id/process`: which workspace's project names the AI may see. */
export const captureProcessInput = z
  .object({ workspaceId: id, projectId: id.nullable().default(null) })
  .strict();

export const captureRunStatuses = [
  'ready',
  'failed',
  'pending',
  'saved',
] as const;
export type CaptureRunStatus = (typeof captureRunStatuses)[number];
export const captureLimits = {
  tasks: 50,
  drafts: 10,
  summary: 4000,
  reason: 300,
} as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().default(null);
/** A task as suggested by the AI. `key` is unique within one run. */
export const suggestedTask = z
  .object({
    key: z.string().min(1).max(40),
    title: name,
    dueDate: dateOnly.nullable().default(null),
    dueTime: timeOfDay.nullable().default(null),
    followUpDate: dateOnly.nullable().default(null),
    followUpTime: timeOfDay.nullable().default(null),
    priority: z.enum(priorities).nullable().default(null),
    responsiblePerson: personName.nullable().default(null),
    waitingOn: personName.nullable().default(null),
    isFollowUp: z.boolean().default(false),
  })
  .strict();
export const suggestedDraft = z
  .object({
    key: z.string().min(1).max(40),
    kind: z.enum(draftKinds),
    to: draftTo.nullable().default(null),
    subject: draftSubject.nullable().default(null),
    body: draftBody.min(1),
  })
  .strict();
/** Validated suggestions of a `ready` run. Invalid model output is a failed run. */
export const captureSuggestions = z
  .object({
    summary: optionalText(captureLimits.summary),
    tasks: z.array(suggestedTask).max(captureLimits.tasks),
    drafts: z.array(suggestedDraft).max(captureLimits.drafts),
    destination: z
      .object({
        workspaceId: id,
        projectId: id.nullable(),
        confidence: z.enum(['high', 'low']),
        reason: z.string().trim().max(captureLimits.reason),
      })
      .strict(),
  })
  .strict();
export type CaptureSuggestions = z.infer<typeof captureSuggestions>;

/** An edited task on save; its own scope overrides the save's. */
const savedTask = suggestedTask
  .omit({ key: true })
  .extend({
    key: z.string().min(1).max(40).optional(),
    workspaceId: id.optional(),
    projectId: id.nullable().optional(),
  })
  .strict();
const savedDraft = suggestedDraft
  .omit({ key: true })
  .extend({
    key: z.string().min(1).max(40).optional(),
    workspaceId: id.optional(),
    projectId: id.nullable().optional(),
  })
  .strict();
/** `POST /v1/capture-runs/:id/save` (with an `Idempotency-Key` header). */
export const captureSaveInput = z
  .object({
    workspaceId: id,
    projectId: id.nullable().default(null),
    tasks: z.array(savedTask).max(captureLimits.tasks).default([]),
    drafts: z.array(savedDraft).max(captureLimits.drafts).default([]),
  })
  .strict()
  .refine((value) => value.tasks.length + value.drafts.length > 0, {
    message: 'Choose at least one task or draft to save.',
  });

export interface CaptureRun {
  id: string;
  noteId: string;
  noteRevision: number;
  workspaceId: string;
  projectId: string | null;
  status: CaptureRunStatus;
  provider: TextProvider;
  model: string | null;
  suggestions: CaptureSuggestions | null;
  errorCode: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    /** Workers AI only: the estimated neurons this run spent. */
    neurons: number | null;
  } | null;
  /** Ids created by the save; null until the run is saved. */
  saved: { taskIds: string[]; draftIds: string[] } | null;
  createdAt: string;
  updatedAt: string;
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

// ---------------------------------------------------------------------------
// Agent access (release slice 3). See apps/api/src/domains/agent-access.

/** `write` also allows everything `read` does. */
export const agentScopes = ['read', 'write'] as const;
export type AgentScope = (typeof agentScopes)[number];
/** Prefix of every access token, so a leaked one is recognisable. */
export const AGENT_TOKEN_PREFIX = 'ordo_pat_';
/** At most this many active (unrevoked, unexpired) tokens per account. */
export const AGENT_TOKEN_LIMIT = 20;
/** `POST /v1/settings/agent-tokens`. */
export const agentTokenInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(z.enum(agentScopes)).min(1).max(2),
    expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict();
/** A token as listed: never the secret. */
export interface AgentTokenRecord {
  id: string;
  name: string;
  scopes: AgentScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
/** The one response that carries the token itself. */
export interface CreatedAgentToken {
  token: string;
  record: AgentTokenRecord;
}
/** `GET /v1/settings/agent-activity`: newest first, 100 a page. */
export const agentActivityQuery = z.object({
  tokenId: id.optional(),
  /** `createdAt` of the last entry seen, for the next page. */
  before: z.iso.datetime().optional(),
});
/** What an agent did to which item. Never any content. */
export interface AgentActivity {
  id: string;
  tokenId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export type TaskInput = z.infer<typeof taskInput>;
export type NoteInput = z.infer<typeof noteInput>;
export interface User {
  id: string;
  email: string;
  /** Empty when the account has no name; never a phone number or email address. */
  displayName: string;
  timezone: string;
}
export interface Workspace {
  id: string;
  name: string;
  color: string;
  /** Set while the workspace is archived; null otherwise. */
  archivedAt: string | null;
  /** `"agent"` when an access key created it. */
  origin?: 'manual' | 'agent';
  /** The access token that created it, when an agent did. */
  createdByTokenId?: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  favorite: boolean;
  aliases: string[];
  /** Set while the project is archived; null otherwise. */
  archivedAt: string | null;
  /** `"agent"` when an access key created it. */
  origin?: 'manual' | 'agent';
  /** The access token that created it, when an agent did. */
  createdByTokenId?: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Task extends Omit<TaskInput, 'sourceNoteId'> {
  /**
   * Always returned by the API (`"manual"` and `null` by default); optional
   * only so data a client cached before these fields existed still fits.
   */
  origin?: TaskOrigin;
  sourceNoteId?: string | null;
  /** The access token that created it, when an agent did. */
  createdByTokenId?: string | null;
  id: string;
  revision: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
/** Characters of a note body sent as its `preview`. */
export const NOTE_PREVIEW_LENGTH = 280;

/**
 * The first 280 characters of a note body, counted in Unicode code points,
 * so a surrogate pair is never split. Matches SQLite's `substr(body, 1, 280)`.
 */
export function notePreview(body: string) {
  let end = 0;
  for (
    let count = 0;
    end < body.length && count < NOTE_PREVIEW_LENGTH;
    count++
  ) {
    const unit = body.charCodeAt(end);
    end += unit >= 0xd800 && unit <= 0xdbff && end + 1 < body.length ? 2 : 1;
  }
  return body.slice(0, end);
}

/** A note body's length in Unicode code points, as SQLite's `length(body)`. */
export function noteBodyLength(body: string) {
  return (
    body.length - (body.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0)
  );
}

/** A note with its full body: `GET /v1/notes/:id` and every note write. */
export interface Note extends NoteInput {
  /**
   * Status of the note's newest capture run, or null when it was never
   * processed. Returned by note lists, `GET /v1/notes/:id` and `/v1/home`;
   * note writes omit it.
   */
  latestCaptureStatus?: CaptureRunStatus | null;
  /** Where the note came from (set by the server); `agent` for an access token. */
  origin?: TaskOrigin;
  createdByTokenId?: string | null;
  /** The body's first 280 characters (code points). */
  preview: string;
  /** The body's length in characters (code points). */
  bodyLength: number;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
/**
 * A note in `/v1/home` and `GET /v1/notes`: everything but the body, which
 * `GET /v1/notes/:id` returns when the note is opened.
 */
export type NoteSummary = Omit<Note, 'body'>;
/** A task without its description, as listed in related items. */
export type TaskSummary = Omit<Task, 'description'>;
/** `GET /v1/tasks/:id/related`. */
export interface RelatedItems {
  sourceNote: NoteSummary | null;
  linkedNotes: NoteSummary[];
  /** Other tasks saved from the same source note (up to 20). */
  captureTasks: TaskSummary[];
  /** Drafts saved from the same source note (up to 20). */
  drafts: Draft[];
}
export interface HomeSnapshot {
  user: User;
  workspaces: Workspace[];
  projects: Project[];
  tasks: Task[];
  notes: NoteSummary[];
}
export interface ApiError {
  error: { code: string; message: string };
}
