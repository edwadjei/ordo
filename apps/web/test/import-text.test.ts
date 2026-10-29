import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptedFile,
  captionText,
  fileText,
  titleFromEmail,
  titleFromFile,
} from '../lib/import-text.ts';

test('WebVTT loses its header, cue ids, timestamps, notes and tags', () => {
  const vtt = [
    '﻿WEBVTT - team sync',
    '',
    'NOTE recorded on a fictional call',
    '',
    'intro',
    '00:00:01.000 --> 00:00:04.000 align:start',
    '<v Ama Mensah>Morning, everyone.</v>',
    '',
    '00:04.500 --> 00:07.000',
    '<v.loud Kofi>Let’s review the <b>UAT</b> plan &amp; dates.',
    '',
    '2',
    '00:00:07.000 --> 00:00:09.000',
    '<v.loud Kofi>Let’s review the <b>UAT</b> plan &amp; dates.',
  ].join('\r\n');
  assert.equal(
    captionText(vtt),
    'Ama Mensah: Morning, everyone.\nKofi: Let’s review the UAT plan & dates.',
  );
});

test('SubRip loses its cue numbers and comma timestamps', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:03,500',
    'Send QA the test scope.',
    '',
    '2',
    '00:00:03,500 --> 00:00:06,000',
    'Ask for readiness by Friday.',
    'Thanks.',
    '',
  ].join('\n');
  assert.equal(
    fileText('call.SRT', srt),
    'Send QA the test scope.\nAsk for readiness by Friday.\nThanks.',
  );
});

test('text and Markdown files keep their words as they are', () => {
  assert.equal(
    fileText('notes.md', '# Agenda\r\n\r\n- One\r\n'),
    '# Agenda\n\n- One',
  );
  assert.equal(
    fileText('a.txt', '00:00:01.000 --> 00:00:02.000'),
    '00:00:01.000 --> 00:00:02.000',
  );
});

test('only .txt, .md, .vtt and .srt files are accepted', () => {
  for (const name of ['a.txt', 'B.MD', 'c.vtt', 'd.srt'])
    assert.ok(acceptedFile(name), name);
  for (const name of ['a.docx', 'b.mp3', 'c.vtt.exe', 'srt'])
    assert.ok(!acceptedFile(name), name);
});

test('titles come from the file name or the email subject', () => {
  assert.equal(
    titleFromFile('team-sync_2026-10-29.vtt'),
    'team-sync 2026-10-29',
  );
  assert.equal(titleFromFile('.vtt'), 'Transcript');
  assert.equal(
    titleFromEmail('From: qa@example.test\nSubject:  UAT readiness \n\nHi'),
    'UAT readiness',
  );
  assert.equal(
    titleFromEmail('\n  Quick question about the launch\nMore'),
    'Quick question about the launch',
  );
  assert.equal(titleFromEmail(''), 'Email');
});
