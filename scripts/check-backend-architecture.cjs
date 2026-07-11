#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const workerRoot = path.join(root, 'cloudflare', 'media-worker', 'src');
const functionsRoot = path.join(root, 'supabase', 'functions');
const violations = [];

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? filesUnder(target)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [target]
        : [];
  });
}

function importsFrom(source) {
  const matches = source.matchAll(
    /(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]/g,
  );
  return [...matches].map((match) => match[1]);
}

function resolveLocal(file, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(file), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function report(file, message) {
  violations.push(`${relative(file)}: ${message}`);
}

const workerLayers = [
  'domain',
  'application',
  'infrastructure',
  'platform',
  'transport',
  'worker',
];

function workerLayer(file) {
  const first = path.relative(workerRoot, file).split(path.sep)[0];
  return workerLayers.includes(first)
    ? first
    : first === 'index.ts'
      ? 'entry'
      : 'other';
}

const forbiddenWorkerDependencies = {
  domain: new Set([
    'application',
    'infrastructure',
    'platform',
    'transport',
    'worker',
  ]),
  application: new Set(['infrastructure', 'platform', 'transport', 'worker']),
  infrastructure: new Set(['transport', 'worker']),
  platform: new Set([
    'application',
    'domain',
    'infrastructure',
    'transport',
    'worker',
  ]),
  transport: new Set(['infrastructure', 'worker']),
};

for (const file of filesUnder(workerRoot)) {
  const sourceLayer = workerLayer(file);
  const source = fs.readFileSync(file, 'utf8');
  for (const specifier of importsFrom(source)) {
    const target = resolveLocal(file, specifier);
    if (!target || !target.startsWith(workerRoot)) continue;
    const targetLayer = workerLayer(target);
    if (forbiddenWorkerDependencies[sourceLayer]?.has(targetLayer)) {
      report(
        file,
        `${sourceLayer} must not import ${targetLayer} (${specifier}).`,
      );
    }
  }
}

const workerEntry = path.join(workerRoot, 'index.ts');
if (fs.existsSync(workerEntry)) {
  const nonEmpty = fs
    .readFileSync(workerEntry, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
  if (nonEmpty > 5)
    report(
      workerEntry,
      'worker entrypoint must remain a thin composition adapter.',
    );
}

const endpointNames = fs
  .readdirSync(functionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
  .map((entry) => entry.name);

for (const endpoint of endpointNames) {
  const endpointRoot = path.join(functionsRoot, endpoint);
  const index = path.join(endpointRoot, 'index.ts');
  if (!fs.existsSync(index)) {
    violations.push(
      `supabase/functions/${endpoint}: missing deployment index.ts.`,
    );
    continue;
  }
  const indexSource = fs.readFileSync(index, 'utf8');
  const nonEmpty = indexSource
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
  if (nonEmpty > 5)
    report(
      index,
      'Edge Function index.ts must contain deployment wiring only.',
    );

  for (const file of filesUnder(endpointRoot)) {
    for (const specifier of importsFrom(fs.readFileSync(file, 'utf8'))) {
      const target = resolveLocal(file, specifier);
      if (!target || !target.startsWith(functionsRoot)) continue;
      const targetEndpoint = endpointNames.find((name) =>
        target.startsWith(path.join(functionsRoot, name) + path.sep),
      );
      if (targetEndpoint && targetEndpoint !== endpoint) {
        report(
          file,
          `endpoint "${endpoint}" must not import endpoint "${targetEndpoint}".`,
        );
      }
    }
  }
}

const sharedDomain = path.join(functionsRoot, '_shared', 'domain');
for (const file of filesUnder(sharedDomain)) {
  const source = fs.readFileSync(file, 'utf8');
  if (/\bDeno\.env\b|\bfetch\s*\(|supabase|cloudflare/i.test(source)) {
    report(
      file,
      'shared domain code must stay pure and infrastructure-agnostic.',
    );
  }
}

for (const file of filesUnder(path.join(functionsRoot, '_shared'))) {
  for (const specifier of importsFrom(fs.readFileSync(file, 'utf8'))) {
    const target = resolveLocal(file, specifier);
    if (
      target &&
      endpointNames.some((name) =>
        target.startsWith(path.join(functionsRoot, name)),
      )
    ) {
      report(file, 'the shared kernel must not depend on an endpoint.');
    }
  }
}

const migrationNames = fs
  .readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('.sql'));
for (const name of migrationNames) {
  if (!/^\d{12}_[a-z0-9_]+\.sql$/.test(name)) {
    violations.push(
      `supabase/migrations/${name}: use timestamp_snake_case.sql naming.`,
    );
  }
}

if (violations.length) {
  process.stderr.write(
    `Backend architecture check failed (${violations.length}):\n${violations
      .map((violation) => `- ${violation}`)
      .join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write('Backend architecture check passed.\n');
}
