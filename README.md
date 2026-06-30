# Liqi Match Mobile

Production-ready Expo SDK 56 foundation for the Liqi Match mobile app. This repository intentionally contains no product matching, auth, backend, chat, swipe UI, or game-owned assets.

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
npm run lint
npm run typecheck
npm run test:ci
npx expo-doctor
npx expo config
```

## Project Structure

- `src/app`: Expo Router routes, route-level layouts, and screen composition only.
- `src/features`: future independent product domains.
- `src/shared`: reusable components, config, theme, hooks, services, types, and utilities.
- `src/test`: test setup and route render tests. Do not place tests inside `src/app`.

The `@/*` alias maps to `src/*` in TypeScript and Jest.

## CNG Policy

Continuous Native Generation is the policy for this repo:

- Do not commit `ios/` or `android/`.
- Do not manually edit native projects.
- Express native settings through `app.config.ts` and config plugins.
- Do not run `expo prebuild` unless a native build check requires it.

## App Variants

`APP_VARIANT` supports:

- `development`: `Liqi Match Dev`, `com.placeholder.liqimatch.dev`
- `preview`: `Liqi Match Preview`, `com.placeholder.liqimatch.preview`
- `production`: `Liqi Match`, `com.placeholder.liqimatch`

Bundle identifiers are placeholders. Replace all placeholder application identifiers before the first store build because store application IDs cannot be chosen casually after the app is created.

## EAS Status

`eas.json` contains development, preview, and production profiles only. This task did not log in to EAS, create an Expo project ID, configure credentials, build in the cloud, submit to stores, or push a Git remote.

After the official Expo organization exists, run:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build:configure
```
