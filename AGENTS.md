# Agent Instructions

This repository is an Expo SDK 56 React Native app using Expo Router, Continuous Native Generation and a deterministic managed-task workflow.

## Repository operating contract

- Start every task by running `npm run repo:context` and obey the reported checkout role.
- The primary workspace is review/integration only. Do not implement or commit feature work there.
- From primary, create work with `npm run task:start -- <type/descriptive-name>`; do not use plain `git worktree add` or copy the repository.
- Implement and commit only the owned patch in the managed task worktree.
- Read `docs/architecture/README.md` and the owning architecture document before changing code.
- Run `npm run task:check` before handoff.
- Apply a committed task for primary review with `npm run task:review -- <worktree-path>`.
- Finish with `npm run task:finish -- <worktree-path>` after review/handoff.
- Managed task branches contain local snapshot ancestry and must not be pushed. Never push `refs/liqi/*`.
- Do not copy or junction `node_modules` between worktrees.

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
