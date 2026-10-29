import test from 'node:test';
import assert from 'node:assert/strict';
import {
  continueList,
  formatLines,
  insertLink,
  parseInline,
  parseMarkdown,
  plainText,
  safeHref,
  toggleTask,
  wrapSelection,
} from '../lib/markdown.ts';

test('plain-text notes stay paragraphs, line by line', () => {
  assert.deepEqual(parseMarkdown('Call Kofi\nabout the launch\n\nThen rest.'), [
    {
      type: 'paragraph',
      lines: [
        [{ type: 'text', text: 'Call Kofi' }],
        [{ type: 'text', text: 'about the launch' }],
      ],
    },
    { type: 'paragraph', lines: [[{ type: 'text', text: 'Then rest.' }]] },
  ]);
});

test('headings, bullets, numbered and checklist items keep their line numbers', () => {
  const blocks = parseMarkdown(
    '## Plan\n- one\n- two\n\n1. first\n2. second\n- [ ] open\n- [x] done',
  );
  assert.equal(blocks[0].type, 'heading');
  assert.deepEqual(
    blocks
      .slice(1)
      .map((b) =>
        b.type === 'list'
          ? [b.ordered, b.items.map((i) => [i.line, i.checked])]
          : b.type,
      ),
    [
      [
        false,
        [
          [1, null],
          [2, null],
        ],
      ],
      [
        true,
        [
          [4, null],
          [5, null],
        ],
      ],
      [
        false,
        [
          [6, false],
          [7, true],
        ],
      ],
    ],
  );
});

test('bold, italic and links parse; snake_case and unsafe links do not', () => {
  assert.deepEqual(parseInline('**bold** and _it_'), [
    { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
    { type: 'text', text: ' and ' },
    { type: 'em', children: [{ type: 'text', text: 'it' }] },
  ]);
  assert.deepEqual(parseInline('keep snake_case_name'), [
    { type: 'text', text: 'keep snake_case_name' },
  ]);
  assert.deepEqual(parseInline('[site](https://example.test/a)'), [
    {
      type: 'link',
      href: 'https://example.test/a',
      children: [{ type: 'text', text: 'site' }],
    },
  ]);
  for (const href of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,hi',
    'vbscript:x',
    'file:///etc/passwd',
    '/relative',
  ]) {
    const nodes = parseInline(`[x](${href})`);
    assert.deepEqual(
      nodes,
      [{ type: 'text', text: `[x](${href})` }],
      `${href} must stay as typed text`,
    );
  }
  assert.equal(safeHref('mailto:ama@example.test'), 'mailto:ama@example.test');
  assert.equal(safeHref('http://example.test'), 'http://example.test/');
});

test('raw HTML is kept as text, never markup', () => {
  assert.deepEqual(parseMarkdown('<img src=x onerror=alert(1)>'), [
    {
      type: 'paragraph',
      lines: [[{ type: 'text', text: '<img src=x onerror=alert(1)>' }]],
    },
  ]);
});

test('ticking a checklist item changes only its box', () => {
  const note = '- [ ] buy milk\n  - [x] nested\nnot a task';
  assert.equal(
    toggleTask(note, 0),
    '- [x] buy milk\n  - [x] nested\nnot a task',
  );
  assert.equal(
    toggleTask(note, 1),
    '- [ ] buy milk\n  - [ ] nested\nnot a task',
  );
  assert.equal(toggleTask(note, 2), note);
});

test('plain text for cards drops the marks', () => {
  assert.equal(
    plainText('## Plan\n- [x] **Book** venue\n1. [Call](https://example.test)'),
    'Plan\n☑ Book venue\nCall',
  );
});

test('line formats apply to each selected line and toggle off', () => {
  const text = 'one\ntwo';
  const listed = formatLines(text, 0, text.length, 'numbered');
  assert.equal(listed.text, '1. one\n2. two');
  assert.equal(
    formatLines(listed.text, 0, listed.text.length, 'numbered').text,
    text,
  );
  assert.equal(formatLines('- one', 2, 2, 'checklist').text, '- [ ] one');
  assert.equal(formatLines('Title', 0, 0, 'heading').text, '## Title');
  assert.equal(formatLines('## Title', 4, 4, 'heading').text, 'Title');
});

test('bold and italic wrap the selection, or a placeholder, and unwrap', () => {
  const bold = wrapSelection('say hi', 4, 6, '**', 'bold text');
  assert.deepEqual(bold, { text: 'say **hi**', start: 6, end: 8 });
  assert.deepEqual(wrapSelection(bold.text, 6, 8, '**', ''), {
    text: 'say hi',
    start: 4,
    end: 6,
  });
  assert.equal(
    wrapSelection('', 0, 0, '_', 'italic text').text,
    '_italic text_',
  );
});

test('links accept web and email addresses only', () => {
  assert.equal(
    insertLink('read this', 5, 9, 'https://example.test')?.text,
    'read [this](https://example.test/)',
  );
  assert.equal(
    insertLink('', 0, 0, 'www.example.test')?.text,
    '[https://www.example.test/](https://www.example.test/)',
  );
  assert.equal(
    insertLink('', 0, 0, 'ama@example.test')?.text,
    '[ama@example.test](mailto:ama@example.test)',
  );
  assert.equal(insertLink('x', 0, 1, 'javascript:alert(1)'), null);
});

test('Enter continues a list and ends it on an empty item', () => {
  assert.equal(continueList('- [x] milk', 10)?.text, '- [x] milk\n- [ ] ');
  assert.equal(continueList('3. three', 8)?.text, '3. three\n4. ');
  assert.equal(continueList('- one\n- ', 8)?.text, '- one\n');
  assert.equal(continueList('plain', 5), null);
  assert.equal(continueList('- item', 2), null);
});

test('a line format on an empty line starts that format', () => {
  assert.deepEqual(formatLines('', 0, 0, 'heading'), {
    text: '## ',
    start: 3,
    end: 3,
  });
  assert.equal(formatLines('a\n\n', 3, 3, 'checklist').text, 'a\n\n- [ ] ');
});
