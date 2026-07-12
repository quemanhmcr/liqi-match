# Managed task workflow internals

This directory implements the repository's deterministic task-worktree transaction. Most contributors should use the lifecycle commands exposed in `package.json`:

```bash
npm run task:start -- <branch>
npm run task:inspect
npm run task:review -- <worktree-path>
npm run task:undo -- <overlay-id>
npm run task:finish -- <worktree-path>
```

## Invariants for maintainers

- Primary `HEAD`, branch and real index are never moved while creating a snapshot.
- Ignored environment files are copied separately and never enter Git objects.
- Untracked source is fail-closed through `worktree.config.json`.
- A task overlay is an explicit, backed-up and checksum-verified transaction.
- Concurrent primary edits on task-owned paths stop the overlay or rollback.
- Managed snapshot ancestry is local-only and blocked by the pre-push hook.
- Cleanup archives enough information to recover the task after deleting its worktree.

## Extending the workflow

Update all of these surfaces in the same change:

1. implementation in `worktree-lib.cjs` or `worktree-cli.cjs`;
2. regression coverage in `self-test.cjs`;
3. configuration schema or defaults in `worktree.config.json`;
4. operating documentation in `docs/architecture/worktree-workflow.md`;
5. repository contract assertions in `scripts/check-repository-contract.cjs` when a discoverability invariant changes.

Do not add a shortcut that creates an unverified checkout, shares `node_modules`, writes to primary before conflict checks, or makes snapshot branches publishable.
