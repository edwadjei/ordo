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
export const projectInput = z
  .object({
    name,
    workspaceId: id,
    description: z.string().max(5000).default(''),
  })
  .strict();
export const scopeInput = z.object({
  workspaceId: id.nullable().default(null),
  projectId: id.nullable().default(null),
});
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
export const noteInput = scopeInput
  .extend({ title: name, body: z.string().max(100000).default('') })
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
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export const projectPatch = z
  .object({
    name: name.optional(),
    description: z.string().max(5000).optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();

/**
 * Transcription providers an account can choose. `workers_ai` (Cloudflare
 * Workers AI Whisper, through the Worker's `AI` binding) is the default;
 * `openai` uses the account's own saved key.
 */
export const audioProviders = ['workers_ai', 'openai'] as const;
export type AudioProvider = (typeof audioProviders)[number];
export const defaultAudioProvider: AudioProvider = 'workers_ai';

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
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Task extends TaskInput {
  id: string;
  revision: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Note extends NoteInput {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface HomeSnapshot {
  user: User;
  workspaces: Workspace[];
  projects: Project[];
  tasks: Task[];
  notes: Note[];
}
export interface ApiError {
  error: { code: string; message: string };
}
