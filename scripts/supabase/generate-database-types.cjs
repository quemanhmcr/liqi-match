#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.artifacts', 'supabase', 'database.types.ts');
const executable = process.platform === 'win32' ? 'supabase.cmd' : 'supabase';
const result = spawnSync(
  executable,
  ['gen', 'types', 'typescript', '--local'],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);

if (result.error || result.status !== 0) {
  const detail =
    result.stderr?.trim() || result.error?.message || 'unknown error';
  console.error(`Supabase type generation failed: ${detail}`);
  process.exit(1);
}

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, result.stdout, 'utf8');
console.log(
  `Generated diagnostic Supabase types at ${path.relative(root, output)}.`,
);
console.log(
  'These types are not an application contract and must not be committed.',
);
