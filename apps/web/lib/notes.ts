import type { Note } from '@ordo/client';

/**
 * Note lists (/home, /notes) carry a `preview` (the first 280 characters) and
 * `bodyLength`, not the body; the body is fetched when a note opens. These
 * read either shape, so cached snapshots from before the change still work.
 */
type Listed = Pick<Note, 'id'> & {
  body?: string;
  preview?: string;
  bodyLength?: number;
};

export const listPreview = (note: Listed) => note.preview ?? note.body ?? '';
export const noteLength = (note: Listed) =>
  note.bodyLength ?? note.body?.length ?? 0;
/** True when the list only has the start of the note. */
export const previewIsPartial = (note: Listed) =>
  noteLength(note) > listPreview(note).length;
/** A note from a list counts as loaded only when it carries its whole body. */
export const hasFullBody = (note: Listed): note is Listed & { body: string } =>
  typeof note.body === 'string' && note.body.length === noteLength(note);
