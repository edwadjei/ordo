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
export type TaskChanges = Partial<TaskInput> & { expectedRevision: number };
export type NoteChanges = Partial<NoteInput> & { expectedRevision: number };
export function createClient(base = '/api', transport: typeof fetch = fetch) {
  let accountId: string | null = null;
  async function request<T>(
    route: string,
    options: RequestInit = {},
  ): Promise<T> {
    const authenticatedWrite =
      options.method &&
      options.method !== 'GET' &&
      !['/auth/register', '/auth/login'].includes(route);
    const response = await transport(`${base}${route}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(authenticatedWrite && accountId
          ? { 'X-Ordo-Account': accountId }
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
      key: string = crypto.randomUUID(),
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
