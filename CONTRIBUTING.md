# Contributing to Liqi Match

This guide describes approaches that have worked well in this repository. It is a reference for making trade-offs, not a substitute for understanding the task.

## Engineering principles

Prefer workflows that keep changes:

- attributable to an owner;
- easy to review and test;
- recoverable before destructive Git operations;
- isolated from unrelated WIP;
- free of secrets and generated artifacts.

These principles matter more than following one exact command sequence.

## Choose a checkout strategy

Start by inspecting the checkout:

```bash
npm run repo:context
```

Then choose the simplest option that fits the work.

### Managed task worktree

Useful for parallel, risky or long-running local tasks, especially when exact snapshotting, isolated dependencies, review overlays and automatic archives are valuable.

```bash
npm run task:start -- feat/descriptive-task-name
cd ../liqi-descriptive-task-name
```

Managed branches include local snapshot ancestry. The pre-push hook blocks them because they are not publishable history; move the owned patch to a clean branch before pushing.

### Normal Git branch or worktree

Often preferable for a small change, an already-clean baseline or a branch intended to become a pull request directly.

```bash
git fetch origin
git worktree add ../liqi-small-fix -b fix/small-fix origin/main
```

A normal worktree does not provide Liqi snapshot manifests, overlay rollback or automatic cleanup archives, so the developer owns those decisions.

### Primary workspace

Primary is commonly kept close to `origin/main` for navigation, smoke testing and temporary review. The pre-commit hook blocks normal commits there, which keeps commit-ready work in another checkout. Temporary local edits are acceptable when their purpose and recovery path are understood.

Before a destructive reset or clean, inspect and preserve unexpected state.

## Use the task tools selectively

The `task:*` commands form a complete workflow, but each command is also a tool that can be used when it adds value:

```bash
npm run task:inspect
npm run task:list
npm run task:check
npm run task:review -- C:/project/liqi-chat-autofollow
npm run task:undo -- <overlay-id>
npm run task:finish -- C:/project/liqi-chat-autofollow
```

- `task:inspect` explains a managed checkout and validates its manifest.
- `task:check` runs the broad repository quality suite.
- `task:review` creates an optional checksum-verified primary overlay.
- `task:undo` restores an overlay when its guarded checks still match.
- `task:finish` archives and removes a managed task when it is no longer needed.

A pull-request review, branch diff or device smoke test may be more appropriate than a primary overlay. Use judgment.

## Architecture and tests

Read the architecture map and the document nearest to the code you are changing:

- [Repository architecture map](docs/architecture/README.md)
- [Mobile frontend architecture](docs/architecture/mobile-frontend.md)
- [Backend architecture](docs/architecture/backend.md)
- [Testing architecture](docs/architecture/testing.md)
- [Worktree toolbox](docs/architecture/worktree-workflow.md)

Architecture documents describe the current design and reasons behind it. When a task exposes a better design, explain the trade-off and update the relevant code, checks and documentation together.

Run checks proportional to the change during development, then use the broader suite before handoff when practical:

```bash
npm run task:check
```

## Tool-enforced safety boundaries

A few constraints are intentionally harder because violating them can corrupt history, leak secrets or destroy work:

- managed branches containing `Liqi-Snapshot: true` ancestry cannot be pushed;
- direct pushes to `main` are blocked;
- primary commits are blocked unless the recovery override is deliberately set;
- secrets, credentials and private keys do not belong in Git-visible source or `EXPO_PUBLIC_*` variables;
- unknown local state should be archived before destructive reset or cleanup;
- `node_modules` should not be copied or junctioned between worktrees because it can silently mismatch the lockfile.

The primary commit guard has a recovery override:

```bash
LIQI_ALLOW_PRIMARY_COMMIT=1 git commit ...
```

Use it only when the developer understands why the normal guard is inappropriate for that recovery operation.
