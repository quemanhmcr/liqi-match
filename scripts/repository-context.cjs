#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function git(args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd: options.cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (options.allowFailure) return '';
    const detail = error.stderr?.toString().trim();
    throw new Error(detail || `git ${args.join(' ')} failed`);
  }
}

function canonical(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function activeTasks(commonDir, config) {
  const activeRoot = path.join(
    commonDir,
    config.metadataDirectory || 'liqi-worktrees',
    'active',
  );
  if (!fs.existsSync(activeRoot)) return [];
  return fs
    .readdirSync(activeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(activeRoot, entry.name, 'manifest.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => readJson(file))
    .map((manifest) => ({
      id: manifest.id,
      taskName: manifest.taskName,
      path: manifest.worktree.path,
      exists: fs.existsSync(manifest.worktree.path),
      status: manifest.status,
    }));
}

function statusCount(root) {
  const output = git(['status', '--porcelain=v1', '-z'], { cwd: root });
  return output ? output.split('\0').filter(Boolean).length : 0;
}

function main() {
  const json = process.argv.includes('--json');
  const root = git(['rev-parse', '--show-toplevel']);
  const gitDir = git(['rev-parse', '--absolute-git-dir'], { cwd: root });
  const commonDir = git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: root },
  );
  const branch = git(['branch', '--show-current'], {
    cwd: root,
    allowFailure: true,
  });
  const localOnly =
    git(['config', '--bool', '--get', `branch.${branch}.liqiLocalOnly`], {
      cwd: root,
      allowFailure: true,
    }) === 'true';
  const manifestPath = path.join(root, '.liqi-worktree', 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  const configPath = path.join(root, 'worktree.config.json');
  const config = fs.existsSync(configPath) ? readJson(configPath) : {};
  const isPrimary = canonical(gitDir) === canonical(commonDir);
  const hooksPath = git(['config', '--get', 'core.hooksPath'], {
    cwd: root,
    allowFailure: true,
  });
  const hooksActive = hooksPath === '.githooks';

  let role = 'unmanaged-or-publishable';
  let contract =
    'Use this checkout only for a clean publishable branch or diagnostics; task snapshot guarantees are not active.';
  let next = [
    'Managed option from primary: npm run task:start -- <type/name>',
    'Read docs/architecture/README.md before changing an ownership boundary.',
  ];

  if (manifest) {
    role = 'managed-task-worktree';
    contract =
      'This managed snapshot branch is local-only and cannot be pushed. Keep the task patch focused, or move it to a clean publishable branch when ready.';
    next = [
      'npm run task:inspect',
      'npm run task:check',
      `From primary: npm run task:review -- ${root}`,
      `From primary: npm run task:finish -- ${root}`,
    ];
  } else if (isPrimary) {
    role = 'primary-review-workspace';
    contract =
      'Common use: baseline, diagnostics and temporary review. Primary commits are blocked; use another checkout for commit-ready work.';
    next = [
      'npm run task:start -- <type/descriptive-name>',
      'npm run task:list',
      'Read CONTRIBUTING.md and docs/architecture/README.md.',
    ];
  } else if (localOnly) {
    role = 'managed-task-metadata-missing';
    contract =
      'This branch is marked local-only but its worktree manifest is missing. Stop and repair or recover the task before editing.';
    next = [
      'npm run task:list',
      'Inspect shared Git metadata before proceeding.',
    ];
  }

  const result = {
    role,
    root,
    branch: branch || '(detached)',
    head: git(['rev-parse', '--short=12', 'HEAD'], { cwd: root }),
    dirtyEntries: statusCount(root),
    hooks: {
      active: hooksActive,
      configuredPath: hooksPath || null,
      repairCommand: hooksActive ? null : 'npm run repo:setup',
    },
    localOnly,
    managedTask: manifest
      ? {
          id: manifest.id,
          snapshot: manifest.snapshot.commit,
          primary: manifest.primary.root,
          status: manifest.status,
        }
      : null,
    activeTasks: activeTasks(commonDir, config),
    contract,
    next,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const label = role.replaceAll('-', ' ').toUpperCase();
  console.log('Liqi repository context');
  console.log(`Role: ${label}`);
  console.log(`Path: ${root}`);
  console.log(`Branch: ${result.branch} @ ${result.head}`);
  console.log(`Working tree entries: ${result.dirtyEntries}`);
  console.log(
    `Git hooks: ${hooksActive ? 'active (.githooks)' : 'NOT ACTIVE; run npm run repo:setup'}`,
  );
  if (manifest) {
    console.log(`Task snapshot: ${result.managedTask.snapshot}`);
    console.log(`Primary: ${result.managedTask.primary}`);
  }
  console.log(`Guidance: ${contract}`);
  console.log('Next:');
  for (const command of next) console.log(`  ${command}`);
  if (result.activeTasks.length) {
    console.log(`Active managed tasks: ${result.activeTasks.length}`);
    for (const task of result.activeTasks) {
      console.log(
        `  ${task.taskName} -> ${task.path}${task.exists ? '' : ' (missing path)'}`,
      );
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`Repository context failed: ${error.message}`);
  process.exitCode = 1;
}
