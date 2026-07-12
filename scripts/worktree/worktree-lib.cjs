const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MAX_BUFFER = 1024 * 1024 * 1024;
const ZERO_OID = '0000000000000000000000000000000000000000';

function fail(message, details = []) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function resolveCommand(command, args) {
  if (process.platform !== 'win32') return { command, args };
  const nodeDirectory = path.dirname(process.execPath);
  if (command === 'npm' || command === 'npx') {
    const cli = path.join(
      nodeDirectory,
      'node_modules',
      'npm',
      'bin',
      command === 'npm' ? 'npm-cli.js' : 'npx-cli.js',
    );
    if (!fs.existsSync(cli)) fail(`Unable to locate ${command} CLI: ${cli}`);
    return { command: process.execPath, args: [cli, ...args] };
  }
  if (command === 'pnpm' || command === 'yarn') {
    const corepack = path.join(
      nodeDirectory,
      'node_modules',
      'corepack',
      'dist',
      'corepack.js',
    );
    if (!fs.existsSync(corepack)) {
      fail(`Unable to locate Corepack for ${command}: ${corepack}`);
    }
    return { command: process.execPath, args: [corepack, command, ...args] };
  }
  return { command, args };
}

function run(command, args = [], options = {}) {
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    input: options.input,
    maxBuffer: options.maxBuffer ?? MAX_BUFFER,
    shell: false,
    stdio: options.stdio,
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : result.stderr || '';
    const stdout = Buffer.isBuffer(result.stdout)
      ? result.stdout.toString('utf8')
      : result.stdout || '';
    fail(
      `${command} ${args.join(' ')} failed with exit code ${result.status}`,
      [stdout.trim(), stderr.trim()].filter(Boolean),
    );
  }
  return result;
}

function git(cwd, args, options = {}) {
  return run('git', args, { ...options, cwd });
}

function gitText(cwd, args, options = {}) {
  return String(git(cwd, args, options).stdout ?? '').trim();
}

function gitBuffer(cwd, args, options = {}) {
  return (
    git(cwd, args, { ...options, encoding: null }).stdout || Buffer.alloc(0)
  );
}

function toPosix(value) {
  return value.replaceAll('\\', '/');
}

function normalizeRepoPath(value) {
  return toPosix(value).replace(/^\.\//, '').replace(/\/$/, '');
}

function resolveGitPath(cwd, value) {
  return path.resolve(cwd, value);
}

function getRepoRoot(cwd = process.cwd()) {
  return path.resolve(gitText(cwd, ['rev-parse', '--show-toplevel']));
}

function getCommonGitDir(cwd) {
  return resolveGitPath(cwd, gitText(cwd, ['rev-parse', '--git-common-dir']));
}

function getMainWorktree(cwd) {
  const raw = gitBuffer(cwd, ['worktree', 'list', '--porcelain', '-z']);
  const fields = raw.toString('utf8').split('\0').filter(Boolean);
  const first = fields.find((field) => field.startsWith('worktree '));
  if (!first) fail('Unable to identify the main Git worktree.');
  return path.resolve(first.slice('worktree '.length));
}

function loadConfig(primaryRoot) {
  const configPath = path.join(primaryRoot, 'worktree.config.json');
  if (!fs.existsSync(configPath)) {
    fail(`Missing worktree workflow config: ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.schemaVersion !== 1) {
    fail(`Unsupported worktree.config.json schema: ${config.schemaVersion}`);
  }
  return config;
}

function loadConfigWithFallback(primaryRoot, fallbackRoot) {
  const primaryConfig = path.join(primaryRoot, 'worktree.config.json');
  if (fs.existsSync(primaryConfig)) return loadConfig(primaryRoot);
  if (
    fallbackRoot &&
    fs.existsSync(path.join(fallbackRoot, 'worktree.config.json'))
  ) {
    return loadConfig(fallbackRoot);
  }
  return loadConfig(primaryRoot);
}

function metadataRoot(primaryRoot, config) {
  return path.join(getCommonGitDir(primaryRoot), config.metadataDirectory);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function nowId(prefix) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const random = crypto.randomBytes(3).toString('hex');
  return `${prefix}-${stamp}-${random}`;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function sha256Path(filePath) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    return sha256Buffer(Buffer.from(fs.readlinkSync(filePath), 'utf8'));
  }
  if (!stat.isFile()) return null;
  return sha256File(filePath);
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, filePath);
}

function writeBufferAtomic(filePath, buffer) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(temp, buffer);
  if (fs.existsSync(filePath))
    fs.rmSync(filePath, { force: true, recursive: true });
  fs.renameSync(temp, filePath);
}

function globToRegExp(pattern) {
  const input = normalizeRepoPath(pattern);
  let output = '^';
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '*') {
      if (input[index + 1] === '*') {
        index += 1;
        if (input[index + 1] === '/') {
          index += 1;
          output += '(?:.*/)?';
        } else {
          output += '.*';
        }
      } else {
        output += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      output += '[^/]';
      continue;
    }
    output += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  output += '$';
  return new RegExp(output);
}

function matchesAny(repoPath, patterns = []) {
  const normalized = normalizeRepoPath(repoPath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function splitNull(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter((value) => value.length > 0);
}

function listUntracked(primaryRoot) {
  return splitNull(
    gitBuffer(primaryRoot, ['ls-files', '-o', '--exclude-standard', '-z']),
  ).map(normalizeRepoPath);
}

function classifyUntracked(primaryRoot, config) {
  const source = config.source || {};
  const included = [];
  const excluded = [];
  const unclassified = [];
  const warnings = [];

  for (const repoPath of listUntracked(primaryRoot)) {
    const absolute = safeResolve(primaryRoot, repoPath);
    const stat = fs.lstatSync(absolute);
    const size = stat.isFile() ? stat.size : 0;

    if (matchesAny(repoPath, source.deny)) {
      excluded.push({ path: repoPath, reason: 'deny-pattern', size });
      continue;
    }
    if (
      source.untrackedPolicy === 'allowlist' &&
      !matchesAny(repoPath, source.allow)
    ) {
      unclassified.push(repoPath);
      continue;
    }
    if (size > (source.maxFileBytes ?? Number.POSITIVE_INFINITY)) {
      unclassified.push(`${repoPath} (${size} bytes exceeds maxFileBytes)`);
      continue;
    }
    if (size > (source.warnFileBytes ?? Number.POSITIVE_INFINITY)) {
      warnings.push(`${repoPath} (${size} bytes)`);
    }
    included.push({ path: repoPath, size });
  }

  if (unclassified.length > 0) {
    fail(
      'Untracked paths are not classified by worktree.config.json. Add them to source.allow or source.deny.',
      unclassified,
    );
  }

  return { excluded, included, warnings };
}

function safeResolve(root, repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    path.isAbsolute(normalized)
  ) {
    fail(`Unsafe repository path: ${repoPath}`);
  }
  const resolved = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`Path escapes repository root: ${repoPath}`);
  }
  return resolved;
}

function removeFromIndex(primaryRoot, indexPath, paths) {
  const chunkSize = 80;
  for (let index = 0; index < paths.length; index += chunkSize) {
    git(
      primaryRoot,
      [
        'update-index',
        '--force-remove',
        '--',
        ...paths.slice(index, index + chunkSize),
      ],
      { env: { GIT_INDEX_FILE: indexPath } },
    );
  }
}

function parseNameStatusZ(buffer) {
  const parts = splitNull(buffer);
  const changes = [];
  let index = 0;
  while (index < parts.length) {
    const status = parts[index++];
    const code = status[0];
    if (code === 'R' || code === 'C') {
      const oldPath = normalizeRepoPath(parts[index++]);
      const newPath = normalizeRepoPath(parts[index++]);
      changes.push({ code, status, oldPath, newPath });
    } else {
      const repoPath = normalizeRepoPath(parts[index++]);
      changes.push({ code, status, path: repoPath });
    }
  }
  return changes;
}

function listTreeEntries(worktreeRoot, commit) {
  const parts = splitNull(
    gitBuffer(worktreeRoot, ['ls-tree', '-r', '-z', '--long', commit]),
  );
  return parts.map((entry) => {
    const tab = entry.indexOf('\t');
    const metadata = entry.slice(0, tab).trim().split(/\s+/);
    const repoPath = normalizeRepoPath(entry.slice(tab + 1));
    return {
      mode: metadata[0],
      type: metadata[1],
      oid: metadata[2],
      size: metadata[3] === '-' ? null : Number(metadata[3]),
      path: repoPath,
    };
  });
}

function pathState(root, repoPath) {
  const absolute = safeResolve(root, repoPath);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'absent' };
    throw error;
  }
  if (stat.isSymbolicLink()) {
    return {
      kind: 'symlink',
      sha256: sha256Buffer(Buffer.from(fs.readlinkSync(absolute), 'utf8')),
      target: fs.readlinkSync(absolute),
    };
  }
  if (stat.isFile()) {
    return { kind: 'file', sha256: sha256File(absolute), size: stat.size };
  }
  if (stat.isDirectory()) return { kind: 'directory' };
  return { kind: 'other' };
}

function statesEqual(expected, actual) {
  if (expected.kind !== actual.kind) return false;
  if (expected.kind === 'file' || expected.kind === 'symlink') {
    return expected.sha256 === actual.sha256;
  }
  return true;
}

function createSourceManifest(worktreeRoot, snapshotCommit, primaryHead) {
  const files = {};
  for (const entry of listTreeEntries(worktreeRoot, snapshotCommit)) {
    const state = pathState(worktreeRoot, entry.path);
    files[entry.path] = {
      gitMode: entry.mode,
      gitOid: entry.oid,
      gitSize: entry.size,
      kind: state.kind,
      sha256: state.sha256 ?? null,
      size: state.size ?? entry.size,
    };
  }
  const primaryDelta = parseNameStatusZ(
    gitBuffer(worktreeRoot, [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      primaryHead,
      snapshotCommit,
    ]),
  );
  const deletedFromHead = [];
  for (const change of primaryDelta) {
    if (change.code === 'D') deletedFromHead.push(change.path);
    if (change.code === 'R') deletedFromHead.push(change.oldPath);
  }
  return {
    deletedFromHead,
    files,
    fileCount: Object.keys(files).length,
    primaryDelta,
  };
}

function assertPrimaryMatchesSnapshot(primaryRoot, sourceManifest) {
  const expected = {};
  for (const [repoPath, entry] of Object.entries(sourceManifest.files)) {
    expected[repoPath] = {
      kind: entry.kind,
      sha256: entry.sha256,
      size: entry.size,
    };
  }
  for (const repoPath of sourceManifest.deletedFromHead) {
    if (!expected[repoPath]) expected[repoPath] = { kind: 'absent' };
  }
  assertStates(
    primaryRoot,
    expected,
    'Primary changed while the worktree snapshot was being created. Discard this worktree and retry.',
  );
}

function copyEnvironment(primaryRoot, worktreeRoot, config) {
  const results = [];
  for (const entry of config.environment?.files || []) {
    const repoPath = normalizeRepoPath(entry.path);
    const source = safeResolve(primaryRoot, repoPath);
    const destination = safeResolve(worktreeRoot, repoPath);
    if (!fs.existsSync(source)) {
      if (entry.required)
        fail(`Required environment file is missing: ${repoPath}`);
      results.push({ path: repoPath, status: 'missing-optional' });
      continue;
    }
    if (entry.mode !== 'copy') {
      fail(`Unsupported environment file mode '${entry.mode}' for ${repoPath}`);
    }
    ensureDir(path.dirname(destination));
    fs.copyFileSync(source, destination);
    results.push({
      mode: entry.mode,
      path: repoPath,
      sha256: sha256File(destination),
      status: 'copied',
    });
  }
  return results;
}

function defaultWorktreePath(primaryRoot, taskName, config) {
  const leaf = taskName.split('/').filter(Boolean).at(-1);
  if (!leaf) fail(`Invalid task branch name: ${taskName}`);
  const slug = leaf
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) fail(`Unable to derive a worktree path from branch: ${taskName}`);
  return path.resolve(
    primaryRoot,
    config.worktreeRoot,
    `${config.worktreeNamePrefix}${slug}`,
  );
}

function createSnapshotCommit(primaryRoot, taskName, config, id) {
  const common = getCommonGitDir(primaryRoot);
  const indexPath = path.join(common, `${id}.index`);
  const primaryHead = gitText(primaryRoot, ['rev-parse', 'HEAD']);
  const primaryBranch = gitText(primaryRoot, ['branch', '--show-current']);
  const classification = classifyUntracked(primaryRoot, config);
  fs.rmSync(indexPath, { force: true });
  fs.rmSync(`${indexPath}.lock`, { force: true });

  try {
    git(primaryRoot, ['read-tree', primaryHead], {
      env: { GIT_INDEX_FILE: indexPath },
    });
    git(primaryRoot, ['add', '-A', '--', '.'], {
      env: { GIT_INDEX_FILE: indexPath },
    });
    removeFromIndex(
      primaryRoot,
      indexPath,
      classification.excluded.map((entry) => entry.path),
    );
    const tree = gitText(primaryRoot, ['write-tree'], {
      env: { GIT_INDEX_FILE: indexPath },
    });
    const message = [
      `liqi local integration snapshot ${id}`,
      '',
      'Liqi-Snapshot: true',
      `Liqi-Task: ${taskName}`,
      `Primary-Head: ${primaryHead}`,
      `Primary-Branch: ${primaryBranch}`,
    ].join('\n');
    const snapshotCommit = gitText(
      primaryRoot,
      ['commit-tree', tree, '-p', primaryHead, '-F', '-'],
      { input: `${message}\n` },
    );
    const snapshotRef = `${config.snapshotRefPrefix}/${id}`;
    git(primaryRoot, [
      'update-ref',
      '--create-reflog',
      snapshotRef,
      snapshotCommit,
      ZERO_OID,
    ]);
    return {
      classification,
      primaryBranch,
      primaryHead,
      snapshotCommit,
      snapshotRef,
      tree,
    };
  } finally {
    fs.rmSync(indexPath, { force: true });
    fs.rmSync(`${indexPath}.lock`, { force: true });
  }
}

function installDependencies(worktreeRoot, config, options = {}) {
  const command = config.dependencies?.installCommand;
  if (!Array.isArray(command) || command.length === 0) {
    fail('dependencies.installCommand must be a non-empty array.');
  }
  const lockfile = path.join(worktreeRoot, 'package-lock.json');
  const lockfileBefore = fs.existsSync(lockfile) ? sha256File(lockfile) : null;
  const startedAt = Date.now();
  run(command[0], command.slice(1), {
    cwd: worktreeRoot,
    stdio: options.quiet ? 'pipe' : 'inherit',
  });
  const lockfileAfter = fs.existsSync(lockfile) ? sha256File(lockfile) : null;
  if (lockfileBefore !== lockfileAfter) {
    fail(
      'Dependency bootstrap changed package-lock.json; frozen install contract was violated.',
    );
  }
  const installedLock = path.join(
    worktreeRoot,
    'node_modules',
    '.package-lock.json',
  );
  return {
    command,
    durationMs: Date.now() - startedAt,
    lockfileSha256: lockfileAfter,
    installedLockSha256: fs.existsSync(installedLock)
      ? sha256File(installedLock)
      : null,
    status: 'passed',
  };
}

function resolveFrom(root, request) {
  return require.resolve(request, { paths: [root] });
}

function runHealthChecks(worktreeRoot, config, options = {}) {
  const results = [];
  const runCheck = (name, callback) => {
    const startedAt = Date.now();
    callback();
    results.push({
      name,
      durationMs: Date.now() - startedAt,
      status: 'passed',
    });
  };

  runCheck('package-resolution', () => {
    for (const request of config.dependencies?.healthModules || []) {
      resolveFrom(worktreeRoot, request);
    }
  });

  if (config.health?.dependencyTree && config.dependencies?.manager === 'npm') {
    runCheck('dependency-tree', () => {
      const rootLock = path.join(worktreeRoot, 'package-lock.json');
      const installedLock = path.join(
        worktreeRoot,
        'node_modules',
        '.package-lock.json',
      );
      if (!fs.existsSync(rootLock) || !fs.existsSync(installedLock)) {
        fail(
          'npm dependency lock markers are missing. Run the managed dependency bootstrap.',
        );
      }
      run('npm', ['ls', '--depth=0', '--json'], {
        cwd: worktreeRoot,
        stdio: options.verbose ? 'inherit' : 'ignore',
      });
    });
  }

  if (config.health?.typescript) {
    runCheck('typescript-config', () => {
      const tsc = resolveFrom(worktreeRoot, 'typescript/bin/tsc');
      run(process.execPath, [tsc, '--showConfig'], {
        cwd: worktreeRoot,
        stdio: options.verbose ? 'inherit' : 'ignore',
      });
    });
  }

  if ((config.health?.jestConfigs || []).length > 0) {
    runCheck('jest-config', () => {
      const configs = config.health.jestConfigs.map((value) =>
        path.join(worktreeRoot, value),
      );
      const code = `for (const config of ${JSON.stringify(configs)}) require(config);`;
      run(process.execPath, ['-e', code], {
        cwd: worktreeRoot,
        stdio: options.verbose ? 'inherit' : 'ignore',
      });
    });
  }

  if (config.health?.expoConfig) {
    runCheck('expo-config', () => {
      const expoCli = resolveFrom(worktreeRoot, 'expo/bin/cli');
      run(process.execPath, [expoCli, 'config', '--type', 'public', '--json'], {
        cwd: worktreeRoot,
        stdio: options.verbose ? 'inherit' : 'ignore',
      });
    });
  }

  return results;
}

function manifestPaths(primaryRoot, config, id, worktreeRoot) {
  const active = path.join(metadataRoot(primaryRoot, config), 'active', id);
  return {
    active,
    common: path.join(active, 'manifest.json'),
    worktree: path.join(worktreeRoot, '.liqi-worktree', 'manifest.json'),
  };
}

function saveManifest(manifest, paths) {
  manifest.updatedAt = new Date().toISOString();
  writeJsonAtomic(paths.common, manifest);
  if (fs.existsSync(manifest.worktree.path)) {
    writeJsonAtomic(paths.worktree, manifest);
  }
}

function createWorktree(options) {
  const primaryRoot = getRepoRoot(options.primaryRoot || process.cwd());
  const mainWorktree = getMainWorktree(primaryRoot);
  if (path.resolve(primaryRoot) !== path.resolve(mainWorktree)) {
    fail(`worktree:create must run against the main worktree: ${mainWorktree}`);
  }
  const config = loadConfig(primaryRoot);
  const taskName = options.taskName;
  if (!taskName) fail('Usage: worktree:create -- <branch-name>');
  git(primaryRoot, ['check-ref-format', '--branch', taskName]);
  if (
    git(
      primaryRoot,
      ['show-ref', '--verify', '--quiet', `refs/heads/${taskName}`],
      { allowFailure: true },
    ).status === 0
  ) {
    fail(`Branch already exists: ${taskName}`);
  }

  const worktreeRoot = path.resolve(
    options.worktreePath || defaultWorktreePath(primaryRoot, taskName, config),
  );
  if (fs.existsSync(worktreeRoot))
    fail(`Worktree path already exists: ${worktreeRoot}`);

  const id = nowId('snapshot');
  const startedAt = Date.now();
  const snapshot = createSnapshotCommit(primaryRoot, taskName, config, id);
  let worktreeCreated = false;
  const manifest = {
    schemaVersion: 1,
    id,
    status: 'creating',
    taskName,
    createdAt: new Date().toISOString(),
    primary: {
      root: primaryRoot,
      branch: snapshot.primaryBranch,
      head: snapshot.primaryHead,
      statusSha256: sha256Buffer(
        gitBuffer(primaryRoot, [
          'status',
          '--porcelain=v2',
          '-z',
          '--untracked-files=all',
        ]),
      ),
    },
    snapshot: {
      commit: snapshot.snapshotCommit,
      ref: snapshot.snapshotRef,
      tree: snapshot.tree,
    },
    worktree: { path: worktreeRoot, branch: taskName },
    source: {
      classification: snapshot.classification,
    },
    environment: [],
    dependencies: { status: options.skipInstall ? 'skipped' : 'pending' },
    health: { status: options.skipHealth ? 'skipped' : 'pending' },
    timingsMs: {},
  };
  const paths = manifestPaths(primaryRoot, config, id, worktreeRoot);

  try {
    git(
      primaryRoot,
      [
        'worktree',
        'add',
        '--lock',
        '--reason',
        `liqi snapshot ${id}`,
        '-b',
        taskName,
        worktreeRoot,
        snapshot.snapshotCommit,
      ],
      { stdio: options.json ? 'pipe' : 'inherit' },
    );
    worktreeCreated = true;
    git(primaryRoot, ['config', `branch.${taskName}.liqiLocalOnly`, 'true']);
    git(primaryRoot, [
      'config',
      `branch.${taskName}.liqiSnapshot`,
      snapshot.snapshotCommit,
    ]);

    manifest.source = {
      ...manifest.source,
      ...createSourceManifest(
        worktreeRoot,
        snapshot.snapshotCommit,
        snapshot.primaryHead,
      ),
    };
    assertPrimaryMatchesSnapshot(primaryRoot, manifest.source);
    manifest.environment = copyEnvironment(primaryRoot, worktreeRoot, config);
    manifest.timingsMs.sourceReady = Date.now() - startedAt;
    saveManifest(manifest, paths);

    if (!options.skipInstall) {
      manifest.dependencies = installDependencies(worktreeRoot, config, {
        quiet: options.json && !options.verbose,
      });
      saveManifest(manifest, paths);
    }
    if (!options.skipHealth) {
      manifest.health = {
        status: 'passed',
        checks: runHealthChecks(worktreeRoot, config, {
          verbose: options.verbose,
        }),
      };
      saveManifest(manifest, paths);
    }

    manifest.status = 'ready';
    manifest.timingsMs.total = Date.now() - startedAt;
    saveManifest(manifest, paths);
    return manifest;
  } catch (error) {
    manifest.status = 'failed';
    manifest.failure = {
      message: error.message,
      details: error.details || [],
      at: new Date().toISOString(),
    };
    if (worktreeCreated) {
      saveManifest(manifest, paths);
      error.details = [
        ...(error.details || []),
        `Failed worktree retained for diagnosis: ${worktreeRoot}`,
        `Cleanup: npm run worktree:cleanup -- ${worktreeRoot} --force`,
      ];
    }
    throw error;
  }
}

function readManifestFromWorktree(worktreeRoot) {
  const manifestPath = path.join(
    path.resolve(worktreeRoot),
    '.liqi-worktree',
    'manifest.json',
  );
  if (!fs.existsSync(manifestPath)) {
    fail(`Not a managed Liqi worktree; manifest missing: ${manifestPath}`);
  }
  return {
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    manifestPath,
  };
}

function expectedBaselineState(manifest, repoPath) {
  const entry = manifest.source.files[normalizeRepoPath(repoPath)];
  if (!entry) return { kind: 'absent' };
  return { kind: entry.kind, sha256: entry.sha256, size: entry.size };
}

function assertStates(root, expectedByPath, heading) {
  const conflicts = [];
  for (const [repoPath, expected] of Object.entries(expectedByPath)) {
    const actual = pathState(root, repoPath);
    if (!statesEqual(expected, actual)) {
      conflicts.push({ path: repoPath, expected, actual });
    }
  }
  if (conflicts.length > 0) {
    fail(
      heading,
      conflicts.map((value) => JSON.stringify(value)),
    );
  }
}

function patchOperations(worktreeRoot, snapshotCommit, taskHead) {
  const changes = parseNameStatusZ(
    gitBuffer(worktreeRoot, [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      snapshotCommit,
      taskHead,
    ]),
  );
  const deletes = new Set();
  const writes = new Set();
  for (const change of changes) {
    if (change.code === 'D') deletes.add(change.path);
    else if (change.code === 'R') {
      deletes.add(change.oldPath);
      writes.add(change.newPath);
    } else if (change.code === 'C') {
      writes.add(change.newPath);
    } else {
      writes.add(change.path);
    }
  }
  const allPaths = [...new Set([...deletes, ...writes])].sort();
  return {
    allPaths,
    changes,
    deletes: [...deletes].sort((a, b) => b.length - a.length),
    writes: [...writes].sort((a, b) => a.length - b.length),
  };
}

function backupPrimaryPaths(primaryRoot, overlayRoot, paths) {
  const before = {};
  for (const repoPath of paths) {
    const state = pathState(primaryRoot, repoPath);
    before[repoPath] = state;
    if (state.kind === 'file') {
      const source = safeResolve(primaryRoot, repoPath);
      const destination = safeResolve(
        path.join(overlayRoot, 'backup'),
        repoPath,
      );
      ensureDir(path.dirname(destination));
      fs.copyFileSync(source, destination);
    } else if (state.kind === 'symlink') {
      const destination = safeResolve(
        path.join(overlayRoot, 'backup'),
        repoPath,
      );
      ensureDir(path.dirname(destination));
      fs.writeFileSync(destination, state.target, 'utf8');
    }
  }
  return before;
}

function removeEmptyParents(root, repoPath) {
  let directory = path.dirname(safeResolve(root, repoPath));
  const resolvedRoot = path.resolve(root);
  while (directory !== resolvedRoot && directory.startsWith(resolvedRoot)) {
    try {
      fs.rmdirSync(directory);
    } catch {
      break;
    }
    directory = path.dirname(directory);
  }
}

function removeRepoPath(root, repoPath) {
  const target = safeResolve(root, repoPath);
  fs.rmSync(target, { force: true, recursive: true });
  removeEmptyParents(root, repoPath);
}

function copyRepoPathAtomic(sourceRoot, destinationRoot, repoPath) {
  const source = safeResolve(sourceRoot, repoPath);
  const destination = safeResolve(destinationRoot, repoPath);
  const state = pathState(sourceRoot, repoPath);
  if (state.kind === 'file') {
    writeBufferAtomic(destination, fs.readFileSync(source));
    return;
  }
  if (state.kind === 'symlink') {
    ensureDir(path.dirname(destination));
    fs.rmSync(destination, { force: true, recursive: true });
    try {
      fs.symlinkSync(state.target, destination);
    } catch {
      fs.writeFileSync(destination, state.target, 'utf8');
    }
    return;
  }
  fail(`Task path is not a file or symlink: ${repoPath}`);
}

function restoreBackup(primaryRoot, overlayRoot, before) {
  for (const [repoPath, state] of Object.entries(before)) {
    if (state.kind === 'absent') {
      removeRepoPath(primaryRoot, repoPath);
      continue;
    }
    const backup = safeResolve(path.join(overlayRoot, 'backup'), repoPath);
    const destination = safeResolve(primaryRoot, repoPath);
    if (state.kind === 'file') {
      writeBufferAtomic(destination, fs.readFileSync(backup));
    } else if (state.kind === 'symlink') {
      ensureDir(path.dirname(destination));
      fs.rmSync(destination, { force: true, recursive: true });
      try {
        fs.symlinkSync(fs.readFileSync(backup, 'utf8'), destination);
      } catch {
        fs.writeFileSync(destination, fs.readFileSync(backup));
      }
    } else {
      fail(`Unsupported backup state for ${repoPath}: ${state.kind}`);
    }
  }
}

function assertManagedWorktreeClean(worktreeRoot) {
  const status = gitText(worktreeRoot, [
    'status',
    '--porcelain',
    '--untracked-files=all',
  ]);
  if (status)
    fail('Task worktree must be clean before overlay.', status.split(/\r?\n/));
}

function patchChangesDependencyLock(config, operations) {
  const lockfiles = new Set(
    (config.dependencies?.lockfiles || []).map(normalizeRepoPath),
  );
  return operations.allPaths.some((repoPath) => lockfiles.has(repoPath));
}

function runOverlaySmoke(primaryRoot, config, operations, options = {}) {
  const checks = [];
  const execute = (name, command, args) => {
    const startedAt = Date.now();
    const result = run(command, args, {
      cwd: primaryRoot,
      allowFailure: true,
      stdio: options.verbose ? 'inherit' : 'pipe',
    });
    checks.push({
      name,
      command: [command, ...args],
      durationMs: Date.now() - startedAt,
      status: result.status === 0 ? 'passed' : 'failed',
      stdout: options.verbose
        ? undefined
        : String(result.stdout || '').slice(-8000),
      stderr: options.verbose
        ? undefined
        : String(result.stderr || '').slice(-8000),
    });
    if (result.status !== 0) fail(`Overlay smoke check failed: ${name}`);
  };

  if (config.overlay?.runHealthCheck) {
    const startedAt = Date.now();
    const health = runHealthChecks(primaryRoot, config, {
      verbose: options.verbose,
    });
    checks.push({
      name: 'worktree-health',
      durationMs: Date.now() - startedAt,
      status: 'passed',
      health,
    });
  }
  if (
    config.overlay?.runTestPolicy &&
    fs.existsSync(path.join(primaryRoot, 'scripts', 'check-test-policy.cjs'))
  ) {
    execute('test-policy', process.execPath, ['scripts/check-test-policy.cjs']);
  }
  if (
    config.overlay?.runRelatedTests &&
    fs.existsSync(path.join(primaryRoot, 'scripts', 'run-jest.cjs'))
  ) {
    const related = operations.allPaths.filter((repoPath) =>
      /^src\/.*\.(?:[cm]?[jt]sx?)$/.test(repoPath),
    );
    const chunkSize = 60;
    for (let index = 0; index < related.length; index += chunkSize) {
      execute(`related-tests-${index / chunkSize + 1}`, process.execPath, [
        'scripts/run-jest.cjs',
        '--findRelatedTests',
        ...related.slice(index, index + chunkSize),
        '--passWithNoTests',
      ]);
    }
  }
  if (config.overlay?.runTypecheck) {
    execute('typecheck', 'npm', ['run', 'typecheck']);
  }
  return checks;
}

function overlayWorktree(options) {
  const worktreeRoot = path.resolve(options.worktreePath);
  const { manifest } = readManifestFromWorktree(worktreeRoot);
  const primaryRoot = path.resolve(manifest.primary.root);
  const config = loadConfig(primaryRoot);
  assertManagedWorktreeClean(worktreeRoot);

  const currentPrimaryHead = gitText(primaryRoot, ['rev-parse', 'HEAD']);
  const currentPrimaryBranch = gitText(primaryRoot, [
    'branch',
    '--show-current',
  ]);
  if (currentPrimaryHead !== manifest.primary.head) {
    fail(
      `Primary HEAD changed since snapshot: ${manifest.primary.head} -> ${currentPrimaryHead}`,
    );
  }
  if (currentPrimaryBranch !== manifest.primary.branch) {
    fail(
      `Primary branch changed since snapshot: ${manifest.primary.branch} -> ${currentPrimaryBranch}`,
    );
  }

  const taskHead = gitText(worktreeRoot, ['rev-parse', 'HEAD']);
  if (
    git(
      worktreeRoot,
      ['merge-base', '--is-ancestor', manifest.snapshot.commit, taskHead],
      { allowFailure: true },
    ).status !== 0
  ) {
    fail('Task HEAD is no longer descended from its snapshot commit.');
  }
  const operations = patchOperations(
    worktreeRoot,
    manifest.snapshot.commit,
    taskHead,
  );
  if (operations.allPaths.length === 0)
    fail('Task branch has no committed changes to overlay.');

  const expectedBaseline = Object.fromEntries(
    operations.allPaths.map((repoPath) => [
      repoPath,
      expectedBaselineState(manifest, repoPath),
    ]),
  );
  assertStates(
    primaryRoot,
    expectedBaseline,
    'Primary changed on one or more task paths since snapshot. Overlay stopped.',
  );

  const overlayId = nowId('overlay');
  const overlayRoot = path.join(
    metadataRoot(primaryRoot, config),
    'overlays',
    overlayId,
  );
  ensureDir(overlayRoot);
  const before = backupPrimaryPaths(
    primaryRoot,
    overlayRoot,
    operations.allPaths,
  );
  assertStates(
    primaryRoot,
    expectedBaseline,
    'Primary changed during overlay preparation. Overlay stopped before writing.',
  );

  const after = {};
  for (const repoPath of operations.deletes)
    after[repoPath] = { kind: 'absent' };
  for (const repoPath of operations.writes)
    after[repoPath] = pathState(worktreeRoot, repoPath);

  const overlayManifest = {
    schemaVersion: 1,
    id: overlayId,
    status: 'applying',
    createdAt: new Date().toISOString(),
    primary: {
      root: primaryRoot,
      branch: currentPrimaryBranch,
      head: currentPrimaryHead,
    },
    worktree: {
      path: worktreeRoot,
      branch: manifest.worktree.branch,
      taskHead,
    },
    snapshot: { commit: manifest.snapshot.commit, id: manifest.id },
    operations,
    before,
    after,
    rollbackCommand: `npm run worktree:rollback -- ${overlayId}`,
  };
  writeJsonAtomic(path.join(overlayRoot, 'manifest.json'), overlayManifest);

  try {
    for (const repoPath of operations.deletes)
      removeRepoPath(primaryRoot, repoPath);
    for (const repoPath of operations.writes) {
      copyRepoPathAtomic(worktreeRoot, primaryRoot, repoPath);
    }
    assertStates(primaryRoot, after, 'Overlay verification failed.');
  } catch (error) {
    restoreBackup(primaryRoot, overlayRoot, before);
    overlayManifest.status = 'rolled-back-after-apply-failure';
    overlayManifest.failure = {
      message: error.message,
      details: error.details || [],
    };
    writeJsonAtomic(path.join(overlayRoot, 'manifest.json'), overlayManifest);
    throw error;
  }

  overlayManifest.status = 'applied';
  overlayManifest.appliedAt = new Date().toISOString();
  writeJsonAtomic(path.join(overlayRoot, 'manifest.json'), overlayManifest);

  if (patchChangesDependencyLock(config, operations)) {
    try {
      overlayManifest.dependencySync = installDependencies(
        primaryRoot,
        config,
        {
          quiet: options.json && !options.verbose,
        },
      );
      writeJsonAtomic(path.join(overlayRoot, 'manifest.json'), overlayManifest);
    } catch (error) {
      overlayManifest.status = 'dependency-sync-failed';
      overlayManifest.failure = {
        message: error.message,
        details: error.details || [],
      };
      writeJsonAtomic(path.join(overlayRoot, 'manifest.json'), overlayManifest);
      error.details = [
        ...(error.details || []),
        `Rollback with: ${overlayManifest.rollbackCommand}`,
      ];
      throw error;
    }
  }

  if (!options.skipSmoke) {
    try {
      overlayManifest.smoke = runOverlaySmoke(
        primaryRoot,
        config,
        operations,
        options,
      );
      overlayManifest.status = 'verified';
      overlayManifest.verifiedAt = new Date().toISOString();
    } catch (error) {
      overlayManifest.status = 'smoke-failed';
      overlayManifest.failure = {
        message: error.message,
        details: error.details || [],
      };
      writeJsonAtomic(path.join(overlayRoot, 'manifest.json'), overlayManifest);
      error.details = [
        ...(error.details || []),
        `Rollback with: ${overlayManifest.rollbackCommand}`,
      ];
      throw error;
    }
    writeJsonAtomic(path.join(overlayRoot, 'manifest.json'), overlayManifest);
  }

  return overlayManifest;
}

function findOverlay(primaryRoot, config, overlayId) {
  const overlayRoot = path.join(
    metadataRoot(primaryRoot, config),
    'overlays',
    overlayId,
  );
  const manifestPath = path.join(overlayRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) fail(`Unknown overlay id: ${overlayId}`);
  return {
    overlayRoot,
    manifestPath,
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  };
}

function rollbackOverlay(options) {
  const primaryRoot = getMainWorktree(
    getRepoRoot(options.primaryRoot || process.cwd()),
  );
  const config = loadConfig(primaryRoot);
  const found = findOverlay(primaryRoot, config, options.overlayId);
  const { manifest, overlayRoot, manifestPath } = found;
  if (manifest.status === 'rolled-back') return manifest;
  if (
    !['applied', 'verified', 'smoke-failed', 'dependency-sync-failed'].includes(
      manifest.status,
    )
  ) {
    fail(
      `Overlay ${manifest.id} cannot be rolled back from status '${manifest.status}'.`,
    );
  }
  assertStates(
    primaryRoot,
    manifest.after,
    'Primary changed after overlay. Rollback stopped to protect newer edits.',
  );
  restoreBackup(primaryRoot, overlayRoot, manifest.before);
  assertStates(primaryRoot, manifest.before, 'Rollback verification failed.');
  if (patchChangesDependencyLock(config, manifest.operations)) {
    manifest.rollbackDependencySync = installDependencies(primaryRoot, config, {
      quiet: options.json && !options.verbose,
    });
  }
  manifest.status = 'rolled-back';
  manifest.rolledBackAt = new Date().toISOString();
  writeJsonAtomic(manifestPath, manifest);
  return manifest;
}

function archiveWorktree(primaryRoot, config, manifest, options = {}) {
  const archiveId = `${manifest.id}-${new Date().toISOString().slice(0, 10)}`;
  const archiveRoot = path.join(
    metadataRoot(primaryRoot, config),
    'archives',
    archiveId,
  );
  ensureDir(archiveRoot);
  const worktreeRoot = manifest.worktree.path;
  const taskHead = gitText(worktreeRoot, ['rev-parse', 'HEAD']);
  const status = gitText(worktreeRoot, [
    'status',
    '--porcelain',
    '--untracked-files=all',
  ]);
  if (status && !options.force) {
    fail(
      'Worktree is dirty. Commit changes or rerun cleanup with --force to archive dirty state.',
      status.split(/\r?\n/),
    );
  }

  fs.copyFileSync(
    path.join(worktreeRoot, '.liqi-worktree', 'manifest.json'),
    path.join(archiveRoot, 'manifest.json'),
  );
  fs.writeFileSync(path.join(archiveRoot, 'status.txt'), `${status}\n`, 'utf8');
  fs.writeFileSync(
    path.join(archiveRoot, 'commits.txt'),
    `${gitText(worktreeRoot, ['log', '--oneline', `${manifest.snapshot.commit}..${taskHead}`])}\n`,
    'utf8',
  );
  const patch = gitBuffer(worktreeRoot, [
    'diff',
    '--binary',
    '--full-index',
    manifest.snapshot.commit,
    taskHead,
  ]);
  fs.writeFileSync(path.join(archiveRoot, 'task.patch'), patch);

  if (status) {
    fs.writeFileSync(
      path.join(archiveRoot, 'working-tree.patch'),
      gitBuffer(worktreeRoot, ['diff', '--binary', '--full-index', 'HEAD']),
    );
    const untracked = splitNull(
      gitBuffer(worktreeRoot, ['ls-files', '-o', '--exclude-standard', '-z']),
    );
    for (const repoPath of untracked) {
      const source = safeResolve(worktreeRoot, repoPath);
      const destination = safeResolve(
        path.join(archiveRoot, 'untracked'),
        repoPath,
      );
      ensureDir(path.dirname(destination));
      fs.cpSync(source, destination, { recursive: true, dereference: false });
    }
  }

  const bundlePath = path.join(archiveRoot, 'task.bundle');
  git(primaryRoot, [
    'bundle',
    'create',
    bundlePath,
    `refs/heads/${manifest.worktree.branch}`,
    manifest.snapshot.ref,
  ]);
  return { archiveId, archiveRoot, bundlePath };
}

function pruneRetention(primaryRoot, config) {
  const days = config.retention?.days ?? 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const root = metadataRoot(primaryRoot, config);
  for (const category of ['archives', 'overlays']) {
    const directory = path.join(root, category);
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const absolute = path.join(directory, entry.name);
      const stat = fs.statSync(absolute);
      if (stat.mtimeMs < cutoff)
        fs.rmSync(absolute, { recursive: true, force: true });
    }
  }
}

function detectWorktreeProcesses(worktreeRoot) {
  const normalized = path.resolve(worktreeRoot).toLowerCase();
  const excluded = new Set([process.pid, process.ppid]);
  if (process.platform === 'win32') {
    const script = [
      '$items = Get-CimInstance Win32_Process |',
      'Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($env:LIQI_WORKTREE_PATH) } |',
      'Select-Object ProcessId, ParentProcessId, Name, CommandLine;',
      '$items | ConvertTo-Json -Compress',
    ].join(' ');
    const result = run('powershell.exe', ['-NoProfile', '-Command', script], {
      allowFailure: true,
      env: { LIQI_WORKTREE_PATH: normalized },
    });
    if (result.status !== 0 || !String(result.stdout || '').trim()) return [];
    let parsed;
    try {
      parsed = JSON.parse(String(result.stdout).trim());
    } catch {
      return [];
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items
      .map((item) => ({
        pid: Number(item.ProcessId),
        parentPid: Number(item.ParentProcessId),
        name: item.Name,
        commandLine: item.CommandLine,
      }))
      .filter((item) => !excluded.has(item.pid));
  }

  const result = run('ps', ['-eo', 'pid=,ppid=,comm=,args='], {
    allowFailure: true,
  });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        parentPid: Number(match[2]),
        name: match[3],
        commandLine: match[4],
      };
    })
    .filter(Boolean)
    .filter(
      (item) =>
        !excluded.has(item.pid) &&
        String(item.commandLine || '')
          .toLowerCase()
          .includes(normalized),
    );
}

function terminateProcesses(processes) {
  for (const item of processes) {
    if (process.platform === 'win32') {
      run('taskkill.exe', ['/PID', String(item.pid), '/T', '/F'], {
        allowFailure: true,
      });
    } else {
      try {
        process.kill(item.pid, 'SIGTERM');
      } catch {
        // Process already exited.
      }
    }
  }
}

function cleanupWorktree(options) {
  const worktreeRoot = path.resolve(options.worktreePath);
  const { manifest } = readManifestFromWorktree(worktreeRoot);
  const primaryRoot = path.resolve(manifest.primary.root);
  const config = loadConfigWithFallback(primaryRoot, worktreeRoot);
  const activeProcesses = detectWorktreeProcesses(worktreeRoot);
  if (activeProcesses.length > 0 && !options.killProcesses) {
    fail(
      'Processes still reference this worktree. Stop them or rerun cleanup with --kill-processes.',
      activeProcesses.map(
        (item) => `${item.pid} ${item.name}: ${item.commandLine}`,
      ),
    );
  }
  if (activeProcesses.length > 0) terminateProcesses(activeProcesses);
  const archive = archiveWorktree(primaryRoot, config, manifest, options);

  git(primaryRoot, ['worktree', 'unlock', worktreeRoot], {
    allowFailure: true,
  });
  git(primaryRoot, ['worktree', 'remove', '--force', worktreeRoot], {
    stdio: options.json ? 'pipe' : 'inherit',
  });
  git(primaryRoot, ['branch', '-D', manifest.worktree.branch], {
    allowFailure: true,
  });
  git(
    primaryRoot,
    ['update-ref', '-d', manifest.snapshot.ref, manifest.snapshot.commit],
    {
      allowFailure: true,
    },
  );
  git(
    primaryRoot,
    [
      'config',
      '--unset-all',
      `branch.${manifest.worktree.branch}.liqiLocalOnly`,
    ],
    {
      allowFailure: true,
    },
  );
  git(
    primaryRoot,
    [
      'config',
      '--unset-all',
      `branch.${manifest.worktree.branch}.liqiSnapshot`,
    ],
    {
      allowFailure: true,
    },
  );
  const activeRoot = path.join(
    metadataRoot(primaryRoot, config),
    'active',
    manifest.id,
  );
  fs.rmSync(activeRoot, { recursive: true, force: true });
  git(primaryRoot, ['worktree', 'prune']);
  pruneRetention(primaryRoot, config);
  return archive;
}

function doctorWorktree(options) {
  const worktreeRoot = path.resolve(options.worktreePath || process.cwd());
  const { manifest } = readManifestFromWorktree(worktreeRoot);
  const primaryRoot = path.resolve(manifest.primary.root);
  const config = loadConfigWithFallback(primaryRoot, worktreeRoot);
  const results = {
    manifest: 'passed',
    branch: gitText(worktreeRoot, ['branch', '--show-current']),
    head: gitText(worktreeRoot, ['rev-parse', 'HEAD']),
    environment: [],
    health: runHealthChecks(worktreeRoot, config, { verbose: options.verbose }),
  };
  for (const entry of manifest.environment) {
    if (entry.status !== 'copied') continue;
    const actual = pathState(worktreeRoot, entry.path);
    results.environment.push({
      path: entry.path,
      status: actual.sha256 === entry.sha256 ? 'passed' : 'changed',
    });
  }
  return results;
}

function listManagedWorktrees(options = {}) {
  const primaryRoot = getMainWorktree(
    getRepoRoot(options.primaryRoot || process.cwd()),
  );
  const config = loadConfig(primaryRoot);
  const activeRoot = path.join(metadataRoot(primaryRoot, config), 'active');
  if (!fs.existsSync(activeRoot)) return [];
  return fs
    .readdirSync(activeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestPath = path.join(activeRoot, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) return null;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return {
        id: manifest.id,
        status: manifest.status,
        taskName: manifest.taskName,
        path: manifest.worktree.path,
        exists: fs.existsSync(manifest.worktree.path),
        createdAt: manifest.createdAt,
      };
    })
    .filter(Boolean);
}

module.exports = {
  archiveWorktree,
  assertPrimaryMatchesSnapshot,
  classifyUntracked,
  cleanupWorktree,
  createWorktree,
  detectWorktreeProcesses,
  doctorWorktree,
  expectedBaselineState,
  fail,
  getCommonGitDir,
  getMainWorktree,
  getRepoRoot,
  globToRegExp,
  listManagedWorktrees,
  loadConfig,
  loadConfigWithFallback,
  matchesAny,
  overlayWorktree,
  patchChangesDependencyLock,
  parseNameStatusZ,
  pathState,
  rollbackOverlay,
  runHealthChecks,
  safeResolve,
  sha256Buffer,
  statesEqual,
  toPosix,
};
