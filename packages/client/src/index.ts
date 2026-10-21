import { requestId } from './request-id.ts';
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
  aiCapture: boolean;
  transcriptImport: boolean;
}
export interface SearchResult {
  id: string;
  type: 'task' | 'note' | 'project';
  title: string;
  excerpt: string;
  workspaceId: string | null;
  projectId?: string | null;
}
export interface AudioCapture {
  id: string;
  status: 'recorded' | 'transcribing' | 'transcribed' | 'failed';
  transcript?: string | null;
  mimeType?: string;
  createdAt?: string;
}
export type TaskChanges = Partial<TaskInput> & { expectedRevision: number };
export type NoteChanges = Partial<NoteInput> & { expectedRevision: number };
export function createClient(
  base = '/api',
  transport: typeof fetch = fetch,
  onSessionInvalid?: () => void,
) {
  let accountId: string | null = null;
  async function request<T>(
    route: string,
    options: RequestInit = {},
  ): Promise<T> {
    const authenticatedRequest = ![
      '/auth/register',
      '/auth/login',
      '/auth/otp/request',
      '/auth/otp/verify',
      '/auth/me',
      '/home',
      '/capabilities',
    ].includes(route);
    const requestAccount = accountId;
    const response = await transport(`${base}${route}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(authenticatedRequest && requestAccount
          ? { 'X-Ordo-Account': requestAccount }
          : {}),
        ...options.headers,
      },
    });
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
    },
    capabilities: () => request<AppCapabilities>('/capabilities'),
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
    createCapture: (audio: Blob, signal?: AbortSignal) =>
      request<AudioCapture>('/captures', {
        method: 'POST',
        body: audio,
        signal,
        headers: { 'Content-Type': audio.type || 'audio/webm' },
      }),
    capture: (id: string) =>
      request<AudioCapture>(`/captures/${encodeURIComponent(id)}`),
    captures: () => request<{ captures: AudioCapture[] }>('/captures'),
    transcribe: (id: string, signal?: AbortSignal) =>
      request<AudioCapture>(`/captures/${encodeURIComponent(id)}/transcribe`, {
        method: 'POST',
        signal,
      }),
    captureAudioUrl: (id: string) =>
      `${base}/captures/${encodeURIComponent(id)}/audio`,
    home: () => request<HomeSnapshot>('/home'),
    me: () => request<{ user: User }>('/auth/me'),
    register: (data: {
      email: string;
      password: string;
      displayName: string;
    }) => send<{ user: User }>('/auth/register', 'POST', data),
    login: (data: { email: string; password: string }) =>
      send<{ user: User }>('/auth/login', 'POST', data),
    logout: () => send<void>('/auth/logout', 'POST'),
    demo: () => send<HomeSnapshot>('/demo', 'POST'),
    createWorkspace: (data: { name: string; color?: string }) =>
      send<Workspace>('/workspaces', 'POST', data),
    createProject: (data: {
      name: string;
      workspaceId: string;
      description?: string;
    }) => send<Project>('/projects', 'POST', data),
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
  };
}
export type OrdoClient = ReturnType<typeof createClient>;
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
