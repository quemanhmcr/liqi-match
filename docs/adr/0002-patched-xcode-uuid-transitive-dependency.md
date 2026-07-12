# ADR 0002: Patch the xcode uuid Transitive Dependency

## Status

Accepted.

## Context

Expo SDK 56 currently resolves `@expo/config-plugins` to `xcode@3.0.1`, which declares `uuid@^7.0.3`. The resolved `uuid@7.0.3` is affected by GHSA-w5hq-g745-h8pq / CVE-2026-41907. The advisory marks `uuid@11.1.1` as the patched CommonJS-compatible release line.

The application does not call the affected UUID v3, v5 or v6 buffer APIs. However, vulnerable build-time dependencies are still part of the production toolchain and must not remain silently accepted.

Forcing `npm audit fix --force` proposes downgrading Expo to an incompatible major version, which is not an acceptable remediation for an Expo SDK 56 application.

## Decision

Use a root npm override scoped only to the vulnerable edge:

```json
{
  "overrides": {
    "xcode": {
      "uuid": "11.1.1"
    }
  }
}
```

This keeps the Expo SDK 56 dependency graph intact while replacing only `xcode`'s UUID implementation. `xcode@3.0.1` uses the CommonJS `uuid.v4()` API, which remains available in `uuid@11.1.1`.

CI runs `npm run security:audit` after `npm ci` and fails on moderate or higher findings. Expo Doctor, Expo config evaluation, web export and native prebuild checks validate that the override remains compatible with the Expo toolchain.

## Consequences

- `npm audit` reports zero known vulnerabilities for the root project at the time of this decision.
- The lockfile intentionally resolves `xcode` to `uuid@11.1.1` outside its declared semver range through npm's supported override mechanism.
- Dependency upgrades must retain the audit and Expo compatibility gates.

## Removal criteria

Remove the override when Expo's resolved `@expo/config-plugins` / `xcode` chain natively depends on a patched UUID version. Confirm removal with:

```bash
npm install
npm run security:audit
npm ls xcode uuid
npx expo-doctor
npx expo config --type prebuild
```
