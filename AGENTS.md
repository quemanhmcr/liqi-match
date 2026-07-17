# Agent Instructions

This repository is an Expo SDK 56 React Native app using Expo Router, Continuous Native Generation and a deterministic managed-task workflow.

## Repository working guidance

- Start by running `npm run repo:context` so the checkout role and available tools are visible.
- Use engineering judgment to choose between a managed task worktree and a normal clean Git worktree. Managed worktrees are helpful for parallel or recovery-sensitive work; they are not required for every edit.
- Primary is commonly used as a baseline, review and diagnostic workspace. Normal commits there are blocked, so put commit-ready implementation in another checkout.
- Preserve and attribute unexpected local changes before reset, clean, rollback or worktree removal.
- Keep each change focused enough that ownership and review remain clear.
- Read `docs/architecture/README.md` and the nearest owning document as design context. Explain intentional deviations rather than following text mechanically.
- Run checks appropriate to the change; `npm run task:check` is the broad handoff suite.
- Managed snapshot branches are local-only and cannot be pushed. Never push `refs/liqi/*`.
- Do not copy or junction `node_modules` between worktrees.
- `npm run task:review` and `npm run task:finish` are optional helpers for managed tasks, not mandatory phases for every branch.

## Product and platform constraints

- Use Node.js 24 LTS.
- Keep React, React Native and Expo packages on versions managed by Expo SDK 56.
- Use `npx expo install` for Expo-managed native packages.
- Use `expo-dev-client`; do not rely on Expo Go as the main workflow.
- Keep `src/app` limited to Expo Router route adapters and layouts.
- Do not import from `@react-navigation/*` in application code. Use Expo Router APIs.
- Do not commit `ios/` or `android/`.
- Use `npm run dev:android` for the local Windows Android emulator workflow; use `npm run dev:android:cold` when the emulator snapshot is stale or black.
- Do not add secrets, credentials, certificates, provisioning profiles, `.jks`, `.keystore` or `.p12` files.
- Do not add Firebase, Supabase, Sentry, backend SDKs or large UI frameworks unless the task explicitly requires an approved architecture change.
- Treat `APP_VARIANT` and `EXPO_PUBLIC_APPLICATION_RUNTIME_MODE` as separate authorities. Never claim remote backend behavior from a simulation runtime.
- `simulation` may use only local Supabase; every remote Supabase project requires `api` mode and a real publishable key. Preserve the fail-closed validation in `src/shared/config/env.ts`.
- Auth success is not backend integration evidence. Verify project ref, migration parity, RPC signatures/dependencies, feature flags and an authenticated persisted-or-rollback smoke on the same target.
- The disposable E2E project is `ibprkyemsuktfrdpxvza`; staging is `wngumhizuxtlhavbpxzy`. Evidence from one must never be presented as evidence for the other.
- Never rename, renumber or edit a migration deployed to a shared project. Use a later reconciliation migration and document any migration-history repair.
- After changing `EXPO_PUBLIC_*`, require a full app reload and account re-authentication when the Supabase project changes; Fast Refresh is not sufficient.
