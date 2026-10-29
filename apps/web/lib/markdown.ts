/**
 * The small Markdown Ordo notes use: headings, bullet, numbered and checklist
 * items, bold, italic and links. Note text is parsed into plain data and
 * rendered as React elements; it is never turned into HTML. Anything outside
 * this subset stays as the text it is, so every plain-text note is valid.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export interface ListItem {
  /** Zero-based line in the note, for ticking a checklist item in place. */
  line: number;
  /** null for a bullet or numbered item; otherwise whether it is ticked. */
  checked: boolean | null;
  depth: number;
  content: Inline[];
}
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'paragraph'; lines: Inline[][] };

const heading = /^(#{1,3})\s+(.*)$/;
const listItem = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/;
const emptyItem = /^(\s*)([-*+]|(\d{1,9})[.)])(?:\s+\[( |x|X)\])?\s*$/;

/** Only web and email links are ever made clickable. */
export function safeHref(value: string) {
  const href = value.trim();
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: Inline[][] | null = null;
  let list: Extract<Block, { type: 'list' }> | null = null;
  const close = () => {
    paragraph = null;
    list = null;
  };
  lines.forEach((raw, line) => {
    if (!raw.trim()) return close();
    const h = raw.match(heading);
    if (h) {
      close();
      blocks.push({
        type: 'heading',
        level: h[1].length as 1 | 2 | 3,
        content: parseInline(h[2].trim()),
      });
      return;
    }
    const item = raw.match(listItem) || raw.match(emptyItem);
    if (item) {
      paragraph = null;
      const ordered = item[3] !== undefined;
      if (!list || list.ordered !== ordered) {
        list = {
          type: 'list',
          ordered,
          start: ordered ? Number(item[3]) : 1,
          items: [],
        };
        blocks.push(list);
      }
      list.items.push({
        line,
        checked: item[4] === undefined ? null : item[4] !== ' ',
        depth: Math.min(Math.floor(item[1].replace(/\t/g, '  ').length / 2), 3),
        content: parseInline((item[5] || '').trim()),
      });
      return;
    }
    list = null;
    if (!paragraph) {
      paragraph = [];
      blocks.push({ type: 'paragraph', lines: paragraph });
    }
    paragraph.push(parseInline(raw.trim()));
  });
  return blocks;
}

/** Bold (`**`/`__`), italic (`*`/`_`) and `[text](url)` links; the rest is text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ type: 'text', text: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest[0] === '\\' && rest.length > 1 && /[\\*_[\]()#-]/.test(rest[1])) {
      plain += rest[1];
      i += 2;
      continue;
    }
    const link = rest.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)/);
    if (link) {
      const href = safeHref(link[2]);
      // A link Ordo won't open (javascript:, data:, …) stays as the text typed.
      if (href) {
        flush();
        out.push({ type: 'link', href, children: parseInline(link[1]) });
        i += link[0].length;
        continue;
      }
    }
    const strong = rest.match(/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/);
    if (strong) {
      flush();
      out.push({ type: 'strong', children: parseInline(strong[2]) });
      i += strong[0].length;
      continue;
    }
    const em = rest.match(/^([*_])(?=\S)([^*_]*?\S)\1(?![*_])/);
    // `_` inside a word (snake_case) is not emphasis.
    if (em && !(em[1] === '_' && /\w/.test(text[i - 1] || ''))) {
      flush();
      out.push({ type: 'em', children: parseInline(em[2]) });
      i += em[0].length;
      continue;
    }
    plain += rest[0];
    i++;
  }
  flush();
  return out;
}

/** Note text without Markdown marks, for cards and previews. */
export function plainText(source: string) {
  const text = (nodes: Inline[]): string =>
    nodes
      .map((node) => (node.type === 'text' ? node.text : text(node.children)))
      .join('');
  return parseMarkdown(source)
    .map((block) =>
      block.type === 'heading'
        ? text(block.content)
        : block.type === 'list'
          ? block.items
              .map(
                (item) =>
                  `${item.checked === null ? '' : item.checked ? '☑ ' : '☐ '}${text(item.content)}`,
              )
              .join('\n')
          : block.lines.map(text).join('\n'),
    )
    .join('\n');
}

/** Ticks or unticks the checklist item on a line; other text is unchanged. */
export function toggleTask(source: string, line: number) {
  const lines = source.split('\n');
  const match = lines[line]?.match(
    /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)( |x|X)(\])/,
  );
  if (!match) return source;
  lines[line] =
    match[1] +
    (match[2] === ' ' ? 'x' : ' ') +
    lines[line].slice(match[1].length + 1);
  return lines.join('\n');
}

export interface Edit {
  text: string;
  start: number;
  end: number;
}
export type LineFormat = 'heading' | 'bullet' | 'numbered' | 'checklist';
const linePrefix =
  /^(\s*)(#{1,3}\s+|(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?)?/;
const prefixFor = (format: LineFormat, index: number) =>
  format === 'heading'
    ? '## '
    : format === 'bullet'
      ? '- '
      : format === 'numbered'
        ? `${index + 1}. `
        : '- [ ] ';
const hasFormat = (line: string, format: LineFormat) =>
  format === 'heading'
    ? /^\s*#{1,3}\s/.test(line)
    : format === 'checklist'
      ? /^\s*[-*+]\s+\[[ xX]\]\s/.test(line)
      : format === 'numbered'
        ? /^\s*\d{1,9}[.)]\s/.test(line)
        : /^\s*[-*+]\s/.test(line) && !/^\s*[-*+]\s+\[[ xX]\]\s/.test(line);

/**
 * Makes every selected line a heading or list item, replacing any other line
 * format, or removes it when all the lines already have it.
 */
export function formatLines(
  text: string,
  start: number,
  end: number,
  format: LineFormat,
): Edit {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const toBreak = text.indexOf(
    '\n',
    Math.max(end - (end > start ? 1 : 0), start),
  );
  const to = toBreak < 0 ? text.length : toBreak;
  const lines = text.slice(from, to).split('\n');
  const filled = lines.filter((line) => line.trim());
  const remove =
    filled.length > 0 && filled.every((line) => hasFormat(line, format));
  let index = 0;
  const next = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    const [prefix, indent] = line.match(linePrefix)!;
    const body = line.slice(prefix.length);
    return remove ? indent + body : indent + prefixFor(format, index++) + body;
  });
  const replaced = next.join('\n');
  const result = text.slice(0, from) + replaced + text.slice(to);
  const shift = replaced.length - (to - from);
  return {
    text: result,
    start: lines.length === 1 ? Math.max(from, start + shift) : from,
    end:
      lines.length === 1 ? Math.max(from, end + shift) : from + replaced.length,
  };
}

/** Wraps the selection in `**` or `_`, or unwraps it when already wrapped. */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  marker: '**' | '_',
  placeholder: string,
): Edit {
  const before = text.slice(start - marker.length, start),
    after = text.slice(end, end + marker.length);
  if (start !== end && before === marker && after === marker)
    return {
      text:
        text.slice(0, start - marker.length) +
        text.slice(start, end) +
        text.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  const selected = text.slice(start, end) || placeholder;
  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    start: start + marker.length,
    end: start + marker.length + selected.length,
  };
}

/** Inserts `[text](url)` for a safe URL; null when the URL is not allowed. */
export function insertLink(
  text: string,
  start: number,
  end: number,
  url: string,
): Edit | null {
  const href = safeHref(
    /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(url.trim())
      ? `mailto:${url.trim()}`
      : /^www\./i.test(url.trim())
        ? `https://${url.trim()}`
        : url,
  );
  if (!href) return null;
  const label = text.slice(start, end) || href.replace(/^mailto:/, '');
  const inserted = `[${label}](${href})`;
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    start: start + 1,
    end: start + 1 + label.length,
  };
}

/**
 * Enter at the end of a list item starts the next item (numbered lists count
 * on, checklists start unticked); Enter on an empty item ends the list. null
 * means Enter should behave normally.
 */
export function continueList(text: string, cursor: number): Edit | null {
  const from = text.lastIndexOf('\n', cursor - 1) + 1;
  const lineEnd = text.indexOf('\n', cursor);
  const line = text.slice(from, lineEnd < 0 ? text.length : lineEnd);
  if (text.slice(cursor, lineEnd < 0 ? text.length : lineEnd).trim())
    return null;
  const match = line.match(/^(\s*)([-*+]|(\d{1,9})([.)]))\s+(\[[ xX]\]\s+)?/);
  if (!match) return null;
  if (!line.slice(match[0].length).trim()) {
    const cleared = text.slice(0, from) + text.slice(from + line.length);
    return { text: cleared, start: from, end: from };
  }
  const marker = match[3] ? `${Number(match[3]) + 1}${match[4]}` : match[2];
  const next = `\n${match[1]}${marker} ${match[5] ? '[ ] ' : ''}`;
  return {
    text: text.slice(0, cursor) + next + text.slice(cursor),
    start: cursor + next.length,
    end: cursor + next.length,
  };
}
