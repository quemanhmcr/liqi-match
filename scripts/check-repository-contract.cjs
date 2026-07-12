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
      failures.push(`${file}: missing contract marker ${pattern}`);
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

if (!scripts['task:check']?.includes('repository:check')) {
  failures.push('package.json: task:check must include repository:check');
}
if (!scripts['task:check']?.includes('test:ci')) {
  failures.push('package.json: task:check must include test:ci');
}
if (!scripts['repo:setup']?.includes('core.hooksPath .githooks')) {
  failures.push('package.json: repo:setup must activate committed Git hooks');
}

requireText('README.md', [
  /CONTRIBUTING\.md/,
  /npm run repo:context/,
  /npm run task:start/,
]);
requireText('CONTRIBUTING.md', [
  /primary workspace/i,
  /managed task worktree/i,
  /npm run task:check/,
  /Liqi-Snapshot: true/,
]);
requireText('AGENTS.md', [
  /npm run repo:context/,
  /npm run task:start/,
  /npm run task:review/,
  /must not be pushed/i,
]);
requireText('docs/architecture/README.md', [
  /Change ownership map/,
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
  /npm run task:check/,
  /Liqi-Snapshot: true/,
]);
requireText('.github/workflows/ci.yml', [/npm run repository:check/]);
requireText('.vscode/tasks.json', [
  /Liqi: Show repository context/,
  /Liqi: Start managed task/,
  /Liqi: Review task overlay/,
]);
requireText('.githooks/pre-commit', [
  /LIQI_ALLOW_PRIMARY_COMMIT/,
  /Primary review workspace/,
]);
requireText('.githooks/pre-push', [/local snapshot worktree branch/]);

const worktreeConfig = JSON.parse(read('worktree.config.json') || '{}');
if (!worktreeConfig.source?.deny?.includes('.tmp-worktree-*.json')) {
  failures.push(
    'worktree.config.json: source.deny must exclude transient .tmp-worktree-*.json output',
  );
}

try {
  const stages = execFileSync(
    'git',
    ['ls-files', '--stage', '.githooks/pre-commit', '.githooks/pre-push'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  for (const hook of ['.githooks/pre-commit', '.githooks/pre-push']) {
    const line = stages
      .split(/\r?\n/)
      .find((entry) => entry.endsWith(`\t${hook}`));
    // A newly overlaid hook is intentionally untracked in the mutable primary
    // review workspace. Clean publishable branches and CI have a stage entry,
    // where executable mode remains enforceable.
    if (line && !line.startsWith('100755 ')) {
      failures.push(`${hook}: Git executable mode must be 100755`);
    }
  }
} catch (error) {
  failures.push(`Unable to inspect Git hook modes: ${error.message}`);
}

if (failures.length) {
  console.error(
    `Repository contract check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Repository operating contract check passed.');
}
