# ADR 0001: Explicit emnapi CI Dependencies

## Status

Accepted.

## Context

GitHub Actions runs `npm ci` on Linux. The initial Linux CI run failed because the lockfile produced on Windows did not include the full peer dependency tree required by a transitive optional WebAssembly runtime dependency.

`@emnapi/core` and `@emnapi/runtime` are not application-level runtime dependencies. They are declared directly as dev dependencies to keep `npm ci` deterministic on Linux CI.

## Decision

Keep `@emnapi/core` and `@emnapi/runtime` explicit in `devDependencies` until an npm or parent dependency upgrade makes this workaround unnecessary.

## Follow-up

Re-evaluate this after upgrading npm, Expo SDK, or the parent dependency that pulls in `@napi-rs/wasm-runtime`.
