#!/usr/bin/env node
const path = require('node:path');
const {
  getMainWorktree,
  getRepoRoot,
  loadConfigWithFallback,
  runHealthChecks,
} = require('./worktree-lib.cjs');

try {
  const root = getRepoRoot(process.cwd());
  const primary = getMainWorktree(root);
  const config = loadConfigWithFallback(primary, root);
  const results = runHealthChecks(root, config, {
    verbose: process.argv.includes('--verbose'),
  });
  console.log(JSON.stringify({ root: path.resolve(root), results }, null, 2));
} catch (error) {
  console.error(error.message);
  for (const detail of error.details || []) console.error(detail);
  process.exitCode = 1;
}
