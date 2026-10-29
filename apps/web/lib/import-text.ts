/**
 * Turning a pasted email or a transcript file into note text. Everything here
 * runs in the browser: the file is read locally and only its text is saved.
 */
export const noteBodyLimit = 100_000;
export const transcriptExtensions = ['.txt', '.md', '.vtt', '.srt'] as const;

const timing =
  /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

/**
 * Plain text from a WebVTT or SubRip file: the header, cue numbers, cue
 * identifiers, timestamps, NOTE/STYLE/REGION blocks and inline tags are
 * removed. A speaker given as `<v Ama>` becomes "Ama: ". Lines repeated by
 * consecutive cues (a common caption pattern) are kept once.
 */
export function captionText(source: string) {
  const blocks = source
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);
  const lines: string[] = [];
  for (const block of blocks) {
    const rows = block.split('\n').filter((row) => row.trim() !== '');
    if (!rows.length) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(rows[0])) continue;
    const at = rows.findIndex((row) => timing.test(row.trim()));
    // A block with no timing line is not a cue (stray text keeps its words).
    const text = at < 0 ? rows : rows.slice(at + 1);
    for (const row of text) {
      const line = row
        .replace(/<v(?:\.[^\s>]+)?\s+([^>]+)>/g, '$1: ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line && lines.at(-1) !== line) lines.push(line);
    }
  }
  return lines.join('\n');
}

/** The note text for a picked file, by its extension. */
export function fileText(name: string, contents: string) {
  const extension = name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  const text =
    extension === '.vtt' || extension === '.srt'
      ? captionText(contents)
      : contents.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  return text.trim();
}

/** True when the file's name says it is one Ordo can read. */
export function acceptedFile(name: string) {
  const lower = name.toLowerCase();
  return transcriptExtensions.some((extension) => lower.endsWith(extension));
}

/** A title from a file name: "team-sync_2026-10-29.vtt" → "team-sync 2026-10-29". */
export function titleFromFile(name: string) {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/_+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || 'Transcript'
  );
}

/** A title from pasted email text: its Subject line, else its first line. */
export function titleFromEmail(text: string) {
  const subject = text.match(/^\s*subject:\s*(.+)$/im)?.[1];
  const first = text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return (
    (subject || first || 'Email').trim().slice(0, 200) || 'Email'
  ).replace(/\s+/g, ' ');
}
