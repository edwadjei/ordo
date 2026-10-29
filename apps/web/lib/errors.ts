import { RequestError } from '@ordo/client';

/**
 * Plain words for a save that lost a race with a permanent delete. Other
 * errors keep the API's own message.
 */
export function saveErrorText(error: unknown, what: 'task' | 'note') {
  if (error instanceof RequestError) {
    if (error.code === 'SCOPE_DELETED')
      return `The workspace or project this ${what} belongs in was just deleted, so this change wasn’t saved.`;
    if (error.status === 404)
      return `This ${what} was just deleted, so this change wasn’t saved.`;
  }
  return (error as Error)?.message || 'Couldn’t save your changes.';
}
/** True when the place being saved into (or the item) no longer exists. */
export const lostToDelete = (error: unknown) =>
  error instanceof RequestError &&
  (error.code === 'SCOPE_DELETED' || error.status === 404);
