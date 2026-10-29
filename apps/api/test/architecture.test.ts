import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

async function sourceFiles(directory = sourceRoot): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? sourceFiles(path.join(directory, entry.name))
          : entry.name.endsWith('.ts')
            ? [path.join(directory, entry.name)]
            : [],
      ),
    )
  ).flat();
}

async function sources() {
  return Promise.all(
    (await sourceFiles()).map(async (filename) => ({
      filename,
      relative: path.relative(sourceRoot, filename).split(path.sep).join('/'),
      source: ts.createSourceFile(
        filename,
        await readFile(filename, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      ),
    })),
  );
}

function imports(source: ts.SourceFile) {
  const result: { specifier: string; typeOnly: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      result.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: Boolean(
          clause?.isTypeOnly ||
          (clause &&
            !clause.name &&
            named &&
            ts.isNamedImports(named) &&
            named.elements.length > 0 &&
            named.elements.every((binding) => binding.isTypeOnly)),
        ),
      });
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      result.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: node.isTypeOnly,
      });
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      result.push({ specifier: node.arguments[0].text, typeOnly: false });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

function resolved(filename: string, specifier: string) {
  return path
    .relative(sourceRoot, path.resolve(path.dirname(filename), specifier))
    .split(path.sep)
    .join('/');
}

const crossDomainServices: Record<string, Set<string>> = {
  identity: new Set(),
  'audio-settings': new Set(),
  transcriptions: new Set(['audio-settings']),
  workspaces: new Set(),
  tasks: new Set(['workspaces']),
  notes: new Set(['workspaces']),
  home: new Set(['workspaces', 'tasks', 'notes']),
  demo: new Set(['home']),
  'ai-settings': new Set(['audio-settings']),
  drafts: new Set(['workspaces', 'notes']),
  capture: new Set(['workspaces', 'notes', 'ai-settings', 'drafts']),
  related: new Set(['drafts']),
};

test('platform and capability contracts cannot import business domains or concrete adapters', async () => {
  for (const file of await sources()) {
    if (
      !file.relative.startsWith('platform/') &&
      !file.relative.startsWith('capabilities/')
    )
      continue;
    for (const dependency of imports(file.source)) {
      const target = resolved(file.filename, dependency.specifier);
      assert.ok(
        !target.startsWith('domains/'),
        `${file.relative} must not import ${target}`,
      );
      assert.ok(
        !target.startsWith('adapters/'),
        `${file.relative} must depend on a contract, not ${target}`,
      );
    }
    if (file.relative.startsWith('capabilities/')) {
      const declarations = file.source.statements.filter(ts.isClassDeclaration);
      assert.ok(
        declarations.length > 0,
        `${file.relative} must declare a real abstract capability`,
      );
      for (const declaration of declarations)
        assert.ok(
          declaration.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword,
          ),
          `${file.relative} capability must be abstract`,
        );
    }
  }
});

test('domain imports use owning services and keep database and crypto SDKs behind adapters', async () => {
  for (const file of await sources()) {
    if (!file.relative.startsWith('domains/')) continue;
    const ownDomain = file.relative.split('/')[1];
    for (const dependency of imports(file.source)) {
      assert.ok(
        !['@ordo/db', 'drizzle-orm', 'node:crypto'].some(
          (vendor) =>
            dependency.specifier === vendor ||
            dependency.specifier.startsWith(`${vendor}/`),
        ),
        `${file.relative} imports concrete dependency ${dependency.specifier}`,
      );
      if (!dependency.specifier.startsWith('.')) continue;
      const target = resolved(file.filename, dependency.specifier);
      if (target.startsWith('domains/')) {
        const targetDomain = target.split('/')[1];
        if (targetDomain !== ownDomain) {
          assert.ok(
            crossDomainServices[ownDomain].has(targetDomain),
            `Undocumented domain edge ${ownDomain} -> ${targetDomain}`,
          );
          assert.ok(
            target.endsWith('.service.js'),
            `Cross-domain imports must use the owning service: ${file.relative} -> ${target}`,
          );
        }
      }
      if (target.startsWith('adapters/') && !dependency.typeOnly) {
        const isModule = file.relative.endsWith('.module.ts');
        const isDatabaseRepository =
          file.relative.endsWith('.repository.ts') &&
          target === 'adapters/database/database.adapter.js';
        assert.ok(
          isModule || isDatabaseRepository,
          `Adapter runtime wiring belongs to modules/repositories: ${file.relative} -> ${target}`,
        );
      }
    }
  }
});

test('controllers and app composition contain no SQL queries or transaction orchestration', async () => {
  const forbiddenQueries = new Set([
    'select',
    'insert',
    'from',
    'where',
    'returning',
    'transaction',
    'forOwner',
  ]);
  for (const file of await sources()) {
    if (!file.relative.endsWith('.controller.ts') && file.relative !== 'app.ts')
      continue;
    for (const dependency of imports(file.source))
      assert.ok(
        !dependency.specifier.includes('.repository.'),
        `${file.relative} bypasses its service`,
      );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      )
        assert.ok(
          !forbiddenQueries.has(node.expression.name.text),
          `${file.relative} contains data access or transaction call ${node.expression.name.text}`,
        );
      ts.forEachChild(node, visit);
    };
    visit(file.source);
  }
});

test('crypto capability adapters are wired only by the owning domain modules', async () => {
  const owners: Record<string, string | string[]> = {
    'adapters/cryptography/web-session-tokens.js':
      'domains/identity/identity.module.ts',
    'adapters/cryptography/web-otp-secrets.js':
      'domains/identity/identity.module.ts',
    'adapters/cryptography/web-content-hasher.js': [
      'domains/tasks/tasks.module.ts',
      'domains/capture/capture.module.ts',
    ],
  };
  for (const file of await sources()) {
    for (const dependency of imports(file.source)) {
      if (!dependency.specifier.startsWith('.')) continue;
      const target = resolved(file.filename, dependency.specifier);
      if (owners[target])
        assert.ok(
          [owners[target]].flat().includes(file.relative),
          `Only the capability owner may wire ${target}`,
        );
    }
  }
});

test('no Node crypto anywhere, and the Worker bundle uses only node:async_hooks from Node', async () => {
  for (const file of await sources())
    for (const dependency of imports(file.source)) {
      assert.ok(
        !['node:crypto', 'crypto'].includes(dependency.specifier),
        `${file.relative} imports Node crypto; use the Web Crypto adapters`,
      );
      if (dependency.specifier.startsWith('node:') && !dependency.typeOnly)
        assert.ok(
          [
            'adapters/database/database.adapter.ts -> node:async_hooks',
            'platform/identifiers/random.ts -> node:async_hooks',
          ].includes(`${file.relative} -> ${dependency.specifier}`),
          'Only the request-scoped database and the warm-up randomness scope use Node (AsyncLocalStorage, nodejs_als)',
        );
    }
});

test('platform and domains are framework-neutral: no HTTP framework types or imports', async () => {
  const frameworks = ['fastify', 'hono', '@hono/', '@fastify/'];
  for (const file of await sources()) {
    if (
      !file.relative.startsWith('platform/') &&
      !file.relative.startsWith('domains/') &&
      !file.relative.startsWith('capabilities/')
    )
      continue;
    for (const dependency of imports(file.source)) {
      const target = dependency.specifier.startsWith('.')
        ? resolved(file.filename, dependency.specifier)
        : dependency.specifier;
      assert.ok(
        !frameworks.some((framework) =>
          framework.endsWith('/')
            ? dependency.specifier.startsWith(framework)
            : dependency.specifier === framework ||
              dependency.specifier.startsWith(`${framework}/`),
        ),
        `${file.relative} imports HTTP framework ${dependency.specifier}`,
      );
      assert.ok(
        !target.startsWith('adapters/http/'),
        `${file.relative} must use platform/http, not the host ${target}`,
      );
    }
  }
});

// Workers reject a global such as fetch called with any other `this`
// ("TypeError: Illegal invocation"), which Node tolerates. Storing the bare
// global (`transport = fetch`) and calling it as `this.transport(...)` broke
// sign-in on the Worker while every Node test passed, so these globals may
// only be called directly, never passed or stored as values.
const bindSensitiveGlobals = new Set([
  'fetch',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'queueMicrotask',
  'structuredClone',
  'atob',
  'btoa',
  'reportError',
]);
const cryptoMethods = new Set(['getRandomValues', 'randomUUID']);

function detachedGlobals(source: ts.SourceFile) {
  const found: string[] = [];
  const called = (node: ts.Node) =>
    ts.isCallExpression(node.parent) && node.parent.expression === node;
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      bindSensitiveGlobals.has(node.text) &&
      !called(node) &&
      !ts.isTypeQueryNode(node.parent) &&
      // A member named like the global (`x.fetch`, `async fetch() {}`).
      !(
        (ts.isPropertyAccessExpression(node.parent) ||
          ts.isMethodDeclaration(node.parent) ||
          ts.isMethodSignature(node.parent) ||
          ts.isPropertyDeclaration(node.parent) ||
          ts.isPropertySignature(node.parent) ||
          ts.isPropertyAssignment(node.parent)) &&
        node.parent.name === node
      )
    )
      found.push(node.text);
    // crypto.getRandomValues, crypto.randomUUID or crypto.subtle.<method>
    // taken without calling them.
    if (
      ts.isPropertyAccessExpression(node) &&
      !called(node) &&
      !ts.isTypeQueryNode(node.parent) &&
      ((ts.isIdentifier(node.expression) &&
        node.expression.text === 'crypto' &&
        cryptoMethods.has(node.name.text)) ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'crypto' &&
          node.expression.name.text === 'subtle'))
    )
      found.push(node.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test('Workers globals such as fetch are only ever called directly, never stored unbound', async () => {
  for (const file of await sources())
    assert.deepEqual(
      detachedGlobals(file.source),
      [],
      `${file.relative} passes a Workers global as a value; wrap it, e.g. (input, init) => fetch(input, init)`,
    );
  // The check itself catches the pattern that broke sign-in.
  const broken = ts.createSourceFile(
    'broken.ts',
    [
      'class A {',
      '  constructor(private readonly transport: typeof fetch = fetch) {}',
      '  go() { return this.transport("x"); }',
      '}',
      'const r = crypto.getRandomValues;',
      'const d = crypto.subtle.digest;',
    ].join('\n'),
    ts.ScriptTarget.Latest,
    true,
  );
  assert.deepEqual(detachedGlobals(broken), [
    'fetch',
    'crypto.getRandomValues',
    'crypto.subtle.digest',
  ]);
});
