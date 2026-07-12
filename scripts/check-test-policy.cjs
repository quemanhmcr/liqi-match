const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const violations = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.test\.tsx?$/.test(entry.name)) continue;

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
  }
}

walk('src');

if (violations.length > 0) {
  console.error('Test policy violations:\n' + violations.join('\n'));
  process.exit(1);
}

console.log('Test policy check passed.');
