'use client';
import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  PencilLine,
  Eye,
} from 'lucide-react';
import {
  continueList,
  formatLines,
  insertLink,
  parseMarkdown,
  toggleTask,
  wrapSelection,
  type Edit,
  type Inline,
  type LineFormat,
} from '../lib/markdown';

/**
 * A note's body: Markdown written in a textarea with a formatting toolbar, and
 * read as formatted text where checklist items tick in place. Loaded only when
 * a note opens, so My Day stays light. Note text is rendered as React
 * elements, never as HTML.
 */
export default function RichNoteBody({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  const [mode, setMode] = useState<'read' | 'write'>(
    readOnly || value.trim() ? 'read' : 'write',
  );
  const area = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const writing = mode === 'write' && !readOnly;
  useLayoutEffect(() => {
    const next = selection.current;
    if (!next || !area.current) return;
    selection.current = null;
    area.current.focus();
    area.current.setSelectionRange(next.start, next.end);
  });
  function apply(edit: Edit | null) {
    if (!edit) return false;
    selection.current = { start: edit.start, end: edit.end };
    onChange(edit.text);
    return true;
  }
  function range() {
    const el = area.current;
    return el
      ? { start: el.selectionStart, end: el.selectionEnd }
      : { start: value.length, end: value.length };
  }
  function line(format: LineFormat) {
    const { start, end } = range();
    apply(formatLines(value, start, end, format));
  }
  function wrap(marker: '**' | '_') {
    const { start, end } = range();
    apply(
      wrapSelection(
        value,
        start,
        end,
        marker,
        marker === '**' ? 'bold text' : 'italic text',
      ),
    );
  }
  function link() {
    const { start, end } = range();
    const url = window.prompt('Link to (a web or email address):', 'https://');
    if (!url || url === 'https://') return;
    if (!apply(insertLink(value, start, end, url)))
      window.alert(
        'Ordo links only to web (http or https) and email addresses.',
      );
  }
  function keys(event: KeyboardEvent<HTMLTextAreaElement>) {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'b') wrap('**');
    else if (mod && key === 'i') wrap('_');
    else if (mod && key === 'k') link();
    else if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !mod &&
      event.currentTarget.selectionStart === event.currentTarget.selectionEnd
    ) {
      if (!apply(continueList(value, event.currentTarget.selectionStart)))
        return;
    } else return;
    event.preventDefault();
  }
  const tools: {
    label: string;
    shortcut?: string;
    icon: typeof Bold;
    run: () => void;
  }[] = [
    { label: 'Heading', icon: Heading2, run: () => line('heading') },
    { label: 'Bulleted list', icon: List, run: () => line('bullet') },
    { label: 'Numbered list', icon: ListOrdered, run: () => line('numbered') },
    { label: 'Checklist', icon: ListChecks, run: () => line('checklist') },
    { label: 'Bold', shortcut: '⌘B', icon: Bold, run: () => wrap('**') },
    { label: 'Italic', shortcut: '⌘I', icon: Italic, run: () => wrap('_') },
    { label: 'Link', shortcut: '⌘K', icon: Link2, run: link },
  ];
  return (
    <div className="rich-note">
      <div className="rich-note-bar">
        {writing ? (
          <div
            className="format-tools"
            role="toolbar"
            aria-label="Formatting"
            aria-controls="note-body"
            onKeyDown={(event) => {
              const buttons = [
                ...event.currentTarget.querySelectorAll('button'),
              ];
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const step =
                event.key === 'ArrowRight'
                  ? 1
                  : event.key === 'ArrowLeft'
                    ? -1
                    : 0;
              if (!step || index < 0) return;
              event.preventDefault();
              buttons[(index + step + buttons.length) % buttons.length].focus();
            }}
          >
            {tools.map((tool, index) => (
              <button
                key={tool.label}
                type="button"
                tabIndex={index === 0 ? 0 : -1}
                aria-label={tool.label}
                title={
                  tool.shortcut
                    ? `${tool.label} (${tool.shortcut})`
                    : tool.label
                }
                // Keep the textarea's selection when a tool is clicked.
                onMouseDown={(event) => event.preventDefault()}
                onClick={tool.run}
              >
                <tool.icon size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <span className="muted small">
            {readOnly ? 'Read-only copy' : 'Tick checklist items in place'}
          </span>
        )}
        {!readOnly && (
          <button
            type="button"
            className="text-button mode-toggle"
            aria-pressed={writing}
            onClick={() => setMode(writing ? 'read' : 'write')}
          >
            {writing ? (
              <>
                <Eye size={13} aria-hidden="true" /> Done
              </>
            ) : (
              <>
                <PencilLine size={13} aria-hidden="true" /> Edit
              </>
            )}
          </button>
        )}
      </div>
      {writing ? (
        <label className="sr-only-label">
          <span className="sr-only">Note</span>
          <textarea
            ref={area}
            id="note-body"
            autoFocus
            data-autofocus
            className="note-body"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={keys}
            placeholder={
              'Write freely. Use the toolbar, or type Markdown:\n## Heading\n- bullet\n1. numbered\n- [ ] to do\n**bold**  _italic_  [link](https://…)'
            }
          />
        </label>
      ) : (
        <MarkdownView
          source={value}
          disabled={readOnly}
          onToggle={(line) => onChange(toggleTask(value, line))}
          onEdit={readOnly ? undefined : () => setMode('write')}
        />
      )}
    </div>
  );
}

export function MarkdownView({
  source,
  disabled,
  onToggle,
  onEdit,
}: {
  source: string;
  disabled?: boolean;
  onToggle: (line: number) => void;
  onEdit?: () => void;
}) {
  const blocks = parseMarkdown(source);
  if (!blocks.length)
    return (
      <div className="markdown-view is-empty">
        {onEdit ? (
          <button type="button" className="text-button" onClick={onEdit}>
            Nothing here yet. Start writing.
          </button>
        ) : (
          <p className="muted">This note is empty.</p>
        )}
      </div>
    );
  return (
    <div className="markdown-view" data-testid="note-view">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1];
          return <Tag key={index}>{inline(block.content)}</Tag>;
        }
        if (block.type === 'paragraph')
          return (
            <p key={index}>
              {block.lines.map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && <br />}
                  {inline(line)}
                </Fragment>
              ))}
            </p>
          );
        const List = block.ordered ? 'ol' : 'ul';
        const checklist = block.items.every((item) => item.checked !== null);
        return (
          <List
            key={index}
            start={block.ordered && block.start !== 1 ? block.start : undefined}
            className={checklist ? 'checklist' : undefined}
          >
            {block.items.map((item) => (
              <li
                key={item.line}
                className={`${item.checked === null ? '' : 'task-item'} ${item.checked ? 'is-checked' : ''} depth-${item.depth}`}
              >
                {item.checked === null ? (
                  inline(item.content)
                ) : (
                  <label>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={disabled}
                      onChange={() => onToggle(item.line)}
                    />
                    <span>{inline(item.content)}</span>
                  </label>
                )}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) =>
    node.type === 'text' ? (
      <Fragment key={index}>{node.text}</Fragment>
    ) : node.type === 'strong' ? (
      <strong key={index}>{inline(node.children)}</strong>
    ) : node.type === 'em' ? (
      <em key={index}>{inline(node.children)}</em>
    ) : (
      <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">
        {inline(node.children)}
      </a>
    ),
  );
}
