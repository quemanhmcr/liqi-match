#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.resolve(__dirname, 'worktree-cli.cjs');
const sourceConfig = path.resolve(
  __dirname,
  '..',
  '..',
  'worktree.config.json',
);
const sandbox = fs.mkdtempSync(
  path.join(os.tmpdir(), 'liqi-worktree-self-test-'),
);
const primary = path.join(sandbox, 'primary');
const task = path.join(sandbox, 'task');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout || ''}\n${result.stderr || ''}`,
    );
  }
  return result;
}

function git(cwd, ...args) {
  return run('git', args, { cwd });
}

function write(root, repoPath, content) {
  const target = path.join(root, ...repoPath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function read(root, repoPath) {
  return fs.readFileSync(path.join(root, ...repoPath.split('/')), 'utf8');
}

function exists(root, repoPath) {
  return fs.existsSync(path.join(root, ...repoPath.split('/')));
}

function invoke(args, options = {}) {
  return run(process.execPath, [cli, ...args], options);
}

function parseJsonOutput(result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `Unable to parse JSON output:\n${result.stdout}\n${result.stderr}`,
    );
  }
}

try {
  fs.mkdirSync(primary, { recursive: true });
  git(primary, 'init', '-b', 'main');
  git(primary, 'config', 'user.name', 'Liqi Worktree Self Test');
  git(primary, 'config', 'user.email', 'worktree-self-test@example.com');
  git(primary, 'config', 'core.autocrlf', 'false');

  const config = JSON.parse(fs.readFileSync(sourceConfig, 'utf8'));
  config.worktreeRoot = '..';
  config.worktreeNamePrefix = 'task-';
  config.overlay = {
    runHealthCheck: false,
    runRelatedTests: false,
    runTestPolicy: false,
    runTypecheck: false,
  };
  write(
    primary,
    'worktree.config.json',
    `${JSON.stringify(config, null, 2)}\n`,
  );
  write(primary, '.gitignore', 'node_modules/\n.env.local\n.liqi-worktree/\n');
  write(
    primary,
    'package.json',
    '{"name":"worktree-self-test","private":true}\n',
  );
  write(primary, 'tracked.txt', 'base\n');
  write(primary, 'delete-me.txt', 'delete me\n');
  write(primary, 'rename-old.txt', 'rename me\n');
  write(primary, 'unrelated.txt', 'keep me\n');
  git(primary, 'add', '.');
  git(primary, 'commit', '-m', 'base');

  write(primary, 'tracked.txt', 'primary wip\n');
  fs.rmSync(path.join(primary, 'delete-me.txt'));
  write(primary, 'src/untracked.ts', 'export const value = 1;\n');
  write(primary, '.vscode/tasks.json', '{\"version\":\"2.0.0\"}\n');
  write(primary, 'node_modules/ignored.txt', 'artifact\n');
  write(primary, '.tmp-worktree-probe-create.json', '{\"transient\":true}\n');
  write(primary, '.env.local', 'SECRET=self-test\n');

  const created = parseJsonOutput(
    invoke([
      'create',
      'fix/self-test',
      '--primary',
      primary,
      '--path',
      task,
      '--skip-install',
      '--skip-health',
      '--json',
    ]),
  );

  if (read(task, 'tracked.txt') !== 'primary wip\n')
    throw new Error('tracked modification missing');
  if (exists(task, 'delete-me.txt'))
    throw new Error('tracked deletion was restored');
  if (!exists(task, 'src/untracked.ts'))
    throw new Error('untracked source missing');
  if (!exists(task, '.vscode/tasks.json'))
    throw new Error('repository VS Code tasks missing');
  if (exists(task, 'node_modules/ignored.txt'))
    throw new Error('ignored artifact copied');
  if (exists(task, '.tmp-worktree-probe-create.json'))
    throw new Error('transient machine output copied into snapshot');
  if (read(task, '.env.local') !== 'SECRET=self-test\n')
    throw new Error('env allowlist copy failed');
  if (git(task, 'status', '--porcelain').stdout.trim())
    throw new Error('created worktree is dirty');
  if (
    git(
      primary,
      'config',
      '--get',
      'branch.fix/self-test.liqiLocalOnly',
    ).stdout.trim() !== 'true'
  ) {
    throw new Error('local-only branch marker missing');
  }
  const preCommit = path.resolve(
    __dirname,
    '..',
    '..',
    '.githooks',
    'pre-commit',
  );
  const primaryCommitGuard = spawnSync('sh', [preCommit], {
    cwd: primary,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (
    primaryCommitGuard.status === 0 ||
    !`${primaryCommitGuard.stdout}${primaryCommitGuard.stderr}`.includes(
      'Primary review workspace',
    )
  ) {
    throw new Error('pre-commit hook did not block the primary workspace');
  }
  const taskCommitGuard = spawnSync('sh', [preCommit], {
    cwd: task,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (taskCommitGuard.status !== 0) {
    throw new Error(
      `pre-commit hook blocked a managed task worktree\n${taskCommitGuard.stdout}${taskCommitGuard.stderr}`,
    );
  }

  write(task, 'tracked.txt', 'task change\n');
  fs.rmSync(path.join(task, 'src', 'untracked.ts'));
  write(task, 'src/added.ts', 'export const added = true;\n');
  git(task, 'mv', 'rename-old.txt', 'rename-new.txt');
  git(task, 'add', '-A');
  git(task, 'commit', '-m', 'task patch');

  write(primary, 'tracked.txt', 'concurrent edit\n');
  const blocked = invoke(
    ['overlay', task, '--primary', primary, '--skip-smoke', '--json'],
    { allowFailure: true },
  );
  if (
    blocked.status === 0 ||
    !`${blocked.stdout}${blocked.stderr}`.includes('Primary changed')
  ) {
    throw new Error('concurrent modification was not blocked');
  }

  write(primary, 'tracked.txt', 'primary wip\n');
  write(primary, 'unrelated-local.txt', 'unrelated local state\n');
  const firstOverlay = parseJsonOutput(
    invoke(['overlay', task, '--primary', primary, '--skip-smoke', '--json']),
  );
  if (read(primary, 'tracked.txt') !== 'task change\n')
    throw new Error('modified file not overlaid');
  if (exists(primary, 'src/untracked.ts'))
    throw new Error('task deletion not overlaid');
  if (!exists(primary, 'src/added.ts'))
    throw new Error('task addition not overlaid');
  if (exists(primary, 'rename-old.txt') || !exists(primary, 'rename-new.txt')) {
    throw new Error('task rename not overlaid');
  }
  if (read(primary, 'unrelated-local.txt') !== 'unrelated local state\n') {
    throw new Error('unrelated primary state changed');
  }

  invoke(['rollback', firstOverlay.id, '--primary', primary, '--json']);
  if (read(primary, 'tracked.txt') !== 'primary wip\n')
    throw new Error('rollback did not restore modification');
  if (!exists(primary, 'src/untracked.ts'))
    throw new Error('rollback did not restore deletion');
  if (exists(primary, 'src/added.ts'))
    throw new Error('rollback did not remove addition');
  if (!exists(primary, 'rename-old.txt') || exists(primary, 'rename-new.txt')) {
    throw new Error('rollback did not restore rename');
  }

  const hook = path.resolve(__dirname, '..', '..', '.githooks', 'pre-push');
  const hookInput = `refs/heads/fix/self-test ${git(task, 'rev-parse', 'HEAD').stdout.trim()} refs/heads/fix/self-test 0000000000000000000000000000000000000000\n`;
  const hookResult = spawnSync('sh', [hook], {
    cwd: primary,
    encoding: 'utf8',
    input: hookInput,
    windowsHide: true,
  });
  if (
    hookResult.status === 0 ||
    !`${hookResult.stdout}${hookResult.stderr}`.includes(
      'local snapshot worktree branch',
    )
  ) {
    throw new Error('pre-push hook did not block the local-only branch');
  }

  const secondOverlay = parseJsonOutput(
    invoke(['overlay', task, '--primary', primary, '--skip-smoke', '--json']),
  );
  const cleanup = parseJsonOutput(
    invoke(['cleanup', task, '--primary', primary, '--json']),
  );
  if (exists(sandbox, 'task'))
    throw new Error('worktree directory remains after cleanup');
  if (
    !fs.existsSync(cleanup.bundlePath) ||
    !fs.existsSync(path.join(cleanup.archiveRoot, 'task.patch'))
  ) {
    throw new Error('cleanup archive is incomplete');
  }
  if (
    run(
      'git',
      ['show-ref', '--verify', '--quiet', 'refs/heads/fix/self-test'],
      { cwd: primary, allowFailure: true },
    ).status === 0
  ) {
    throw new Error('task branch remains after cleanup');
  }
  if (
    run('git', ['show-ref', '--verify', '--quiet', created.snapshot.ref], {
      cwd: primary,
      allowFailure: true,
    }).status === 0
  ) {
    throw new Error('snapshot ref remains after cleanup');
  }

  invoke(['rollback', secondOverlay.id, '--primary', primary, '--json']);
  if (read(primary, 'tracked.txt') !== 'primary wip\n') {
    throw new Error('rollback archive failed after worktree cleanup');
  }

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        snapshot: created.snapshot.commit,
        firstOverlay: firstOverlay.id,
        secondOverlay: secondOverlay.id,
        archive: cleanup.archiveRoot,
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
