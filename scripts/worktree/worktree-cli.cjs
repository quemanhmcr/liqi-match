#!/usr/bin/env node
const path = require('node:path');
const {
  cleanupWorktree,
  createWorktree,
  doctorWorktree,
  listManagedWorktrees,
  overlayWorktree,
  rollbackOverlay,
} = require('./worktree-lib.cjs');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const [name, inline] = value.slice(2).split('=', 2);
    if (inline !== undefined) {
      flags[name] = inline;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--') && ['path', 'primary'].includes(name)) {
      flags[name] = next;
      index += 1;
    } else {
      flags[name] = true;
    }
  }
  return { positional, flags };
}

function printResult(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(value);
}

function usage() {
  console.log(`Liqi deterministic worktree workflow

Commands:
  create <branch> [--path <absolute-path>] [--skip-install] [--skip-health]
  overlay <worktree-path> [--skip-smoke]
  rollback <overlay-id>
  cleanup <worktree-path> [--force] [--kill-processes]
  doctor [worktree-path]
  list

Common flags:
  --primary <path>  Explicit main worktree path
  --verbose         Stream health/smoke command output
  --json            Machine-readable output`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const common = {
    primaryRoot: flags.primary ? path.resolve(flags.primary) : undefined,
    verbose: Boolean(flags.verbose),
    json: Boolean(flags.json),
  };
  let result;

  switch (command) {
    case 'create': {
      result = createWorktree({
        ...common,
        taskName: positional[0],
        worktreePath: flags.path ? path.resolve(flags.path) : undefined,
        skipInstall: Boolean(flags['skip-install']),
        skipHealth: Boolean(flags['skip-health']),
      });
      if (flags.json) return printResult(result, true);
      console.log(`Worktree ready: ${result.worktree.path}`);
      console.log(`Branch: ${result.worktree.branch}`);
      console.log(`Snapshot: ${result.snapshot.commit}`);
      console.log(`Source files: ${result.source.fileCount}`);
      console.log(`Source ready: ${result.timingsMs.sourceReady} ms`);
      console.log(`Total: ${result.timingsMs.total} ms`);
      console.log(`Next: cd ${result.worktree.path}`);
      return;
    }
    case 'overlay': {
      if (!positional[0])
        throw new Error('overlay requires a managed worktree path.');
      result = overlayWorktree({
        ...common,
        worktreePath: path.resolve(positional[0]),
        skipSmoke: Boolean(flags['skip-smoke']),
      });
      if (flags.json) return printResult(result, true);
      console.log(`Overlay ${result.id}: ${result.status}`);
      console.log(`Changed paths: ${result.operations.allPaths.length}`);
      console.log(`Rollback: ${result.rollbackCommand}`);
      return;
    }
    case 'rollback': {
      if (!positional[0]) throw new Error('rollback requires an overlay id.');
      result = rollbackOverlay({ ...common, overlayId: positional[0] });
      if (flags.json) return printResult(result, true);
      console.log(`Overlay ${result.id} rolled back and verified.`);
      return;
    }
    case 'cleanup': {
      if (!positional[0])
        throw new Error('cleanup requires a managed worktree path.');
      result = cleanupWorktree({
        ...common,
        worktreePath: path.resolve(positional[0]),
        force: Boolean(flags.force),
        killProcesses: Boolean(flags['kill-processes']),
      });
      if (flags.json) return printResult(result, true);
      console.log(`Worktree removed. Archive: ${result.archiveRoot}`);
      console.log(`Bundle: ${result.bundlePath}`);
      return;
    }
    case 'doctor': {
      result = doctorWorktree({
        ...common,
        worktreePath: positional[0]
          ? path.resolve(positional[0])
          : process.cwd(),
      });
      return printResult(result, true);
    }
    case 'list': {
      result = listManagedWorktrees(common);
      return printResult(result, true);
    }
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      usage();
      return;
    default:
      usage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`\nWorktree workflow failed: ${error.message}`);
  for (const detail of error.details || []) console.error(`  ${detail}`);
  process.exitCode = 1;
});
