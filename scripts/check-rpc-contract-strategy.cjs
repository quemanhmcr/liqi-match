#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const tracked = execFileSync('git', ['ls-files'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
})
  .split(/\r?\n/)
  .filter(Boolean);

for (const file of tracked) {
  const normalized = file.replaceAll('\\', '/');
  const absolute = path.join(root, file);
  const exists = fs.existsSync(absolute);
  if (/database\.types\.ts$/i.test(normalized) && exists) {
    failures.push(
      `${normalized}: generated database types must remain local artifacts`,
    );
  }
  if (!exists) continue;
  if (!normalized.startsWith('src/') || !/\.(?:ts|tsx)$/.test(normalized))
    continue;
  if (/\/(?:__tests__|test)\//.test(normalized) || /\.test\./.test(normalized))
    continue;
  const source = fs.readFileSync(absolute, 'utf8');
  if (/\bsupabase\s*\.\s*from\s*\(/.test(source)) {
    failures.push(
      `${normalized}: mobile production code must use validated RPC repositories, not direct table access`,
    );
  }
  if (/database\.types/.test(source)) {
    failures.push(
      `${normalized}: application code must not depend on generated database table types`,
    );
  }
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const typeCommand = packageJson.scripts?.['supabase:types'] ?? '';
if (!typeCommand.includes('scripts/supabase/generate-database-types.cjs')) {
  failures.push(
    'package.json: supabase:types must write only to the ignored diagnostic artifact path',
  );
}

if (failures.length) {
  console.error('RPC contract strategy check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  'RPC contract strategy check passed (RPC/Zod boundary, no tracked database types).',
);
