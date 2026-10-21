import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/html',
);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? files(file)
      : entry.name.endsWith('.html')
        ? [file]
        : [];
  });
}
const pages = new Map(
  files(root).map((file) => {
    const html = readFileSync(file, 'utf8');
    return [
      file,
      {
        ids: new Set(
          [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
        ),
        html,
      },
    ];
  }),
);
let count = 0;
for (const [file, { html }] of pages) {
  for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
    const [name, fragment] = href.split('#');
    const target = name
      ? path.resolve(path.dirname(file), decodeURIComponent(name))
      : file;
    if (!existsSync(target))
      throw new Error(`${path.relative(root, file)}: missing target ${href}`);
    if (fragment && !pages.get(target)?.ids.has(decodeURIComponent(fragment))) {
      throw new Error(`${path.relative(root, file)}: missing section ${href}`);
    }
    count++;
  }
}
console.log(
  `Documentation links passed: ${pages.size} pages, ${count} local links and fragments.`,
);
