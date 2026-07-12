# Liqi Match Mobile

Production-ready Expo SDK 56 foundation for the Liqi Match mobile app, including
the app shell, onboarding, profile and preview dashboard foundations.

## Requirements

- Node.js 24 LTS. This repo includes `.nvmrc` with `24` and `package.json` enforces `>=24 <25`.
- npm 11 or newer is expected with Node 24.
- Android Studio for local Android development builds.
- macOS with Xcode for local iOS development builds.

## Setup

Install dependencies:

```bash
npm install
```

Enable repository Git hooks on this machine:

```bash
npm run prepare:git
```

The committed `pre-push` hook blocks accidental direct pushes to `main`. It is a local safety guard only; CI remains the source of truth.

It also blocks managed local snapshot branches, because their ancestry contains the aggregate primary review state and is not publishable.

Create local env config:

```bash
cp .env.example .env.local
```

`EXPO_PUBLIC_*` values are embedded in the client bundle. Never put secrets, API keys, tokens, or credentials in these variables.

## Development Build Workflow

This project uses `expo-dev-client`. Expo Go is not the production development workflow because custom native modules and store-ready configuration must be validated in development builds.

### One-command Android emulator workflow

On this Windows development machine, the default Android emulator is:

```text
LiqiMatch_Pixel_8
```

Open the emulator, wait for Android to finish booting, unlock it, build the development client, and launch the app:

```bash
npm run dev:android
```

If the emulator window opens to a black screen or a stale snapshot, restart with a cold boot:

```bash
npm run dev:android:cold
```

The script uses `ANDROID_AVD_NAME` when set; otherwise it uses `LiqiMatch_Pixel_8`.

```powershell
$env:ANDROID_AVD_NAME = "LiqiMatch_Pixel_8"
npm run dev:android
```

This command may generate the local `android/` folder because `expo run:android` creates native project files for the development build. That folder is CNG output, is ignored by Git, and must not be committed.

Start Metro for an installed development build:

```bash
npm run start
```

Clear Metro cache:

```bash
npm run start:clear
```

Run Android locally when Android Studio and an emulator/device are available:

```bash
npm run android
```

Run iOS locally on macOS with Xcode:

```bash
npm run ios
```

Run web:

```bash
npm run web
```

## Quality Gates

```bash
npm run format:check
npm run architecture:check
npm run security:audit
npm run lint
npm run typecheck
npm run test:ci
npx expo-doctor
npx expo config
```

Use the fast unit/native lanes and changed-test workflow described in [mobile testing architecture](docs/architecture/testing.md).

## Deterministic Worktrees

The primary workspace is review/integration only and may contain source newer than `HEAD`. Create task worktrees through the managed snapshot workflow rather than plain `git worktree add`:

```bash
npm run worktree:create -- fix/chat-autofollow
```

After committing the task patch locally:

```bash
npm run worktree:overlay -- C:/project/liqi-chat-autofollow
```

The overlay checks primary path checksums twice, backs up affected files, applies additions/modifications/deletions exactly, runs targeted smoke checks and prints a rollback command.

After handoff:

```bash
npm run worktree:cleanup -- C:/project/liqi-chat-autofollow
```

See [deterministic worktree and primary review workflow](docs/architecture/worktree-workflow.md) for source classification, env/dependency bootstrap, rollback, retention and local-only branch rules.

## Project Structure

- `src/app`: Expo Router route adapters and nested layouts only; never put screen UI or service logic here.
- `src/app-shell`: provider composition, route policy and the sole primary-tab contract.
- `src/features`: independently owned product domains with public `index.ts` APIs.
- `src/entities`: shared product concepts used by more than one feature.
- `src/shared`: reusable components, config, theme, hooks, services, types, and utilities.
- `src/test`: test setup and provider helpers only. Colocate tests with their feature or app shell; never place tests inside `src/app`.
- `supabase/functions`: thin Edge Function adapters, endpoint-owned handlers, and a layered shared kernel.
- `cloudflare/media-worker`: domain/application/infrastructure/transport layers with a single composition root.

The `@/*` alias maps to `src/*` in TypeScript and Jest.

See [mobile frontend architecture](docs/architecture/mobile-frontend.md) for
route ownership, dependency rules, adding a page/tab, and the parallel work
workflow.

See [backend architecture](docs/architecture/backend.md) for service ownership,
dependency boundaries, migration rules, and parallel backend workflow.

## CNG Policy

Continuous Native Generation is the policy for this repo:

- Do not commit `ios/` or `android/`.
- Do not manually edit native projects.
- Express native settings through `app.config.ts` and config plugins.
- Do not run `expo prebuild` unless a native build check requires it.

## App Variants

`APP_VARIANT` supports:

- `development`: `Liqi Match Dev`, `com.quemanhmcr.liqimatch.dev`
- `preview`: `Liqi Match Preview`, `com.quemanhmcr.liqimatch.preview`
- `production`: `Liqi Match`, `com.quemanhmcr.liqimatch`

Application identifiers are now set to the `com.quemanhmcr.liqimatch` namespace. Treat them as stable once any store app is created.

## EAS Status

`eas.json` contains development, preview, and production profiles. Development builds use `expo-dev-client` and internal distribution.

The project is linked to EAS as `@manhliqi/liqimatch`. The first Android development cloud build completed successfully:

- Build ID: `642b7b8e-9f8d-4862-a899-f42e1f421360`
- APK: `https://expo.dev/artifacts/eas/taOXNw1657xYe_EkDJZA3Jg4QDPIpRfEzW1ugLcOYTg.apk`

Initial EAS setup commands:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile development
```

Production store submission is intentionally out of scope for this stage.
