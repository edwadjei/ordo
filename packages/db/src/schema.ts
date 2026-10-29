import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Mirrors migrations/0001_initial.sql and later numbered migrations. Timestamps are ISO 8601 UTC text, dates
// `YYYY-MM-DD`, times `HH:MM`; booleans are stored as 0/1.
const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const timestampFields = () => ({
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});
const revisionFields = () => ({
  revision: integer('revision').notNull().default(1),
  ...timestampFields(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  timezone: text('timezone').notNull().default('Africa/Accra'),
  phone: text('phone').unique(),
  emailVerifiedAt: text('email_verified_at'),
  phoneVerifiedAt: text('phone_verified_at'),
  demoLoaded: integer('demo_loaded', { mode: 'boolean' })
    .notNull()
    .default(false),
  demoClaim: text('demo_claim'),
  ...timestampFields(),
});

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
});

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  color: text('color').notNull(),
  // 0006: set while archived (hidden, restorable).
  archivedAt: text('archived_at'),
  // 0008: the token that created it, and a create's retry key.
  createdByTokenId: text('created_by_token_id'),
  idempotencyKey: text('idempotency_key'),
  idempotencyFingerprint: text('idempotency_fingerprint'),
  ...revisionFields(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  // 0005: up to 10 alternative names the AI capture may match.
  aliases: text('aliases', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  // 0006: set while archived (hidden, restorable).
  archivedAt: text('archived_at'),
  // 0008: the token that created it, and a create's retry key.
  createdByTokenId: text('created_by_token_id'),
  idempotencyKey: text('idempotency_key'),
  idempotencyFingerprint: text('idempotency_fingerprint'),
  ...revisionFields(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  workspaceId: text('workspace_id'),
  projectId: text('project_id'),
  parentId: text('parent_id'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status')
    .$type<'todo' | 'in_progress' | 'waiting' | 'done'>()
    .notNull()
    .default('todo'),
  priority: text('priority').$type<'low' | 'medium' | 'high'>(),
  dueDate: text('due_date'),
  followUpDate: text('follow_up_date'),
  // Optional local wall-clock "HH:MM" times; each requires its date.
  dueTime: text('due_time'),
  followUpTime: text('follow_up_time'),
  // Plain-text names (1–80 characters), never matched to accounts.
  responsiblePerson: text('responsible_person'),
  waitingOn: text('waiting_on'),
  // 0005: where the task came from; set on create only.
  origin: text('origin')
    .$type<'manual' | 'capture' | 'agent'>()
    .notNull()
    .default('manual'),
  sourceNoteId: text('source_note_id'),
  // 0007: the access token that created it, if an agent did.
  createdByTokenId: text('created_by_token_id'),
  completedAt: text('completed_at'),
  deletedAt: text('deleted_at'),
  ...revisionFields(),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  workspaceId: text('workspace_id'),
  projectId: text('project_id'),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  source: text('source')
    .$type<'manual' | 'recording' | 'email' | 'transcript'>()
    .notNull()
    .default('manual'),
  // 0007: provenance, set by the server.
  origin: text('origin')
    .$type<'manual' | 'capture' | 'agent'>()
    .notNull()
    .default('manual'),
  createdByTokenId: text('created_by_token_id'),
  deletedAt: text('deleted_at'),
  ...revisionFields(),
});

export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id'),
  sourceNoteId: text('source_note_id'),
  kind: text('kind').$type<'email' | 'message'>().notNull(),
  // Exposed as `to` by the API.
  recipient: text('recipient'),
  subject: text('subject'),
  body: text('body').notNull(),
  usedAt: text('used_at'),
  deletedAt: text('deleted_at'),
  ...revisionFields(),
});

export type TextProvider = 'workers_ai' | 'openai' | 'anthropic';

export const captureRuns = sqliteTable('capture_runs', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  noteId: text('note_id').notNull(),
  noteRevision: integer('note_revision').notNull(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id'),
  status: text('status')
    .$type<'ready' | 'failed' | 'pending' | 'saved'>()
    .notNull(),
  provider: text('provider').$type<TextProvider>().notNull(),
  model: text('model'),
  suggestions: text('suggestions', { mode: 'json' }),
  errorCode: text('error_code'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  neurons: integer('neurons'),
  saveKey: text('save_key'),
  saveFingerprint: text('save_fingerprint'),
  saveClaim: text('save_claim'),
  savedResult: text('saved_result', { mode: 'json' }).$type<{
    taskIds: string[];
    draftIds: string[];
  }>(),
  savedAt: text('saved_at'),
  ...timestampFields(),
});

// The OpenAI key is the one in audio_settings, shared with transcription.
export const aiSettings = sqliteTable('ai_settings', {
  ownerUserId: text('owner_user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  textProvider: text('text_provider')
    .$type<TextProvider>()
    .notNull()
    .default('workers_ai'),
  encryptedAnthropicKey: text('encrypted_anthropic_key'),
  ...timestampFields(),
});

/** Personal access tokens for agents (0007); revoked, never deleted. */
export const agentTokens = sqliteTable('agent_tokens', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  scopes: text('scopes').$type<'read' | 'read write'>().notNull(),
  secretHash: text('secret_hash').notNull(),
  createdAt: text('created_at').notNull().default(now),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
});

/** What an agent did to which item (0007); never content. */
export const agentActivity = sqliteTable('agent_activity', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenId: text('token_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  createdAt: text('created_at').notNull().default(now),
});

/** Notes linked to a task by hand (0006); removed with either side. */
export const taskNoteLinks = sqliteTable(
  'task_note_links',
  {
    taskId: text('task_id').notNull(),
    noteId: text('note_id').notNull(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.noteId] })],
);

export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    key: text('key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('idempotency_owner_key').on(t.ownerUserId, t.key)],
);

export const otpChallenges = sqliteTable('otp_challenges', {
  contact: text('contact').primaryKey(),
  challengeId: text('challenge_id').notNull().unique(),
  codeHash: text('code_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  nextSendAt: text('next_send_at').notNull(),
  windowStartedAt: text('window_started_at').notNull(),
  requests: integer('requests').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  ready: integer('ready', { mode: 'boolean' }).notNull().default(false),
  consumed: integer('consumed', { mode: 'boolean' }).notNull().default(false),
  consumedBy: text('consumed_by'),
});

export const audioSettings = sqliteTable('audio_settings', {
  ownerUserId: text('owner_user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // 0002 rebuilt this table: providers are 'workers_ai' (default) or 'openai'.
  provider: text('provider')
    .$type<'workers_ai' | 'openai'>()
    .notNull()
    .default('workers_ai'),
  encryptedApiKey: text('encrypted_api_key'),
  ...timestampFields(),
});

export const authThrottle = sqliteTable(
  'auth_throttle',
  {
    route: text('route').notNull(),
    client: text('client').notNull(),
    windowStartedAt: text('window_started_at').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.route, t.client] })],
);
