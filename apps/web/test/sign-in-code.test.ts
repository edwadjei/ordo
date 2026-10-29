import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSignInCode, signInCodeProblem } from '../lib/sign-in-code.ts';

test('a typed code is kept as is', () => {
  assert.equal(normalizeSignInCode('658659'), '658659');
});

test('pasted codes with spaces, dashes and line breaks become six digits', () => {
  for (const pasted of [
    '658 659',
    '658-659',
    ' 658659 ',
    '658659\n',
    '\t658 – 659\r\n',
    '6 5 8 6 5 9',
  ])
    assert.equal(normalizeSignInCode(pasted), '658659', JSON.stringify(pasted));
});

test('invisible and non-breaking characters are removed', () => {
  assert.equal(normalizeSignInCode('658 659'), '658659');
  assert.equal(normalizeSignInCode('658​659'), '658659');
  assert.equal(normalizeSignInCode('﻿658 659‍'), '658659');
});

test('full-width and Arabic-Indic digits are read as 0-9', () => {
  assert.equal(normalizeSignInCode('６５８６５９'), '658659');
  assert.equal(normalizeSignInCode('٦٥٨٦٥٩'), '658659');
  assert.equal(normalizeSignInCode('۶۵۸۶۵۹'), '658659');
});

test('a pasted message line gives the first six digits', () => {
  assert.equal(
    normalizeSignInCode('Your Ordo code is 658659. It expires in 10 minutes.'),
    '658659',
  );
  assert.equal(normalizeSignInCode('6586591234'), '658659');
});

test('text without digits becomes empty', () => {
  assert.equal(normalizeSignInCode(''), '');
  assert.equal(normalizeSignInCode('abc - '), '');
});

test('problems are explained in plain words, and six digits are ready', () => {
  assert.equal(
    signInCodeProblem(''),
    'Enter the six-digit code from your message.',
  );
  assert.equal(signInCodeProblem('6'), 'That code has 1 digit. Enter all six.');
  assert.equal(
    signInCodeProblem('65865'),
    'That code has 5 digits. Enter all six.',
  );
  assert.equal(signInCodeProblem('658659'), '');
});
