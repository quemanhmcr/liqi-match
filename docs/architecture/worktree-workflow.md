# Worktree Toolbox and Decision Guide

Liqi Match includes managed worktree tooling because local development sometimes involves several concurrent changes, native dependencies and expensive recovery. The tooling is an option for those situations, not a requirement that every developer solve every task the same way.

## Start with the problem

Before choosing a Git workflow, ask:

- Is another developer or process changing nearby files?
- Does the task need a directly publishable branch?
- Would an exact local snapshot or automatic recovery archive be valuable?
- Is the current primary state understood and attributable?
- How expensive would it be to recreate the environment or resolve accidental mixing?

Choose the lightest approach that answers those risks.

## Available approaches

| Approach              | Works well when                                                                      | Trade-offs                                                                    |
| --------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Managed task worktree | Parallel, risky or long-running local work; exact snapshot and rollback are valuable | Local snapshot ancestry is not publishable; bootstrap and cleanup are heavier |
| Normal Git worktree   | Small or medium task from a clean remote baseline; branch may become the PR directly | No Liqi manifest, overlay guard or automatic recovery bundle                  |
| Separate clone        | Strong process/environment isolation is more important than disk usage               | Slower setup and duplicated repository metadata                               |
| Primary workspace     | Reading, diagnostics, smoke testing and temporary review                             | Normal commits are blocked; long-lived mixed WIP makes ownership unclear      |

## Primary as a useful default

A clean primary near `origin/main` is convenient because `git status` remains meaningful and new work has an obvious reference point.

```bash
git fetch --prune origin
git status --short --branch
git reset --hard origin/main
```

This sequence is appropriate only after local changes are understood. A dirty primary is not automatically wrong: it may be an intentional review, diagnostic experiment or interrupted recovery. Preserve unknown work before resetting or cleaning it.

Preview untracked cleanup first:

```bash
git clean -nd
```

## Managed task worktrees

Create one when the additional safety is worth the ceremony:

```bash
npm run task:start -- fix/chat-autofollow
```

The helper currently:

1. classifies non-ignored untracked paths through `worktree.config.json`;
2. writes an exact snapshot using a temporary Git index;
3. leaves primary branch, `HEAD` and real index untouched;
4. creates a locked local branch and linked worktree;
5. copies allowlisted environment files outside Git objects;
6. installs and checks an independent dependency tree;
7. stores manifests in the worktree and shared Git metadata.

Inspect or list managed worktrees with:

```bash
npm run task:inspect -- C:/project/liqi-chat-autofollow
npm run task:list
```

The managed branch includes a `Liqi-Snapshot: true` ancestor. That is a technical property, not a judgment about the quality of the task. The pre-push hook blocks the branch because aggregate local snapshot history should not become remote project history.

## Normal Git worktrees

A normal worktree is often simpler when the baseline is clean and the branch is intended to be publishable:

```bash
git fetch origin
git worktree add ../liqi-small-fix -b fix/small-fix origin/main
```

The developer is responsible for dependency setup, untracked files, recovery and cleanup. This is a valid trade-off for straightforward work.

## When `main` advances

There is no single correct response. Depending on task size and conflict risk, a developer may:

- rebase a normal branch;
- merge current `origin/main` into a publishable branch;
- create a fresh worktree and transplant the owned commits or patch;
- continue isolated implementation temporarily, then refresh before handoff.

Managed overlay metadata intentionally refuses to write when primary `HEAD` no longer matches its original snapshot. Rather than making primary stale, use a fresh baseline or review the patch by another method.

## Review options

A primary overlay is one review tool, not the definition of review.

```bash
npm run task:review -- C:/project/liqi-chat-autofollow
```

It requires a clean managed task, verifies branch/`HEAD` and path checksums, backs up affected paths, applies the task diff byte-for-byte, runs configured smoke checks and emits a guarded rollback id.

```bash
npm run task:undo -- <overlay-id>
```

Other valid review approaches include:

- reading the branch diff;
- opening a draft pull request from a clean publishable branch;
- running the task worktree directly on a device;
- creating a temporary normal integration worktree;
- pairing with the task owner.

Choose the review surface that reveals the relevant risks.

## Cleanup and recovery

Managed cleanup can archive and remove a task:

```bash
npm run task:finish -- C:/project/liqi-chat-autofollow
```

A dirty managed worktree is rejected by default. `--force` archives committed and uncommitted state before removal; `--kill-processes` deliberately stops known processes that still reference the path.

When any workspace contains unexpected state:

1. inventory tracked, deleted and untracked paths;
2. identify likely owners and active processes;
3. create a Git bundle, snapshot or filesystem archive;
4. verify that the important state is recoverable;
5. only then reset, clean or remove the workspace.

This sequence is more important than which worktree command created the checkout.

## Tool behavior versus team judgment

The managed implementation has strict internal guarantees because snapshotting and rollback need deterministic behavior. Those implementation guarantees should not be confused with a requirement that every contributor use the managed lifecycle.

Tool-enforced boundaries currently include:

- managed snapshot branches cannot be pushed;
- direct pushes to `main` are blocked;
- primary commits require an explicit recovery override;
- overlay and rollback stop when checksums no longer match;
- unclassified source stops managed snapshot creation.

Everything else in this guide is decision support. Developers are expected to understand the task, choose an appropriate workflow and explain unusual trade-offs.

## Dependency note

Each checkout should have a dependency tree consistent with its lockfile. The managed helper uses a clean verified install. Avoid copying or junctioning `node_modules` between worktrees because existence does not prove compatibility.

## Maintainer verification

The workflow self-test covers snapshot capture, untracked classification, environment copy, push protection, concurrent-change rejection, exact overlay, guarded rollback and cleanup archives:

```bash
npm run worktree:self-test
```

## References

- [Git worktree documentation](https://git-scm.com/docs/git-worktree)
- [Git commit-tree documentation](https://git-scm.com/docs/git-commit-tree)
- [Git update-ref documentation](https://git-scm.com/docs/git-update-ref)
- [npm ci documentation](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
