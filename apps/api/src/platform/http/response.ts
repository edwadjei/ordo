import type { HttpReply } from './http.js';

export function publicRecord<T extends { ownerUserId: string }>(record: T) {
  const { ownerUserId: _owner, ...result } = record;
  return result;
}

/** Marks the response 201 Created and returns its body. */
export function created<T>(reply: HttpReply, body: T) {
  reply.status(201);
  return body;
}
