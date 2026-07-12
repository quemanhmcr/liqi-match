# Deterministic Worktree and Primary Review Workflow

The primary workspace is a shared review and integration surface. Its working tree can contain tracked modifications, tracked deletions and untracked source that are newer than `HEAD`. A normal `git worktree add` therefore cannot reproduce the project currently under review.

This workflow packages that mutable source state into a local Git snapshot without moving the primary branch, changing the primary index or committing environment secrets.

## Mental model

The workflow has four separate layers:

1. **Source snapshot**: Git-visible source is captured through a temporary index, a local commit object and a hidden `refs/liqi/snapshots/*` ref.
2. **Environment bootstrap**: ignored local files such as `.env.local` are copied from an explicit allowlist and checksummed outside the snapshot commit.
3. **Dependency bootstrap**: each worktree receives a clean, verified dependency tree. A pre-existing `node_modules` directory is never considered proof that dependencies are valid.
4. **Primary overlay transaction**: only the committed task diff is applied to the primary review workspace after checksum guards, backup and a second concurrent-change check.

Task branches created by this workflow are local-only. They contain the aggregate local snapshot in their ancestry and must not be pushed. The repository pre-push hook blocks both the branch marker and the snapshot commit trailer.

## Create a task worktree

From the primary workspace:

```bash
npm run worktree:create -- fix/chat-autofollow
```

The command:

1. validates every untracked, non-ignored path against `worktree.config.json`;
2. creates a temporary Git index seeded from primary `HEAD`;
3. captures tracked modifications, deletions, renames and allowed untracked source;
4. creates a hidden local snapshot commit and ref without changing primary `HEAD` or its real index;
5. creates and locks the task worktree and local-only branch;
6. copies allowlisted environment files without adding them to Git objects;
7. runs the configured dependency install;
8. validates package resolution, TypeScript config, Jest config and Expo config;
9. writes the same manifest to the worktree and the shared Git metadata directory.

Default worktree paths use the final branch segment:

```text
fix/chat-autofollow -> ../liqi-chat-autofollow
```

Use an explicit path when needed:

```bash
npm run worktree:create -- fix/chat-autofollow --path C:/project/liqi-chat-autofollow-v2
```

For source-only diagnostics, dependency installation and health checks can be skipped explicitly:

```bash
npm run worktree:create -- chore/worktree-probe --skip-install --skip-health
```

A normal development worktree should use the default full bootstrap.

## Untracked source policy

Tracked files are always represented exactly, including deletions. Untracked files use a fail-closed policy:

- paths matching `source.allow` are included;
- paths matching `source.deny` are excluded;
- an untracked path matching neither list stops creation;
- oversized untracked files stop creation unless the configured limit is updated deliberately.

Repository `.gitignore` remains the first artifact boundary. The workflow config is the explicit second boundary for non-ignored files.

When a new source root is introduced, update `worktree.config.json` in the same architectural change. Do not bypass classification by copying the primary directory manually.

## Manifest and health

The manifest records:

- primary branch and `HEAD`;
- snapshot commit, tree and hidden ref;
- task branch and worktree path;
- SHA-256 for every checked-out source file;
- Git blob, mode and size metadata;
- tracked deletions from primary `HEAD`;
- included, excluded and oversized untracked paths;
- environment checksums;
- dependency and health-check results;
- source-ready and total bootstrap timings.

Inspect a worktree:

```bash
npm run worktree:doctor -- C:/project/liqi-chat-autofollow
```

List managed worktrees:

```bash
npm run worktree:list
```

## Commit task changes locally

Develop and commit only the task patch in the managed worktree. The snapshot commit is already the branch baseline.

Before overlay, the task worktree must be clean:

```bash
git status --short
```

Do not push this branch. After primary review, publishable commits must be created on a clean branch that does not contain a `Liqi-Snapshot: true` ancestor.

## Overlay into primary review

Run from any workspace:

```bash
npm run worktree:overlay -- C:/project/liqi-chat-autofollow
```

The command:

1. requires a clean managed task worktree;
2. computes the exact diff from snapshot commit to task `HEAD`;
3. expands renames into explicit old-path deletion and new-path write operations;
4. compares every task path in primary against its snapshot SHA-256;
5. stops before writing if primary `HEAD`, branch or any task path changed;
6. backs up the current primary state under Git common metadata;
7. repeats the checksum guard immediately before applying;
8. applies task files byte-for-byte, including additions and deletions;
9. verifies every resulting checksum;
10. if a configured lockfile changed, performs a clean dependency bootstrap on primary;
11. runs worktree health, test policy and related tests for changed source files;
12. emits a rollback command.

A smoke failure leaves the verified overlay in place for inspection and prints the rollback command. An apply or checksum failure rolls back automatically.

Skip smoke only for workflow diagnostics:

```bash
npm run worktree:overlay -- C:/project/liqi-chat-autofollow --skip-smoke
```

## Roll back an overlay

Each overlay prints an id and command:

```bash
npm run worktree:rollback -- overlay-20260712T030028Z-595195
```

Rollback is guarded too. It proceeds only when primary paths still match the state written by that overlay. If another developer changed one of those files after overlay, rollback stops rather than overwriting newer work.

When the overlay changed a dependency lockfile, rollback also reinstalls the dependency tree from the restored lockfile before reporting success.

Backups and overlay manifests are retained according to `worktree.config.json`.

## Cleanup

After review and handoff:

```bash
npm run worktree:cleanup -- C:/project/liqi-chat-autofollow
```

Cleanup:

1. checks for processes whose command lines still reference the worktree;
2. archives the manifest, commit list, binary patch and Git bundle;
3. removes the linked worktree and its dependency/cache directories;
4. deletes the local task branch and hidden snapshot ref;
5. removes branch-local workflow markers;
6. prunes stale Git worktree metadata and expired archives.

If Node, Expo, Jest, Java or Gradle processes still reference the worktree, stop them first. Deliberate termination is available with:

```bash
npm run worktree:cleanup -- C:/project/liqi-chat-autofollow --kill-processes
```

A dirty worktree is rejected by default. To archive committed and uncommitted state before forced cleanup:

```bash
npm run worktree:cleanup -- C:/project/liqi-chat-autofollow --force
```

## Dependency strategy

The current production default remains:

```bash
npm ci --prefer-offline --no-audit --no-fund
```

This is slower than source snapshotting but deterministic: it validates `package.json` against `package-lock.json`, removes any existing dependency tree and performs a frozen install. Global npm cache is shared automatically.

Do not copy or junction `node_modules` between worktrees. A directory that merely exists can be incomplete or based on a different lockfile.

The workflow is package-manager aware through config so pnpm can be piloted later. A pnpm migration must separately prove Expo SDK, development builds, config plugins, `patch-package`, Jest, EAS and CI behavior. Its content-addressable store is attractive for many concurrent worktrees, but package-manager migration is not coupled to source snapshot safety.

## Performance targets

Measure source and dependency phases separately:

- source snapshot, checkout, manifest and env bootstrap: under 5 seconds for the current repository;
- source-equivalent checksum: mandatory before the worktree is reported ready;
- related tests: runnable immediately after dependency health passes;
- full ready time with npm: recorded, not hidden; optimize through npm cache or a separately validated package-manager migration;
- overlay conflict detection: before any primary write;
- rollback: one command and checksum verified;
- cleanup: leaves no managed worktree, local task branch or snapshot ref.

The create manifest stores actual timings so package-manager decisions can use repository measurements rather than assumptions.

## Workflow regression test

The CI self-test creates a temporary repository and verifies:

- tracked modification capture;
- tracked deletion capture;
- allowed untracked source capture;
- ignored artifact exclusion;
- environment copy;
- local-only pre-push blocking;
- concurrent primary edit rejection;
- exact add, modify, delete and rename overlay;
- unrelated primary state preservation;
- guarded rollback;
- archive, branch, ref and worktree cleanup.

Run it locally:

```bash
npm run worktree:self-test
```

## References

- [Git worktree documentation](https://git-scm.com/docs/git-worktree)
- [Git commit-tree documentation](https://git-scm.com/docs/git-commit-tree)
- [Git update-ref documentation](https://git-scm.com/docs/git-update-ref)
- [Git read-tree documentation](https://git-scm.com/docs/git-read-tree)
- [npm ci documentation](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- [pnpm motivation and content-addressable store](https://pnpm.io/motivation)
