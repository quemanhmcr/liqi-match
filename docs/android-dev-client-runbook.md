# Android Dev Client Runbook

This project uses Expo SDK 56, Expo Router, CNG, and `expo-dev-client`.
Do not use Expo Go as the primary Android workflow.

## Daily Open

Use:

```powershell
npm run dev:android
```

The script owns the Android emulator workflow:

- reuses only a Metro process recorded for this project
- starts Metro on `localhost`
- configures `adb reverse` for the target emulator serial
- opens the dev client through an explicit `exp+liqimatch` deep link
- centers the emulator window
- refuses unsafe port takeover unless requested

If port `8081` is held by an unknown process, inspect the printed PID and then use:

```powershell
npm run dev:android:takeover
```

## When Adding Packages

Use `npx expo install <package>` for Expo and React Native packages.

JS-only package:

```powershell
npx expo install <package>
npx expo install --check
npm run lint
npm run typecheck
npm run test:ci
npm run dev:android
```

Native runtime module or native config/plugin package:

```powershell
npx expo install <package>
npx expo install --check
npx expo-doctor@latest
npx expo-modules-autolinking verify --verbose
npm run dev:android:rebuild
```

Use a clean prebuild only when native config, config plugins, Expo SDK, or generated native state must be regenerated:

```powershell
npm run dev:android:rebuild:clean
```

## Native Fingerprint

The script stores `.expo/dev-client-android.fingerprint`, which is ignored by git.
It changes when native-relevant source inputs change:

- `package.json`
- `package-lock.json`
- `app.config.ts`
- Android application id / selected AVD

If the fingerprint changes, normal `npm run dev:android` stops and asks for a rebuild.
That prevents the common failure where JavaScript asks for a native module that the installed APK does not contain.

Do not delete the fingerprint to hide a real native dependency change. Delete it only when the installed APK is already known to match the current dependency graph.

## Cache And Recovery

Use the lightest fix that matches the failure.

Metro or stale bundle:

```powershell
npm run dev:android:clear
```

Stale or black emulator snapshot:

```powershell
npm run dev:android:cold
```

Native module missing, for example `NativeModule is null` or `Cannot find native module`:

```powershell
npm run dev:android:rebuild
```

Native config/plugin drift:

```powershell
npm run dev:android:rebuild:clean
```

Avoid these as default reactions:

- do not rebuild native to fix a stale Metro server
- do not wipe the emulator for a JavaScript red screen
- do not clear `node_modules` unless dependency resolution is proven broken
- do not kill every `node.exe`
- do not commit `android/`, `ios/`, or `.expo/`

## Diagnostics

Check dependency compatibility:

```powershell
npx expo install --check
npx expo-doctor@latest
npm ls expo react react-native expo-modules-core expo-font @expo/vector-icons
```

Check native autolinking:

```powershell
npx expo-modules-autolinking verify --verbose
```

Check bundle resolution without the emulator:

```powershell
npx expo export --platform android --clear
```

Check Android logs:

```powershell
adb -s emulator-5554 logcat -c
adb -s emulator-5554 logcat -v threadtime
```
