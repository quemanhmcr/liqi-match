#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const MAX_PRODUCTION_MODULE_LINES = 1500;
const productionRoots = [
  'src/',
  'contracts/',
  'supabase/functions/',
  'cloudflare/media-worker/src/',
];

function lineCount(source) {
  if (!source) return 0;
  const lines = source.split(/\r?\n/);
  return lines.length - (lines.at(-1) === '' ? 1 : 0);
}

const candidates = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8', windowsHide: true },
)
  .split(/\r?\n/)
  .filter(Boolean)
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => productionRoots.some((prefix) => file.startsWith(prefix)))
  .filter((file) => /\.(?:ts|tsx)$/.test(file))
  .filter((file) => !/(?:^|\/)(?:__tests__|test|tests)(?:\/|$)/.test(file))
  .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
  .filter((file) => fs.existsSync(path.join(root, file)));

const oversized = candidates
  .map((file) => ({
    file,
    lines: lineCount(fs.readFileSync(path.join(root, file), 'utf8')),
  }))
  .filter(({ lines }) => lines > MAX_PRODUCTION_MODULE_LINES)
  .sort((left, right) => right.lines - left.lines);

if (oversized.length) {
  console.error(
    `Module size check failed (maximum ${MAX_PRODUCTION_MODULE_LINES} lines):`,
  );
  for (const item of oversized) {
    console.error(`- ${item.file}: ${item.lines} lines`);
  }
  console.error(
    'Split by cohesive behavior or ownership; do not bypass the gate with generated wrappers.',
  );
  process.exit(1);
}

const largest = candidates
  .map((file) => ({
    file,
    lines: lineCount(fs.readFileSync(path.join(root, file), 'utf8')),
  }))
  .sort((left, right) => right.lines - left.lines)
  .slice(0, 5);
console.log(
  `Module size check passed (${candidates.length} production modules, maximum ${MAX_PRODUCTION_MODULE_LINES} lines).`,
);
for (const item of largest) console.log(`- ${item.file}: ${item.lines}`);
