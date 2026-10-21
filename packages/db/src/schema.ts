import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
const timestampFields = () => ({
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});
const revisionFields = () => ({
  revision: integer('revision').notNull().default(1),
  ...timestampFields(),
});
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  timezone: text('timezone').notNull().default('Africa/Accra'),
  passwordHash: text('password_hash').notNull(),
  phone: text('phone').unique(),
  emailVerifiedAt: timestamp('email_verified_at', {
    withTimezone: true,
    mode: 'string',
  }),
  phoneVerifiedAt: timestamp('phone_verified_at', {
    withTimezone: true,
    mode: 'string',
  }),
  demoLoaded: boolean('demo_loaded').notNull().default(false),
  ...timestampFields(),
});
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
});
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  color: text('color').notNull(),
  ...revisionFields(),
});
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  ...revisionFields(),
});
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  projectId: uuid('project_id').references(() => projects.id),
  parentId: uuid('parent_id'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status')
    .$type<'todo' | 'in_progress' | 'waiting' | 'done'>()
    .notNull()
    .default('todo'),
  priority: text('priority').$type<'low' | 'medium' | 'high'>(),
  dueDate: date('due_date', { mode: 'string' }),
  followUpDate: date('follow_up_date', { mode: 'string' }),
  completedAt: timestamp('completed_at', {
    withTimezone: true,
    mode: 'string',
  }),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  ...revisionFields(),
});
export const notes = pgTable('notes', {
  id: uuid('id').primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  projectId: uuid('project_id').references(() => projects.id),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  ...revisionFields(),
});
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    key: text('key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('idempotency_owner_key').on(t.ownerUserId, t.key)],
);

export const otpChallenges = pgTable('otp_challenges', {
  contact: text('contact').primaryKey(),
  challengeId: uuid('challenge_id').notNull().unique(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  nextSendAt: timestamp('next_send_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  windowStartedAt: timestamp('window_started_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  requests: integer('requests').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  ready: boolean('ready').notNull().default(false),
  consumed: boolean('consumed').notNull().default(false),
});
