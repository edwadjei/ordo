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
  deletedAt: text('deleted_at'),
  ...revisionFields(),
});

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
