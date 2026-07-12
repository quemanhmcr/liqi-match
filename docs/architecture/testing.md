# Mobile Testing Architecture

Liqi Match uses separate feedback lanes so development tests stay fast while pull requests retain full regression coverage.

## Test lanes

### Unit lane

Files ending in `.test.ts` run in Node through SWC. Keep this lane free of React Native rendering and Expo runtime dependencies.

Use it for:

- domain rules and view models;
- stores, reducers and state machines;
- formatting, search, filtering and layout calculations;
- repository and transport contracts that can run without native modules.

```bash
npm run test:unit
npm run test:unit:watch
```

### Native component lane

Files ending in `.test.tsx` run through `jest-expo` and React Native Testing Library. Files ending in `.native.test.ts` are non-JSX integration tests that still require Expo/Babel behavior.

Use this lane for user-visible component contracts, providers, routing adapters and Expo-coupled integrations. Do not move pure business rules into screen tests.

```bash
npm run test:native
npm run test:native:watch
```

### Full regression lane

The full lane runs the test policy check and both Jest projects. It is a pull-request and release gate, not the default save-loop command.

```bash
npm run test:full
```

CI calls the same lane through `npm run test:ci`.

## Development workflow

Inside a task worktree whose baseline represents the primary workspace snapshot:

```bash
npm test
npm run test:changed
npm run test:failed
```

To test one or more implementation files through Jest's dependency graph:

```bash
npm run test:related -- src/features/messages/model/chat-timeline.ts
```

`npm test` watches only tests related to changed files. `test:changed` is intended for task worktrees where `HEAD` is the local snapshot baseline.

The runner caps Jest at four workers by default. This avoids CPU and memory contention on the shared review machine. Override it only for profiling:

```bash
JEST_MAX_WORKERS=2 npm run test:full
```

In PowerShell:

```powershell
$env:JEST_MAX_WORKERS = "2"
npm run test:full
```

## Test policy

`npm run test:policy` rejects:

- committed `describe.only`, `it.only` or `test.only`;
- per-file `jest.setTimeout(...)` used to hide slow tests;
- real `setTimeout` sleeps wrapped in promises.

Use fake timers, injected clocks, controlled promises or observable state instead of wall-clock waits.

Recommended budgets:

- pure unit suite: under 1 second;
- component suite: under 3 seconds when warm;
- changed-test development loop: under 5 seconds;
- full Jest regression: under 20 seconds on the shared review machine.

A suite that repeatedly exceeds its budget should move business logic out of the rendered screen rather than increase its timeout.

## What Jest does not prove

React Native component tests execute in Node. Critical native behavior still requires a development build and device-level smoke coverage, especially keyboard ownership, deep links, media selection/upload, safe-area behavior and native module configuration.

References:

- [Expo unit testing](https://docs.expo.dev/develop/unit-testing/)
- [React Native testing overview](https://reactnative.dev/docs/testing-overview)
- [React Native Testing Library async utilities](https://callstack.github.io/react-native-testing-library/docs/api/misc/async)
