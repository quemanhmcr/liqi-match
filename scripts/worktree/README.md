# Managed task workflow internals

This directory implements the optional deterministic task-worktree transaction. Contributors can use these commands when snapshotting, overlay review and automatic recovery add value:

```bash
npm run task:start -- <branch>
npm run task:inspect
npm run task:review -- <worktree-path>
npm run task:undo -- <overlay-id>
npm run task:finish -- <worktree-path>
```

## Implementation guarantees for maintainers

- Primary `HEAD`, branch and real index are never moved while creating a snapshot.
- Ignored environment files are copied separately and never enter Git objects.
- Untracked source is fail-closed through `worktree.config.json`.
- A task overlay is an explicit, backed-up and checksum-verified transaction with a guarded restoration path.
- Concurrent primary edits on task-owned paths stop the overlay or rollback.
- Managed snapshot ancestry is local-only and blocked by the pre-push hook.
- Cleanup archives enough information to recover the task after deleting its worktree.

## Maintainer checklist

When changing the managed helper, review these connected surfaces so behavior and discoverability do not drift:

1. implementation in `worktree-lib.cjs` or `worktree-cli.cjs`;
2. regression coverage in `self-test.cjs`;
3. configuration schema or defaults in `worktree.config.json`;
4. operating documentation in `docs/architecture/worktree-workflow.md`;
5. repository entry-point checks in `scripts/check-repository-contract.cjs` when discoverability expectations change.

Changes to this implementation should preserve data-loss protection: avoid unverified writes, shared `node_modules`, writes before conflict checks or publishable snapshot ancestry. This constrains the managed tool, not the developer's choice to use a normal Git worktree.
