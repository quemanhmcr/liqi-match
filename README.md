# Liqi Match

Liqi Match is an Expo SDK 56 React Native application with an Expo Router mobile client, Supabase Edge Functions and a Cloudflare media worker. The repository is structured for parallel development with explicit ownership boundaries, deterministic task worktrees and checksum-verified review overlays.

## Start here

This is not a conventional single-working-tree repository. Every checkout has an operating role, and that role determines what work is safe there.

```bash
npm run repo:context
```

- **Primary review workspace:** review and integration only. Do not implement or commit feature work here.
- **Managed task worktree:** implement, test and locally commit one owned task here.
- **Clean publishable branch:** create remote-ready commits here only after review; it must not descend from a local snapshot commit.

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [repository architecture map](docs/architecture/README.md) before changing code. From the primary workspace, start implementation with:

```bash
npm run task:start -- feat/descriptive-task-name
```

Do not replace this command with plain `git worktree add`, a copied repository directory or a new feature branch inside the primary workspace.

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

## Managed task lifecycle

### 1. Start from primary

Use a descriptive Conventional Commit-style branch name such as `feat/...`, `fix/...`, `refactor/...` or `docs/...`:

```bash
npm run task:start -- fix/chat-autofollow
```

The command snapshots the exact Git-visible primary state, copies allowlisted local environment files separately, installs dependencies and validates the new worktree. It prints the generated worktree path when ready.

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

This runs the repository contract, formatting, frontend and backend architecture checks, dependency audit, lint, TypeScript and the complete unit/native Jest suite.

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

### 4. Review from primary

After the task worktree is clean and its patch is committed, return to the primary workspace:

```bash
npm run task:review -- C:/project/liqi-chat-autofollow
```

The review transaction verifies primary checksums before writing, backs up affected paths, applies the committed task diff byte-for-byte, verifies the result and runs targeted smoke checks. It prints a guarded rollback command such as:

```bash
npm run task:undo -- <overlay-id>
```

### 5. Finish from primary

After review and handoff:

```bash
npm run task:finish -- C:/project/liqi-chat-autofollow
```

Cleanup archives the manifest, patch, commit list and Git bundle before removing the managed worktree, local task branch and hidden snapshot ref.

See [the managed task and primary review workflow](docs/architecture/worktree-workflow.md) for snapshot classification, conflict detection, rollback, retention, process cleanup and publishable-branch rules.

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

Local mobile configuration belongs in `.env.local`, created from `.env.example`.

`EXPO_PUBLIC_*` values are embedded in the client bundle and are readable by users. Never put secrets, service-role keys, access keys, private tokens or credentials in those variables. Server-only values belong in Supabase secrets, Cloudflare secrets or CI secret stores.

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

- [Contributing and task lifecycle](CONTRIBUTING.md)
- [Repository architecture map](docs/architecture/README.md)
- [Mobile frontend architecture](docs/architecture/mobile-frontend.md)
- [Backend architecture](docs/architecture/backend.md)
- [Testing architecture](docs/architecture/testing.md)
- [Security contracts](docs/architecture/security.md)
- [Managed worktree workflow](docs/architecture/worktree-workflow.md)
- [Android development-client runbook](docs/android-dev-client-runbook.md)
- [Liquid Glass design system](docs/liquid-glass-design-system.md)
- [Product and service contracts](docs/contracts/)
- [Architecture decision records](docs/adr/)

When documentation and code disagree, stop and resolve the contract in the same task rather than silently bypassing it.

## Fast recovery

```bash
npm run repo:context            # Confirm what this checkout is allowed to do
npm run task:inspect            # Validate a managed task worktree
npm run task:list               # List active managed worktrees
npm run start:clear             # Clear Metro state
npm run dev:android:cold        # Recover a stale emulator snapshot
npm run task:undo -- <id>       # Roll back a verified review overlay
```
