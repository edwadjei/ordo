import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteBodyLength, notePreview } from '@ordo/core';
import { apiHarness, origin, signIn } from './d1-harness.js';

// Home and note lists carry a preview instead of the body, so a large
// account's /home stays small; a single note still carries its whole body.

test('the preview is the first 280 code points and never splits a character', () => {
  assert.equal(notePreview('short'), 'short');
  assert.equal(notePreview('x'.repeat(300)), 'x'.repeat(280));
  // 279 letters then an emoji (a surrogate pair): the emoji stays whole.
  const emoji = `${'x'.repeat(279)}😀tail`;
  assert.equal(notePreview(emoji), `${'x'.repeat(279)}😀`);
  assert.equal(notePreview('😀'.repeat(300)), '😀'.repeat(280));
  assert.equal(noteBodyLength('😀ab'), 3);
  assert.equal(noteBodyLength(''), 0);
});

test('home and note lists send previews; single notes send the body too', async (t) => {
  const h = await apiHarness();
  t.after(() => h.app.close());
  const { cookie } = await signIn(h);
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    h.app.inject({
      method,
      url,
      headers: { origin, cookie },
      ...(payload ? { payload } : {}),
    });
  const body = `${'€'.repeat(279)}😀 and the rest of a long note. `.repeat(200);
  const created = (
    await call('POST', '/v1/notes', { title: 'Long', body })
  ).json();
  // Every single-note response: the whole body, with its preview and length.
  assert.equal(created.body, body);
  assert.equal(created.preview, `${'€'.repeat(279)}😀`);
  assert.equal(created.bodyLength, noteBodyLength(body));
  const read = (await call('GET', `/v1/notes/${created.id}`)).json();
  assert.equal(read.body, body);
  assert.equal(read.preview, created.preview);
  assert.equal(read.bodyLength, created.bodyLength);
  assert.equal(read.latestCaptureStatus, null);
  const edited = (
    await call('PATCH', `/v1/notes/${created.id}`, {
      body: 'Now short.',
      expectedRevision: 1,
    })
  ).json();
  assert.deepEqual(
    [edited.body, edited.preview, edited.bodyLength],
    ['Now short.', 'Now short.', 10],
  );
  await call('PATCH', `/v1/notes/${created.id}`, { body, expectedRevision: 2 });
  // Lists: no body; the preview and length match what SQLite computed.
  for (const notes of [
    (await call('GET', '/v1/notes')).json(),
    (await call('GET', '/v1/home')).json().notes,
  ]) {
    assert.equal(notes.length, 1);
    const [entry] = notes;
    assert.equal('body' in entry, false);
    assert.equal(entry.preview, created.preview);
    assert.equal(entry.bodyLength, noteBodyLength(body));
    assert.equal(entry.title, 'Long');
    assert.equal(entry.revision, 3);
    assert.equal(entry.latestCaptureStatus, null);
  }
  const archived = (
    await call('DELETE', `/v1/notes/${created.id}`, { expectedRevision: 3 })
  ).json();
  assert.equal(archived.body, body);
  assert.equal(archived.preview, created.preview);
  assert.deepEqual((await call('GET', '/v1/notes')).json(), []);
});
