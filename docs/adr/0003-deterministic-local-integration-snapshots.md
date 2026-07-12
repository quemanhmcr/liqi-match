# ADR 0003: Deterministic Local Integration Snapshots

## Status

Accepted.

## Context

The primary workspace is a shared local review surface. Its source of truth can be newer than Git `HEAD` and may contain tracked modifications, tracked deletions and new untracked source. Creating a normal worktree from the branch therefore recreates the old committed tree rather than the project under review.

Manual directory mirroring is unsafe because it must infer source versus artifact, can miss deletions, can copy secrets or generated native folders and has no built-in concurrent-change or rollback contract.

Creating an ordinary checkpoint commit on the primary branch would make the state reproducible, but it would also move branch history, blur ownership between multiple WIP streams and create a risk that aggregate local work is pushed.

## Decision

Create each task baseline with Git plumbing and a separate temporary index:

1. seed the temporary index from primary `HEAD`;
2. add all tracked working-tree changes and explicitly allowed untracked source;
3. remove denylisted untracked artifacts from the temporary index;
4. write a tree and local commit with `git commit-tree`;
5. store it under `refs/liqi/snapshots/*` with `git update-ref`;
6. create the task branch and linked worktree from that commit;
7. mark the branch local-only and block pushes through the repository hook.

The real primary index, branch and `HEAD` remain untouched.

Ignored environment files are copied separately from an allowlist and are never placed in the snapshot commit. Dependencies are installed independently and verified.

Task integration into the primary review workspace uses a guarded overlay rather than merge or cherry-pick:

- diff snapshot commit to clean task `HEAD`;
- verify primary task paths still match the snapshot manifest;
- back up current primary paths;
- repeat the guard immediately before writing;
- apply additions, modifications, deletions and renames exactly;
- verify checksums and run targeted smoke checks;
- retain a guarded one-command rollback.

Cleanup archives a Git bundle and binary patch before removing the worktree, task branch and snapshot ref.

## Consequences

### Positive

- New worktrees reproduce tracked changes, deletions, renames and allowed untracked source exactly.
- Primary review can remain a shared mutable workspace.
- Snapshot creation does not alter the primary branch or index.
- Source classification is repository policy rather than per-developer judgment.
- Environment secrets stay outside Git objects.
- Concurrent edits on task paths stop overlay before any write.
- Rollback and cleanup are explicit, verifiable operations.
- Local aggregate snapshot ancestry cannot be pushed accidentally.

### Trade-offs

- Task branches created by this workflow are not publishable directly.
- Hidden snapshot commits retain aggregate source locally until cleanup.
- npm dependency bootstrap remains slower than Git source snapshotting.
- A primary `HEAD` or branch change invalidates existing snapshot overlays and requires a new task snapshot.
- Worktree tooling is repository infrastructure and therefore has its own integration self-test and CI gate.

## Package manager follow-up

Keep npm as the default until a separate pnpm pilot validates Expo SDK, native development builds, config plugins, `patch-package`, Jest, EAS and CI. The workflow configuration can switch install commands later without changing snapshot or overlay semantics.

## References

- <https://git-scm.com/docs/git-worktree>
- <https://git-scm.com/docs/git-commit-tree>
- <https://git-scm.com/docs/git-update-ref>
- <https://git-scm.com/docs/git-read-tree>
- <https://docs.npmjs.com/cli/v11/commands/npm-ci/>
- <https://pnpm.io/motivation>
