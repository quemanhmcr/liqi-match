const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const violations = [];

function isAwaitedOrReturned(node) {
  return ts.isAwaitExpression(node.parent) || ts.isReturnStatement(node.parent);
}

function importedTestingLibraryHelpers(sourceFile) {
  const helpers = new Map();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.moduleSpecifier.text !== '@testing-library/react-native'
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (['act', 'fireEvent', 'render'].includes(importedName)) {
        helpers.set(element.name.text, importedName);
      }
    }
  }

  return helpers;
}

function asyncTestingLibraryCall(node, helpers) {
  if (!ts.isCallExpression(node)) return undefined;
  const expression = node.expression;

  if (ts.isIdentifier(expression)) {
    const helper = helpers.get(expression.text);
    return helper === 'act' || helper === 'fireEvent' || helper === 'render'
      ? helper
      : undefined;
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    helpers.get(expression.expression.text) === 'fireEvent'
  ) {
    return 'fireEvent';
  }

  return undefined;
}

function checkAsyncTestingLibraryCalls(path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const helpers = importedTestingLibraryHelpers(sourceFile);

  function visit(node) {
    const helper = asyncTestingLibraryCall(node, helpers);
    if (helper && !isAwaitedOrReturned(node)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      violations.push(
        `${path}:${line + 1} RNTL v14 ${helper} calls are async and must be awaited.`,
      );
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(?:test\.tsx?|native\.test\.ts)$/.test(entry.name)) continue;

    const source = readFileSync(path, 'utf8');
    const policies = [
      {
        pattern: /jest\.setTimeout\s*\(/g,
        message: 'Do not hide slow tests with per-file Jest timeouts.',
      },
      {
        pattern: /new Promise\s*\([^)]*=>\s*setTimeout/g,
        message:
          'Do not wait on real time; use fake timers or observable state.',
      },
      {
        pattern: /\b(?:describe|it|test)\.only\s*\(/g,
        message: 'Focused tests must not be committed.',
      },
    ];

    for (const policy of policies) {
      for (const match of source.matchAll(policy.pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${path}:${line} ${policy.message}`);
      }
    }

    checkAsyncTestingLibraryCalls(path, source);
  }
}

walk('src');

if (violations.length > 0) {
  console.error('Test policy violations:\n' + violations.join('\n'));
  process.exit(1);
}

console.log('Test policy check passed.');
