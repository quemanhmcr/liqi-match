#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'];
const allowedFeatureShellImport = path.join(
  sourceRoot,
  'app-shell',
  'navigation',
  'routes.ts',
);
const allowedRouteSharedImport = path.join(
  sourceRoot,
  'shared',
  'config',
  'env.ts',
);
const violations = [];

function normalizedPath(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function isWithin(filePath, directory) {
  const relative = path.relative(directory, filePath);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath);
    return /\.[tj]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function report(file, message) {
  violations.push(`${normalizedPath(file)}: ${message}`);
}

function featureDetails(file) {
  const match = normalizedPath(file).match(
    /^src\/features\/([^/]+)(?:\/(.*))?$/,
  );
  if (!match) return undefined;
  const subpath =
    match[2] === 'index.ts' || match[2] === 'index.tsx' ? '' : (match[2] ?? '');
  return { name: match[1], subpath };
}

function zone(file) {
  const relative = normalizedPath(file);
  if (relative.startsWith('src/app/')) return 'app';
  if (relative.startsWith('src/app-shell/')) return 'app-shell';
  if (relative.startsWith('src/entities/')) return 'entities';
  if (relative.startsWith('src/features/')) return 'features';
  if (relative.startsWith('src/shared/')) return 'shared';
  if (relative.startsWith('src/test/')) return 'test';
  return 'other';
}

function sourceDependencies(file) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const dependencies = [];

  function add(specifier, kind) {
    dependencies.push({ kind, specifier });
  }

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier.text, 'static');
    }

    const firstArgument = ts.isCallExpression(node)
      ? node.arguments[0]
      : undefined;
    if (
      ts.isCallExpression(node) &&
      firstArgument &&
      ts.isStringLiteral(firstArgument)
    ) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        add(node.arguments[0].text, 'dynamic import');
      }
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        add(node.arguments[0].text, 'require');
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return { dependencies, text };
}

function resolveSourceTarget(file, specifier) {
  let basePath;

  if (specifier.startsWith('@/')) {
    basePath = path.join(sourceRoot, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    basePath = path.resolve(path.dirname(file), specifier);
  } else {
    return undefined;
  }

  const candidates = [
    basePath,
    ...sourceExtensions.map((extension) => `${basePath}${extension}`),
    ...sourceExtensions.map((extension) =>
      path.join(basePath, `index${extension}`),
    ),
  ];
  const target = candidates.find(isFile);

  return target && isWithin(target, sourceRoot) ? target : undefined;
}

function isFeatureScreen(target) {
  const feature = featureDetails(target);
  return Boolean(feature?.subpath.startsWith('screens/'));
}

for (const file of collectFiles(sourceRoot)) {
  const relative = normalizedPath(file);
  const { dependencies, text } = sourceDependencies(file);
  const sourceZone = zone(file);
  const owner = featureDetails(file);
  const inApp = sourceZone === 'app';

  if (relative.startsWith('src/test/') && /\.test\.tsx?$/.test(relative)) {
    report(file, 'tests belong to their feature or app-shell, never src/test.');
  }

  if (
    inApp &&
    relative.endsWith('/_layout.tsx') &&
    text.includes('<Stack.Screen')
  ) {
    report(
      file,
      'layouts must not manually register individual feature screens.',
    );
  }

  if (inApp && !relative.endsWith('/_layout.tsx')) {
    const nonEmptyLines = text
      .split(/\r?\n/)
      .filter((line) => line.trim()).length;
    if (nonEmptyLines > 20) {
      report(file, 'route adapters must stay at 20 non-empty lines or fewer.');
    }
  }

  for (const dependency of dependencies) {
    const target = resolveSourceTarget(file, dependency.specifier);
    if (!target) continue;

    const targetZone = zone(target);
    const targetFeature = featureDetails(target);

    if (!inApp && targetZone === 'app') {
      report(
        file,
        `only Expo Router adapters may import from @/app/ (${dependency.specifier}).`,
      );
    }

    if (
      sourceZone === 'shared' &&
      ['app', 'app-shell', 'entities', 'features'].includes(targetZone)
    ) {
      report(
        file,
        'shared must not import from app-shell, entities, or features.',
      );
    }

    if (
      sourceZone === 'entities' &&
      ['app', 'app-shell', 'features'].includes(targetZone)
    ) {
      report(file, 'entities may depend only on entities or shared code.');
    }

    if (owner && targetFeature && targetFeature.name !== owner.name) {
      report(
        file,
        `feature "${owner.name}" must not import feature "${targetFeature.name}" (${dependency.specifier}).`,
      );
    }

    if (
      owner &&
      targetZone === 'app-shell' &&
      path.normalize(target) !== path.normalize(allowedFeatureShellImport)
    ) {
      report(
        file,
        'features may use only the stable app-shell navigation route contract.',
      );
    }

    if (sourceZone === 'app-shell' && targetFeature?.subpath) {
      report(
        file,
        'app-shell may import only a feature public API, never a deep module.',
      );
    }

    if (inApp && targetFeature && !isFeatureScreen(target)) {
      report(
        file,
        'route adapters may import only a feature screen surface, never components or services.',
      );
    }

    if (
      inApp &&
      targetZone === 'shared' &&
      path.normalize(target) !== path.normalize(allowedRouteSharedImport)
    ) {
      report(
        file,
        'route adapters must not import shared UI or services directly.',
      );
    }
  }
}

if (violations.length) {
  process.stderr.write(
    `Architecture boundary check failed (${violations.length} violation${
      violations.length === 1 ? '' : 's'
    }):\n${violations.map((line) => `- ${line}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write('Architecture boundary check passed.\n');
}
