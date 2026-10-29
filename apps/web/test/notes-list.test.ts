import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasFullBody,
  listPreview,
  noteLength,
  previewIsPartial,
} from '../lib/notes.ts';

test('lists use the preview and know when it is only the start', () => {
  const listed = { id: 'n1', preview: 'x'.repeat(280), bodyLength: 4000 };
  assert.equal(listPreview(listed).length, 280);
  assert.equal(noteLength(listed), 4000);
  assert.equal(previewIsPartial(listed), true);
  assert.equal(hasFullBody(listed), false);
  const short = { id: 'n2', preview: 'Call Kofi', bodyLength: 9 };
  assert.equal(previewIsPartial(short), false);
});

test('a preview is never taken for the full body', () => {
  // A list entry may carry a body-like field equal to the preview only.
  assert.equal(hasFullBody({ id: 'n', body: 'start', bodyLength: 900 }), false);
  assert.equal(hasFullBody({ id: 'n', body: 'whole', bodyLength: 5 }), true);
});

test('snapshots saved before the change (body, no preview) still read', () => {
  const old = { id: 'n', body: 'Old cached body' };
  assert.equal(listPreview(old), 'Old cached body');
  assert.equal(noteLength(old), 15);
  assert.equal(hasFullBody(old), true);
});
