import { requestId } from './request-id.ts';
import type { TaskInput } from '@ordo/core';
import { RequestError } from './index.ts';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface PendingTask {
  key: string;
  ownerId: string;
  input: Partial<TaskInput> & { title: string };
  createdAt: string;
  error?: string;
}
const prefix = 'ordo.pending-tasks.v1:';
export function readQueue(
  storage: StorageLike,
  ownerId: string,
): PendingTask[] {
  const raw = storage.getItem(prefix + ownerId);
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      'Your saved offline queue could not be read. Keep this browser data and retry.',
    );
  }
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        item.ownerId !== ownerId ||
        typeof item.key !== 'string' ||
        typeof item.input?.title !== 'string',
    )
  ) {
    throw new Error(
      'Your offline queue needs recovery. Do not clear browser data.',
    );
  }
  return value;
}
export function enqueueTask(
  storage: StorageLike,
  ownerId: string,
  input: PendingTask['input'],
  key: string = requestId(),
): PendingTask {
  const queue = readQueue(storage, ownerId);
  const existing = queue.find((item) => item.key === key);
  if (existing) return existing;
  const item = { key, ownerId, input, createdAt: new Date().toISOString() };
  storage.setItem(prefix + ownerId, JSON.stringify([...queue, item]));
  return item;
}
export function removeQueuedTask(
  storage: StorageLike,
  ownerId: string,
  key: string,
) {
  storage.setItem(
    prefix + ownerId,
    JSON.stringify(
      readQueue(storage, ownerId).filter((item) => item.key !== key),
    ),
  );
}
export function discardQueue(storage: StorageLike, ownerId: string) {
  storage.removeItem(prefix + ownerId);
}
/** Drain sequentially; remove a record only after the server acknowledges its idempotency key. */
export async function drainQueue(
  storage: StorageLike,
  ownerId: string,
  create: (input: PendingTask['input'], key: string) => Promise<unknown>,
): Promise<number> {
  let saved = 0;
  for (const item of readQueue(storage, ownerId)) {
    try {
      await create(item.input, item.key);
    } catch (error) {
      if (
        error instanceof RequestError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        const queue = readQueue(storage, ownerId).map((entry) =>
          entry.key === item.key ? { ...entry, error: error.message } : entry,
        );
        storage.setItem(prefix + ownerId, JSON.stringify(queue));
      }
      if (
        error instanceof RequestError &&
        (error.status === 401 || error.code === 'SESSION_CHANGED')
      )
        throw error;
      break;
    }
    removeQueuedTask(storage, ownerId, item.key);
    saved++;
  }
  return saved;
}
