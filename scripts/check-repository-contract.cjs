#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = process.cwd();
const failures = [];

function repoPath(value) {
  return path.join(root, ...value.split('/'));
}

function read(value) {
  const file = repoPath(value);
  if (!fs.existsSync(file)) {
    failures.push(`${value}: required repository entry point is missing`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function requireText(file, patterns) {
  const content = read(file);
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      failures.push(
        `${file}: missing repository entry-point marker ${pattern}`,
      );
    }
  }
}

function requireScript(scripts, name, expected) {
  if (scripts[name] !== expected) {
    failures.push(
      `package.json: script ${name} must be ${JSON.stringify(expected)}`,
    );
  }
}

const packageJson = JSON.parse(read('package.json') || '{}');
const scripts = packageJson.scripts || {};

const expectedScripts = {
  'repo:context': 'node scripts/repository-context.cjs',
  'repository:check': 'node scripts/check-repository-contract.cjs',
  'design:new-screen': 'node scripts/design/create-liqi-screen.cjs',
  'design-system:self-test':
    'node --test scripts/design/design-governance.test.cjs',
  'design-system:check': 'node scripts/check-design-system.cjs',
  'migration-history:check':
    'node scripts/contracts/check-migration-history-v1.cjs',
  'task:start': 'node scripts/worktree/worktree-cli.cjs create',
  'task:inspect': 'node scripts/worktree/worktree-cli.cjs doctor',
  'task:list': 'node scripts/worktree/worktree-cli.cjs list',
  'task:review': 'node scripts/worktree/worktree-cli.cjs overlay',
  'task:undo': 'node scripts/worktree/worktree-cli.cjs rollback',
  'task:finish': 'node scripts/worktree/worktree-cli.cjs cleanup',
};
for (const [name, expected] of Object.entries(expectedScripts)) {
  requireScript(scripts, name, expected);
}

if (!scripts['architecture:check']?.includes('design-system:self-test')) {
  failures.push(
    'package.json: architecture:check must include design-system:self-test',
  );
}
if (!scripts['architecture:check']?.includes('design-system:check')) {
  failures.push(
    'package.json: architecture:check must include design-system:check',
  );
}
if (!scripts['task:check']?.includes('repository:check')) {
  failures.push('package.json: task:check must include repository:check');
}
if (!scripts['task:check']?.includes('migration-history:check')) {
  failures.push(
    'package.json: task:check must include migration-history:check',
  );
}
if (!scripts['task:check']?.includes('test:ci')) {
  failures.push('package.json: task:check must include test:ci');
}
if (!scripts['repo:setup']?.includes('core.hooksPath .githooks')) {
  failures.push('package.json: repo:setup must activate committed Git hooks');
}

requireText('README.md', [
  /CONTRIBUTING\.md/,
  /DESIGN\.md/,
  /docs\/design\/LIQI_DESIGN_SYSTEM\.md/,
  /docs\/architecture\/README\.md/,
  /npm ci/,
  /npm run repo:context/,
  /npm run design:new-screen/,
  /npm run design-system:check/,
  /npm run task:check/,
]);
const readme = read('README.md');
if (/expo\.dev\/artifacts|Build ID:/i.test(readme)) {
  failures.push(
    'README.md: transient build IDs and artifact URLs belong in operational records, not the repository entry point',
  );
}
requireText('CONTRIBUTING.md', [
  /primary workspace/i,
  /managed task worktree/i,
  /normal Git branch or worktree/i,
  /Home- and Messages-derived shared UI contract/i,
  /npm run design:new-screen/,
  /design-system-legacy-baseline\.json/,
  /npm run task:check/,
  /Liqi-Snapshot: true/,
]);
requireText('AGENTS.md', [
  /npm run repo:context/,
  /managed task worktree/i,
  /normal clean Git worktree/i,
  /DESIGN\.md/,
  /design:new-screen/,
  /liqi-screen-host/,
  /local-only/i,
]);
requireText('docs/architecture/README.md', [
  /Change ownership map/,
  /LiQi UI contract/,
  /mobile-frontend\.md/,
  /backend\.md/,
  /testing\.md/,
  /worktree-workflow\.md/,
]);
requireText('scripts/worktree/README.md', [
  /checksum-verified transaction/,
  /self-test\.cjs/,
]);
requireText('.github/pull_request_template.md', [
  /## Design language/,
  /DESIGN\.md/,
  /legacy UI baseline/i,
  /npm run task:check/,
  /Liqi-Snapshot: true/,
]);
requireText('.github/workflows/ci.yml', [
  /npm run repository:check/,
  /shared UI language/,
]);
requireText('.vscode/tasks.json', [
  /Liqi: Show repository context/,
  /Liqi: Start managed task/,
  /Liqi: Check design language/,
  /Liqi: Create canonical screen/,
  /Liqi: Review task overlay/,
]);
requireText('.githooks/pre-commit', [
  /LIQI_ALLOW_PRIMARY_COMMIT/,
  /Primary review workspace/,
  /Checking LiQi shared UI contract/,
  /check-design-system\.cjs/,
]);
requireText('.githooks/pre-push', [/local snapshot worktree branch/]);

requireText('DESIGN.md', [
  /Home- and Messages-derived shared UI language/,
  /design:new-screen/,
  /design-system:check/,
  /design-system-legacy-baseline\.json/,
]);
requireText('docs/design/LIQI_DESIGN_SYSTEM.md', [
  /## Enforcement/,
  /design-system:self-test/,
  /design:new-screen/,
]);
requireText('docs/adr/0009-home-derived-design-language-governance.md', [
  /Status:\*\* Accepted/,
  /checksum baseline/i,
]);
requireText('scripts/repository-context.cjs', [
  /Home and Messages shared UI language v1/,
  /design:new-screen/,
]);
requireText('scripts/check-design-system.cjs', [
  /design-system-legacy-paths\.lock\.json/,
  /new design debt is forbidden/,
]);

const worktreeConfig = JSON.parse(read('worktree.config.json') || '{}');
if (!worktreeConfig.source?.allow?.includes('.vscode/**')) {
  failures.push(
    'worktree.config.json: source.allow must classify committed VS Code repository tasks',
  );
}
if (!worktreeConfig.source?.deny?.includes('.tmp-worktree-*.json')) {
  failures.push(
    'worktree.config.json: source.deny must exclude transient .tmp-worktree-*.json output',
  );
}

try {
  const branch = execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  let managedLocalOnly = false;
  if (branch) {
    try {
      managedLocalOnly =
        execFileSync(
          'git',
          ['config', '--bool', '--get', `branch.${branch}.liqiLocalOnly`],
          { cwd: root, encoding: 'utf8', windowsHide: true },
        ).trim() === 'true';
    } catch {
      managedLocalOnly = false;
    }
  }

  const stages = execFileSync(
    'git',
    ['ls-files', '--stage', '.githooks/pre-commit', '.githooks/pre-push'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  for (const hook of ['.githooks/pre-commit', '.githooks/pre-push']) {
    const line = stages
      .split(/\r?\n/)
      .find((entry) => entry.endsWith(`\t${hook}`));
    // A newly overlaid hook is intentionally untracked in mutable primary, and
    // an aggregate local snapshot can normalize its mode on Windows. Clean
    // publishable branches and CI remain responsible for enforcing 100755.
    if (!managedLocalOnly && line && !line.startsWith('100755 ')) {
      failures.push(`${hook}: Git executable mode must be 100755`);
    }
  }
} catch (error) {
  failures.push(`Unable to inspect Git hook modes: ${error.message}`);
}

if (failures.length) {
  console.error(
    `Repository entry-point check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Repository entry-point check passed.');
}
