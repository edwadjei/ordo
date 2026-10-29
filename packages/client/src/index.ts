import { requestId } from './request-id.ts';
import type {
  AiSettings,
  AiSettingsInput,
  CaptureRun,
  CaptureSave,
  CaptureSaveResult,
  Draft,
} from './capture.ts';
import {
  bookmarkHeader,
  createBookmarkStore,
  type BookmarkStore,
} from './bookmark.ts';
import type {
  ApiError,
  HomeSnapshot,
  Note,
  NoteInput,
  Project,
  Task,
  TaskInput,
  User,
  Workspace,
} from '@ordo/core';

export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}
export interface AppCapabilities {
  otp: { email: boolean; sms: boolean };
  recording: boolean;
  transcription: boolean;
  transcriptionProviders: { workersAi: boolean; openai: boolean };
  aiCapture: boolean;
  transcriptImport: boolean;
}
export interface AudioSettings {
  provider: 'workers_ai' | 'openai';
  workersAiAvailable: boolean;
  hasApiKey: boolean;
  configured: boolean;
}
export interface AudioSettingsInput {
  provider: AudioSettings['provider'];
  apiKey?: string;
  removeApiKey?: boolean;
}
export interface SearchResult {
  id: string;
  type: 'task' | 'note' | 'project';
  title: string;
  excerpt: string;
  workspaceId: string | null;
  projectId?: string | null;
}
export type TaskChanges = Partial<TaskInput> & { expectedRevision: number };
export type NoteChanges = Partial<NoteInput> & { expectedRevision: number };
export type ProjectChanges = Partial<
  Pick<Project, 'name' | 'description' | 'favorite'>
> & {
  /** Other names for AI routing: up to 10, each 1–60 characters. */
  aliases?: string[];
  expectedRevision: number;
};
export function createClient(
  base = '/api',
  transport: typeof fetch = fetch,
  onSessionInvalid?: () => void,
  bookmarks: BookmarkStore = createBookmarkStore(),
) {
  let accountId: string | null = null;
  async function request<T>(
    route: string,
    options: RequestInit = {},
  ): Promise<T> {
    // Reads that work before an account is known; every write (including
    // PATCH /auth/me, setting your name) carries the account guard.
    const authenticatedRequest =
      !['/auth/otp/request', '/auth/otp/verify', '/capabilities'].includes(
        route,
      ) &&
      !(
        ['/auth/me', '/home'].includes(route) &&
        (options.method || 'GET') === 'GET'
      );
    const requestAccount = accountId;
    const bookmark = bookmarks.get(requestAccount);
    const response = await transport(`${base}${route}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(authenticatedRequest && requestAccount
          ? { 'X-Ordo-Account': requestAccount }
          : {}),
        ...(bookmark ? { [bookmarkHeader]: bookmark } : {}),
        ...options.headers,
      },
    });
    const nextBookmark = response.headers?.get(bookmarkHeader);
    if (nextBookmark) bookmarks.set(requestAccount, nextBookmark);
    const payload = (await response.json().catch(() => null)) as
      T | ApiError | null;
    if (!response.ok) {
      const error =
        payload && 'error' in Object(payload)
          ? (payload as ApiError).error
          : null;
      if (
        authenticatedRequest &&
        requestAccount &&
        requestAccount === accountId &&
        (response.status === 401 || error?.code === 'SESSION_CHANGED')
      )
        onSessionInvalid?.();
      throw new RequestError(
        response.status,
        error?.code || 'REQUEST_FAILED',
        error?.message || 'Could not save your changes. Please try again.',
      );
    }
    return payload as T;
  }
  const send = <T>(
    route: string,
    method: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) =>
    request<T>(route, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers,
    });
  return {
    setAccount: (id: string | null) => {
      accountId = id;
      if (id) bookmarks.adopt(id);
    },
    capabilities: () => request<AppCapabilities>('/capabilities'),
    audioSettings: (signal?: AbortSignal) =>
      request<AudioSettings>('/settings/audio', { signal }),
    saveAudioSettings: (data: AudioSettingsInput, signal?: AbortSignal) =>
      request<AudioSettings>('/settings/audio', {
        method: 'PATCH',
        body: JSON.stringify(data),
        signal,
      }),
    testAudioSettings: (signal?: AbortSignal) =>
      request<{ ok: boolean; message: string }>('/settings/audio/test', {
        method: 'POST',
        signal,
      }),
    requestOtp: (contact: string) =>
      send<{
        challengeId: string;
        retryAfterSeconds: number;
        expiresInSeconds: number;
      }>('/auth/otp/request', 'POST', { contact }),
    verifyOtp: (data: {
      challengeId: string;
      code: string;
      displayName?: string;
    }) => send<{ user: User }>('/auth/otp/verify', 'POST', data),
    search: (query: string, signal?: AbortSignal) =>
      request<{ results: SearchResult[] }>(
        `/search?q=${encodeURIComponent(query)}`,
        { signal },
      ),
    transcribeAudio: (
      audio: Blob,
      signal: AbortSignal | undefined,
      provider: AudioSettings['provider'],
    ) =>
      request<{ transcript: string }>('/transcriptions', {
        method: 'POST',
        body: audio,
        signal,
        headers: {
          'Content-Type': audio.type || 'audio/webm',
          'X-Ordo-Audio-Provider': provider,
        },
      }),
    home: () => request<HomeSnapshot>('/home'),
    me: () => request<{ user: User }>('/auth/me'),
    /** Sets or clears (null or empty) the signed-in account's name. */
    updateMe: (data: { displayName: string | null }) =>
      send<{ user: User }>('/auth/me', 'PATCH', data),
    logout: async () => {
      const signingOut = accountId;
      try {
        await send<void>('/auth/logout', 'POST');
      } finally {
        bookmarks.clear(signingOut);
      }
    },
    demo: () => send<HomeSnapshot>('/demo', 'POST'),
    createWorkspace: (data: { name: string; color?: string }) =>
      send<Workspace>('/workspaces', 'POST', data),
    createProject: (data: {
      name: string;
      workspaceId: string;
      description?: string;
      favorite?: boolean;
    }) => send<Project>('/projects', 'POST', data),
    updateProject: (id: string, data: ProjectChanges) =>
      send<Project>(`/projects/${id}`, 'PATCH', data),
    createTask: (
      data: Partial<TaskInput> & { title: string },
      key: string = requestId(),
      ownerId?: string,
    ) =>
      send<Task>('/tasks', 'POST', data, {
        'Idempotency-Key': key,
        ...(ownerId ? { 'X-Ordo-Account': ownerId } : {}),
      }),
    updateTask: (id: string, data: TaskChanges) =>
      send<Task>(`/tasks/${id}`, 'PATCH', data),
    archiveTask: (id: string, revision: number) =>
      send<void>(`/tasks/${id}`, 'DELETE', { expectedRevision: revision }),
    createNote: (data: Partial<NoteInput> & { title: string }) =>
      send<Note>('/notes', 'POST', data),
    updateNote: (id: string, data: NoteChanges) =>
      send<Note>(`/notes/${id}`, 'PATCH', data),
    archiveNote: (id: string, revision: number) =>
      send<void>(`/notes/${id}`, 'DELETE', { expectedRevision: revision }),
    /** Runs AI on a note, only when the person asks; a failed or pending run leaves the note intact. */
    processNote: (
      id: string,
      data: { workspaceId: string; projectId?: string | null },
      signal?: AbortSignal,
    ) =>
      request<CaptureRun>(`/notes/${id}/process`, {
        method: 'POST',
        body: JSON.stringify(data),
        signal,
      }),
    captureRun: (id: string, signal?: AbortSignal) =>
      request<CaptureRun>(`/capture-runs/${id}`, { signal }),
    noteCaptureRuns: (noteId: string, signal?: AbortSignal) =>
      request<CaptureRun[]>(`/notes/${noteId}/capture-runs`, {
        signal,
      }),
    /** Saves the reviewed suggestions in one batch; a second save of a run is refused. */
    saveCaptureRun: (
      id: string,
      data: CaptureSave,
      key: string = requestId(),
    ) =>
      send<CaptureSaveResult>(`/capture-runs/${id}/save`, 'POST', data, {
        'Idempotency-Key': key,
      }),
    /** Drafts, newest first, optionally for one project or workspace. */
    drafts: (
      filter: { projectId?: string; workspaceId?: string } = {},
      signal?: AbortSignal,
    ) => {
      const query = new URLSearchParams(
        Object.entries(filter).filter(([, value]) => !!value) as [
          string,
          string,
        ][],
      ).toString();
      return request<Draft[]>(`/drafts${query ? `?${query}` : ''}`, { signal });
    },
    updateDraft: (
      id: string,
      data: Partial<Pick<Draft, 'to' | 'subject' | 'body' | 'kind'>> & {
        used?: boolean;
        expectedRevision: number;
      },
    ) => send<Draft>(`/drafts/${id}`, 'PATCH', data),
    /** Records that a draft was used elsewhere. Ordo never sends drafts. */
    markDraftUsed: (id: string, revision: number) =>
      send<Draft>(`/drafts/${id}`, 'PATCH', {
        used: true,
        expectedRevision: revision,
      }),
    archiveDraft: (id: string, revision: number) =>
      send<void>(`/drafts/${id}`, 'DELETE', { expectedRevision: revision }),
    aiSettings: (signal?: AbortSignal) =>
      request<AiSettings>('/settings/ai', { signal }),
    saveAiSettings: (data: AiSettingsInput, signal?: AbortSignal) =>
      request<AiSettings>('/settings/ai', {
        method: 'PATCH',
        body: JSON.stringify(data),
        signal,
      }),
  };
}
export type OrdoClient = ReturnType<typeof createClient>;
export type * from './capture.ts';
export {
  bookmarkHeader,
  createBookmarkStore,
  type BookmarkStore,
  type BookmarkStorage,
} from './bookmark.ts';
export type {
  HomeSnapshot,
  Task,
  Note,
  Workspace,
  Project,
  User,
  TaskInput,
  NoteInput,
} from '@ordo/core';
export { requestId } from './request-id.ts';
