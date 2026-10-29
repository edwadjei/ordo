// Local documentation only. Reviewed repository Markdown is trusted HTML input;
// never reuse this renderer for imported transcripts or other user content.
// Adapted from the local Unwrap docs site's navigation and reading layout.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const output = path.join(docs, 'html');
const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const slug = (value) =>
  value
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';

function discover(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const name = path.posix.join(prefix, entry.name);
      if (entry.isDirectory() && name !== 'html')
        return discover(path.join(directory, entry.name), name);
      return entry.isFile() && entry.name.endsWith('.md') ? [name] : [];
    });
}

const preferred = [
  'README.md',
  'PRODUCT.md',
  'TECHNICAL.md',
  'IMPLEMENTATION-APPROACH.md',
  'PLAN.md',
  'engineering-method.md',
];
const files = discover(docs).sort((a, b) => {
  const rank = (name) =>
    preferred.includes(name) ? preferred.indexOf(name) : preferred.length;
  return rank(a) - rank(b) || a.localeCompare(b);
});
const pages = files.map((source) => {
  const markdown = readFileSync(path.join(docs, source), 'utf8');
  return {
    source,
    destination:
      source === 'README.md' ? 'index.html' : source.replace(/\.md$/, '.html'),
    title: markdown.match(/^# (.+)$/m)?.[1] ?? source,
    markdown,
  };
});
// Self-contained HTML diagrams under docs/diagrams are copied as they are, so
// Markdown can link to them like any other page.
const diagramDirectory = path.join(docs, 'diagrams');
const diagrams = existsSync(diagramDirectory)
  ? readdirSync(diagramDirectory)
      .filter((name) => name.endsWith('.html'))
      .map((name) => path.posix.join('diagrams', name))
  : [];
const targets = new Map([
  ...pages.map((page) => [page.source, page.destination]),
  ...diagrams.map((diagram) => [diagram, diagram]),
]);
const css = readFileSync(
  path.join(root, 'scripts/docs-assets/docs.css'),
  'utf8',
);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'docs.css'), css);
for (const diagram of diagrams) {
  mkdirSync(path.join(output, path.dirname(diagram)), { recursive: true });
  copyFileSync(path.join(docs, diagram), path.join(output, diagram));
}

for (const page of pages) {
  const local = (target) =>
    path.posix.relative(path.posix.dirname(page.destination), target) ||
    path.posix.basename(target);
  const sections = [];
  const ids = new Set();
  let body = marked.parse(page.markdown, { gfm: true, async: false });
  body = body.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level, text) => {
    let id = slug(text);
    while (ids.has(id)) id += '-x';
    ids.add(id);
    if (level === '2') sections.push({ id, text });
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
  body = body.replace(
    /href="([^"#]+)(#[^"]*)?"/g,
    (match, href, fragment = '') => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/'))
        return match;
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(page.source), href),
      );
      const target = targets.get(resolved);
      if (!target)
        throw new Error(
          `Unmapped local documentation link in ${page.source}: ${href}`,
        );
      return `href="${local(target)}${fragment}"`;
    },
  );
  body = body
    .replaceAll('<table>', '<div class="table-scroll"><table>')
    .replaceAll('</table>', '</table></div>');
  const nav = pages
    .map(
      (entry) =>
        `<a href="${local(entry.destination)}"${entry === page ? ' aria-current="page"' : ''}>${escape(entry.title)}</a>`,
    )
    .join('\n');
  const toc = sections
    .map(
      (section) =>
        `<a href="#${section.id}">${section.text.replace(/<[^>]*>/g, '')}</a>`,
    )
    .join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)} · Ordo</title><link rel="stylesheet" href="${local('docs.css')}"></head>
<body><a class="skip" href="#content">Skip to content</a>
<header class="topbar"><a class="brand" href="${local('index.html')}">ordo<span>From thought to done.</span></a><span class="badge">Documentation / 01</span></header>
<div class="shell"><aside><details class="navigation" open><summary>Documentation</summary><nav aria-label="Documents">${nav}</nav></details>
${toc ? `<details class="toc"><summary>On this page</summary><nav aria-label="On this page">${toc}</nav></details>` : ''}
</aside><main id="content"><div class="eyebrow">Ordo / project notebook</div><article>${body}</article>
<footer>Source: <code>docs/${escape(page.source)}</code> · Generated from Markdown. Proposals remain subject to owner review.</footer></main></div></body></html>`;
  const destination = path.join(output, page.destination);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, html);
}
console.log(
  `Built ${pages.length} Ordo documentation pages at ${path.join(output, 'index.html')}`,
);
