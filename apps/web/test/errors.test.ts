import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestError } from '@ordo/client';
import { lostToDelete, saveErrorText } from '../lib/errors.ts';

test('a save that raced a permanent delete is explained plainly', () => {
  const scope = new RequestError(
    409,
    'SCOPE_DELETED',
    'Something this change points to was just deleted.',
  );
  assert.equal(
    saveErrorText(scope, 'task'),
    'The workspace or project this task belongs in was just deleted, so this change wasn’t saved.',
  );
  assert.equal(lostToDelete(scope), true);
  const gone = new RequestError(404, 'NOT_FOUND', 'Not found');
  assert.equal(
    saveErrorText(gone, 'note'),
    'This note was just deleted, so this change wasn’t saved.',
  );
  assert.equal(lostToDelete(gone), true);
});

test('other errors keep their own message', () => {
  const stale = new RequestError(
    409,
    'REVISION_CONFLICT',
    'Changed elsewhere.',
  );
  assert.equal(saveErrorText(stale, 'task'), 'Changed elsewhere.');
  assert.equal(lostToDelete(stale), false);
  assert.equal(saveErrorText(new Error('Offline'), 'note'), 'Offline');
});
