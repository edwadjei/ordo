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
  workspaces: new Set(),
  tasks: new Set(['workspaces']),
  notes: new Set(['workspaces']),
  home: new Set(['workspaces', 'tasks', 'notes']),
  demo: new Set(['home']),
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
        ![
          '@ordo/db',
          'drizzle-orm',
          'postgres',
          '@electric-sql/pglite',
          'node:crypto',
        ].some(
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
  const owners: Record<string, string> = {
    'adapters/cryptography/node-password-hasher.js':
      'domains/identity/identity.module.ts',
    'adapters/cryptography/node-session-tokens.js':
      'domains/identity/identity.module.ts',
    'adapters/cryptography/node-content-hasher.js':
      'domains/tasks/tasks.module.ts',
  };
  for (const file of await sources()) {
    for (const dependency of imports(file.source)) {
      if (!dependency.specifier.startsWith('.')) continue;
      const target = resolved(file.filename, dependency.specifier);
      if (owners[target])
        assert.equal(
          file.relative,
          owners[target],
          `Only the capability owner may wire ${target}`,
        );
    }
  }
});
