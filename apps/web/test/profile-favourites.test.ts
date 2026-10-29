import test from 'node:test';
import assert from 'node:assert/strict';
import {
  favoritesFirst,
  initials,
  nameProblem,
  noteSourceLabel,
  notePreview,
  profileName,
} from '../lib/views.ts';

test('a name can be saved, cleared, but never be contact details or too long', () => {
  assert.equal(nameProblem('Ama Mensah'), '');
  assert.equal(nameProblem('   '), '');
  assert.match(nameProblem('ama@example.test'), /not a phone number or email/);
  assert.match(nameProblem('+233 24 000 0000'), /not a phone number or email/);
  assert.match(nameProblem('x'.repeat(81)), /80 characters/);
});

test('the avatar shows initials only for a real name', () => {
  assert.equal(initials('Ama Mensah'), 'AM');
  assert.equal(initials('kofi'), 'K');
  assert.equal(initials('Ama Akua Mensah'), 'AA');
  for (const value of [
    '',
    null,
    '0558601966',
    'ama@example.test',
    'Ordo member',
  ])
    assert.equal(initials(value), '', String(value));
  assert.equal(profileName('Ama Mensah'), 'Ama Mensah');
  assert.equal(profileName('0558601966'), 'Your account');
  assert.equal(profileName(''), 'Your account');
});

test('favourite projects come first and keep their order otherwise', () => {
  const projects = [
    { id: 'a', favorite: false },
    { id: 'b', favorite: true },
    { id: 'c', favorite: false },
    { id: 'd', favorite: true },
  ];
  assert.deepEqual(
    favoritesFirst(projects).map((p) => p.id),
    ['b', 'd', 'a', 'c'],
  );
});

test('note sources are labelled except ordinary typed notes', () => {
  assert.equal(noteSourceLabel('manual'), '');
  assert.equal(noteSourceLabel(undefined), '');
  assert.equal(noteSourceLabel('email'), 'From an email');
  assert.equal(noteSourceLabel('transcript'), 'From a transcript');
  assert.equal(noteSourceLabel('recording'), 'From a recording');
});

test('note cards preview Markdown without its marks', () => {
  assert.equal(
    notePreview(
      '## Plan\n- [x] **Book** venue\n- [ ] call [Kofi](https://example.test)\n1. _soon_\nkeep snake_case',
    ),
    'Plan · ☑ Book venue · ☐ call Kofi · soon · keep snake_case',
  );
  assert.equal(notePreview('plain text note'), 'plain text note');
});
