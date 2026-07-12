# Contributing to Liqi Match

This repository uses a deliberate two-surface development model:

- the **primary workspace** is a mutable review and integration surface;
- implementation happens in a **managed task worktree** created from an exact snapshot of that surface.

This is a repository invariant, not a per-task preference. Do not start feature work with plain `git worktree add`, a copied directory, or a new branch in the primary workspace.

## First five minutes

From any checkout, identify its role:

```bash
npm run repo:context
```

From the primary workspace, start a task:

```bash
npm run task:start -- feat/descriptive-task-name
cd ../liqi-descriptive-task-name
```

Then read the architecture map and the document for the area you own:

- [Repository architecture map](docs/architecture/README.md)
- [Mobile frontend architecture](docs/architecture/mobile-frontend.md)
- [Backend architecture](docs/architecture/backend.md)
- [Testing architecture](docs/architecture/testing.md)
- [Managed task workflow](docs/architecture/worktree-workflow.md)

## Task lifecycle

The human-facing commands are named after the task lifecycle. The `worktree:*` commands remain lower-level infrastructure aliases.

```bash
npm run task:start -- fix/chat-autofollow
npm run repo:context
npm run task:inspect
npm run task:check
npm run task:review -- C:/project/liqi-chat-autofollow
npm run task:undo -- <overlay-id>
npm run task:finish -- C:/project/liqi-chat-autofollow
```

### Start

`task:start` captures tracked changes, tracked deletions and approved untracked source from the primary workspace without moving its branch, `HEAD` or real index. It copies allowlisted local environment files separately, installs dependencies and verifies the checkout.

Managed task branches contain a local aggregate snapshot in their ancestry. They are intentionally local-only and must never be pushed.

### Implement

Keep the task worktree focused on one owned change. Follow the dependency and ownership rules in the relevant architecture document. Add or update tests beside the owning feature or service.

Commit the task patch locally in the managed worktree. The worktree must be clean before review overlay.

### Check

Run the repository definition of done:

```bash
npm run task:check
```

For a smaller loop, use the specific lane described in [testing architecture](docs/architecture/testing.md), then run the full task check before handoff.

### Review

Run review and cleanup commands from the primary workspace, not from inside the worktree being removed.

`task:review` overlays only the committed task diff into the primary review workspace. It verifies primary checksums before writing, backs up affected paths, verifies the applied bytes and runs targeted smoke checks.

Review the change in the primary workspace. Use the emitted `task:undo` command when the overlay must be reverted.

### Finish

`task:finish` archives the task manifest, patch, commit list and Git bundle before removing the worktree, local task branch and hidden snapshot ref.

Publishable commits must be created on a clean branch that does not descend from a `Liqi-Snapshot: true` commit.

## Repository invariants

- Never implement or commit feature work in the primary workspace.
- Never push a managed task branch or any `refs/liqi/*` ref.
- Never copy or junction `node_modules` between worktrees.
- Never bypass untracked-source classification by copying the repository directory.
- Never put secrets in Git-visible source or `EXPO_PUBLIC_*` variables.
- Never place product logic in Expo Router route adapters.
- Never cross feature or backend ownership boundaries through deep imports.

The Git hooks, repository contract check, architecture checks and CI enforce the high-risk parts of this agreement.

## Break-glass behavior

The primary pre-commit guard can be bypassed only for repository recovery with:

```bash
LIQI_ALLOW_PRIMARY_COMMIT=1 git commit ...
```

A normal feature, fix or refactor is not a recovery event. Prefer creating a managed task worktree or a separate clean publishable worktree instead.
