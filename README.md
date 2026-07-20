# Liqi Match

Liqi Match is an Expo SDK 56 React Native application with an Expo Router mobile client, Supabase Edge Functions and a Cloudflare media worker. The repository supports parallel development through explicit ownership boundaries, normal Git workflows and optional deterministic worktree helpers.

## Start here

Liqi Match supports several Git working styles. The repository tools are there to make common operations safer and more reproducible, not to replace engineering judgment.

```bash
npm run repo:context
```

For every mobile UI task, read the [LiQi UI contract](DESIGN.md) before copying nearby page code. Start a new page through the canonical scaffold:

```bash
npm run design:new-screen -- <feature> <PascalCaseName>
npm run design-system:check
```

The repository freezes pre-governance UI by checksum: new visual debt fails immediately, and materially edited legacy UI must migrate to the Home- and Messages-derived shared UI language instead of extending the previous page style.

This command reports what kind of checkout you are in and which tools are available. A typical setup has:

- a **primary workspace**, usually kept near the latest `origin/main` for reading, smoke testing and temporary review;
- a **managed task worktree**, useful when a task benefits from an exact snapshot, isolated dependencies, guarded overlay and automatic recovery archive;
- a **normal branch or Git worktree**, often simpler for small changes or for creating publishable commits.

Choose the lightest workflow that preserves ownership, reviewability and recovery. For parallel, risky or long-running local work, the managed helper is a strong default:

```bash
npm run task:start -- feat/descriptive-task-name
```

For a small change, a normal clean branch/worktree from current `origin/main` is also reasonable. Avoid placing commit-ready implementation directly in primary because the committed hook intentionally blocks primary commits.

## Requirements

- Node.js 24 LTS. `.nvmrc` contains `24`, and `package.json` enforces `>=24 <25`.
- npm 11 or newer.
- Android Studio for local Android development builds.
- macOS with Xcode for local iOS development builds.
- Supabase CLI and Docker only when working on local Supabase services.

## First-time setup

Install the exact dependency graph recorded in `package-lock.json`, create local environment configuration and enable the committed Git hooks:

```bash
npm ci
cp .env.example .env.local
npm run repo:setup
```

Then confirm the checkout role and health:

```bash
npm run repo:context
```

Use `npm ci`, not `npm install`, for a clean checkout. It keeps local dependency installation aligned with CI and avoids incidental lockfile updates.

The committed hooks block commits in the primary review workspace, direct pushes to `main`, pushes of managed local snapshot branches and pushes of `refs/liqi/*`. CI remains the final enforcement layer.

## Primary workspace guidance

Keeping primary clean and close to `origin/main` makes its Git status useful and gives new tasks a predictable reference point. Treat this as the preferred default rather than a ritual to perform blindly.

A normal refresh looks like:

```bash
git fetch --prune origin
git status --short --branch
git reset --hard origin/main
```

Before resetting, understand any local changes and preserve work that has an owner. Preview destructive cleanup with `git clean -nd`; do not use `git clean -fd` on unknown files.

Primary can be temporarily dirty for review, diagnostics or recovery. The important question is whether the state is intentional, attributable and recoverable. A managed `task:review` overlay provides a checksum-guarded rollback command:

```bash
npm run task:undo -- <overlay-id>
```

When `main` advances during an active task, developers can choose the integration strategy that best fits the change: rebase a normal branch, transplant the owned patch to a fresh worktree, or recreate a managed task baseline. Do not move mixed WIP back into primary merely to satisfy an old snapshot.

## Managed task workflow example

### 1. Start an isolated task

Use a descriptive Conventional Commit-style branch name such as `feat/...`, `fix/...`, `refactor/...` or `docs/...`:

```bash
npm run task:start -- fix/chat-autofollow
```

The command snapshots the current Git-visible source, copies allowlisted local environment files separately, installs dependencies and validates the new worktree. It is most useful when exact local reproducibility and recovery matter. Inspect unexpected primary changes before using them as a task baseline.

### 2. Implement in the task worktree

```bash
cd C:/project/liqi-chat-autofollow
npm run repo:context
npm run task:inspect
```

Read the architecture document for the area you own, keep the change focused and colocate tests with the owning feature or service. Commit only the task patch locally:

```bash
git add -A
git commit -m "fix: keep chat pinned to new messages"
```

Managed task branches contain local aggregate snapshot ancestry. **They are local-only and must not be pushed.**

### 3. Run the definition of done

```bash
npm run task:check
```

This runs the repository entry-point check, formatting, frontend and backend architecture checks, dependency audit, lint, TypeScript and the complete unit/native Jest suite.

Run additional area-specific checks when the task changes those surfaces:

```bash
# Expo/native configuration or dependency changes
npx expo-doctor
npx expo config

# Cloudflare media worker changes
npm run cloudflare:media:typecheck
npm run cloudflare:media:test
npm run cloudflare:media:dry-run

# Supabase schema or Edge Function changes
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:types
```

### 4. Optionally review through primary

After the task worktree is clean and its patch is committed, return to the primary workspace:

```bash
npm run task:review -- C:/project/liqi-chat-autofollow
```

The optional review transaction verifies primary checksums before writing, backs up affected paths, applies the committed task diff byte-for-byte, verifies the result and runs targeted smoke checks. It prints a guarded rollback command such as:

```bash
npm run task:undo -- <overlay-id>
```

### 5. Restore or clean up when useful

After an overlay review, the emitted `task:undo` command is the safest way to restore the prior primary state. When a managed worktree is no longer useful:

```bash
npm run task:finish -- C:/project/liqi-chat-autofollow
```

Cleanup archives the manifest, patch, commit list and Git bundle before removing the managed worktree, local task branch and hidden snapshot ref.

See [the worktree toolbox and decision guide](docs/architecture/worktree-workflow.md) for choosing between managed and normal worktrees, plus snapshot, rollback and recovery details.

## Daily development commands

```bash
npm run start                 # Start Metro for an installed development client
npm run start:clear           # Start Metro with a cleared cache
npm run dev:android           # Boot/use the configured emulator, build and launch
npm run dev:android:cold      # Cold-boot a stale or black-screen emulator
npm run dev:android:rebuild   # Rebuild the Android development client
npm run ios                   # Build and run iOS on macOS
npm run web                   # Start the web target
```

The default Windows emulator is `LiqiMatch_Pixel_8`. Override it for the current shell with `ANDROID_AVD_NAME`. For Android setup and recovery procedures, use the [Android development-client runbook](docs/android-dev-client-runbook.md).

This project uses `expo-dev-client`; Expo Go is not the production development workflow because native modules and store-ready configuration must be validated in development builds.

## Environment and secrets

Local mobile configuration belongs in `.env.local`, created from one of the checked-in examples. `.env.example` is a **local simulation** template; `.env.staging.example` is the **real staging API** template. Do not mix values from those two modes.

`EXPO_PUBLIC_*` values are embedded in the client bundle and are readable by users. Never put secrets, service-role keys, access keys, private tokens or credentials in those variables. Server-only values belong in Supabase secrets, Cloudflare secrets or CI secret stores.

### Runtime and backend authority contract

`APP_VARIANT` controls the installed application identity. `EXPO_PUBLIC_APPLICATION_RUNTIME_MODE` independently controls which application services the client constructs:

| Purpose                            | Runtime mode      | Supabase target                               | Evidence it may support                             |
| ---------------------------------- | ----------------- | --------------------------------------------- | --------------------------------------------------- |
| Deterministic local UI/domain work | `simulation`      | local Supabase only (`localhost`/`127.0.0.1`) | simulation and component evidence only              |
| Staging device/API work            | `api`             | `liqi-match-staging` (`wngumhizuxtlhavbpxzy`) | staging behavior and persisted staging records      |
| Disposable cloud database proof    | test harness only | E2E project (`ibprkyemsuktfrdpxvza`)          | isolated SQL/RPC proof only; never a mobile runtime |
| Production                         | `api`             | explicitly approved production project        | production release evidence only                    |

The client rejects `simulation` with a remote Supabase URL and rejects `api` with the development placeholder key. Keep that fail-closed behavior. A successful Supabase login proves only that Auth is reachable; it does **not** prove Profile, Match, Conversation or Party/Session services are using the same project.

A backend connection may be claimed only when all of these are recorded for the same environment:

1. the bundle resolves `runtimeMode=api` and the expected sanitized Supabase project ref;
2. local/remote migration history is at parity and no deployed migration was renamed or silently rewritten;
3. every client RPC exists with the exact parameter signature, grants and private dependencies expected by the client;
4. required rollout flags are enabled, with emergency stops in the intended state;
5. an authenticated smoke flow reads Profile and performs the relevant command through the real RPC;
6. the resulting record is observed in that same database, or the smoke is explicitly rollback-only;
7. the app is fully reloaded after changing any `EXPO_PUBLIC_*` value. Fast Refresh is not sufficient because the service composition and query cache may already exist.

Use the [mobile/backend environment parity runbook](docs/runbooks/mobile-backend-environment-parity.md) before calling a staging or production integration complete. The [disposable Party/Session E2E runbook](docs/runbooks/mobile-party-session-review.md) is test-harness-only and must never configure the mobile runtime.

`APP_VARIANT` selects application identity:

| Variant       | Display name       | Application ID                     |
| ------------- | ------------------ | ---------------------------------- |
| `development` | Liqi Match Dev     | `com.quemanhmcr.liqimatch.dev`     |
| `preview`     | Liqi Match Preview | `com.quemanhmcr.liqimatch.preview` |
| `production`  | Liqi Match         | `com.quemanhmcr.liqimatch`         |

Treat application IDs as stable once a corresponding store application exists.

## Architecture and ownership

- `src/app`: Expo Router route adapters and layouts only; no screen UI or service logic.
- `src/app-shell`: provider composition, access policy, route policy and the primary-tab contract.
- `src/features`: independently owned product domains exposed through public APIs.
- `src/entities`: product concepts shared by more than one feature.
- `src/shared`: reusable components, configuration, hooks, services, types and utilities.
- `src/test`: shared test setup and provider helpers only; tests live beside their owner.
- `supabase/functions`: thin Edge Function adapters, endpoint-owned handlers and a layered shared kernel.
- `cloudflare/media-worker`: domain, application, infrastructure, transport and composition layers.

The `@/*` alias maps to `src/*` in TypeScript and Jest. Automated architecture checks reject forbidden dependency directions and deep cross-feature imports.

## Native generation policy

Continuous Native Generation is the repository policy:

- Do not commit `ios/` or `android/`.
- Do not manually edit generated native projects.
- Express native configuration through `app.config.ts` and config plugins.
- Do not run `expo prebuild` unless a native build check specifically requires it.
- Do not copy or junction `node_modules` between worktrees.

## EAS builds

`eas.json` is the source of truth for `development`, `preview` and `production` profiles. The repository is already configured for EAS; do not rerun project initialization as part of normal feature work.

```bash
npx eas-cli@latest build --platform android --profile development
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform android --profile production
```

Build IDs and artifact URLs are operational outputs and intentionally do not live in this README.

## Documentation map

- [Contribution guidance](CONTRIBUTING.md)
- [LiQi UI contract](DESIGN.md)
- [Full design-system specification](docs/design/LIQI_DESIGN_SYSTEM.md)
- [Repository architecture map](docs/architecture/README.md)
- [Mobile frontend architecture](docs/architecture/mobile-frontend.md)
- [Backend architecture](docs/architecture/backend.md)
- [Testing architecture](docs/architecture/testing.md)
- [Security contracts](docs/architecture/security.md)
- [Worktree toolbox and decision guide](docs/architecture/worktree-workflow.md)
- [Android development-client runbook](docs/android-dev-client-runbook.md)
- [Mobile/backend environment parity runbook](docs/runbooks/mobile-backend-environment-parity.md)
- [Client/backend environment authority ADR](docs/adr/0008-client-backend-environment-authority.md)
- [Liquid Glass design system](docs/liquid-glass-design-system.md)
- [Product and service contracts](docs/contracts/)
- [Architecture decision records](docs/adr/)

When documentation and code disagree, investigate which one is stale, explain the trade-off and update the useful source of truth rather than following either mechanically.

## Fast recovery

```bash
npm run repo:context            # Understand the current checkout and available tools
npm run task:inspect            # Inspect and validate a managed task worktree
npm run task:list               # List active managed worktrees
npm run start:clear             # Clear Metro state
npm run dev:android:cold        # Recover a stale emulator snapshot
npm run task:undo -- <id>       # Roll back a verified review overlay
```
