# Agent Instructions

This repository is an Expo SDK 56 React Native app using Expo Router and Continuous Native Generation.

- Use Node.js 24 LTS.
- Keep React, React Native, and Expo packages on versions managed by Expo SDK 56.
- Use `npx expo install` for Expo-managed native packages.
- Use `expo-dev-client`; do not rely on Expo Go as the main workflow.
- Keep routes in `src/app`.
- Do not import from `@react-navigation/*` in application code. Use Expo Router APIs.
- Do not commit `ios/` or `android/`.
- Use `npm run dev:android` for the local Windows Android emulator workflow; `npm run dev:android:cold` is available when the emulator snapshot is stale or black.
- Do not add secrets, credentials, certificates, provisioning profiles, `.jks`, `.keystore`, or `.p12` files.
- Do not add Firebase, Supabase, Sentry, backend SDKs, or large UI frameworks unless a later task explicitly requires them.
- Run `npm run lint`, `npm run typecheck`, and `npm run test:ci` before handing off code changes.
