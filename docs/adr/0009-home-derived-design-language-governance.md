# ADR 0009: Govern the Home- and Messages-derived shared UI language

- **Status:** Accepted (amended July 20, 2026)
- **Original date:** 2026-07-20
- **Decision owners:** Product design and mobile platform

## Context

The approved Home and Messages experiences established the current product language: near-black navy canvas, dark near-opaque surfaces, sharp artwork, restrained violet-to-pink energy, explicit state hierarchy and compact-device behavior. Earlier pages used independent palettes and effect APIs. The first governance iteration prevented new visual debt, but its public contract was split across theme, component and screen packages and exposed screen-named token branches in shared code.

That split encouraged broad component bags and made feature-only values appear globally reusable. It also made a future route reset harder because deleting a feature could leave its visual branch behind in the shared token tree.

## Decision

`@/shared/ui` is the canonical public API for new and materially changed mobile UI.

- Reusable primitives and semantic foundation values are exported from `src/shared/ui/index.ts`.
- Full-page composition starts with `AppScreen` unless an embedded/modal host is explicitly documented.
- Semantic typography uses `AppText`, including explicit `h1`, `h2` and `h3` roles.
- Feature-specific values live in owned recipe modules such as `src/features/home/ui/home-ui.ts` and `src/features/messages/ui/messages-ui.ts`.
- Raw color literals are forbidden in component implementations and allowed only in governed recipe/theme modules.
- Domain-specific rows, bubbles, composer behavior and delivery states remain feature components rather than being generalized into shared primitives.
- `npm run design:new-screen` generates the new API, and `npm run design-system:check` enforces public imports, screen hosts, recipe ownership and legacy checksums.
- Existing `Liqi*` modules remain compatibility adapters only while untouched routes migrate or are reset. New imports to those modules are not the paved road.
- The legacy checksum baseline may shrink through migration but cannot grow or be refreshed as an ordinary implementation shortcut.

Home and Messages remain visual references, not mandates to duplicate their feature composition. Repository, capability, navigation and server contracts remain authoritative.

## Consequences

### Positive

- One public import surface makes the correct path discoverable.
- Shared code contains reusable behavior rather than feature namespaces.
- Feature deletion also deletes its visual recipe, reducing orphaned tokens.
- Typography and interaction contracts are testable independently.
- Legacy migration remains incremental because adapters preserve existing imports without preserving duplicate implementations.

### Costs and trade-offs

- Compatibility adapters temporarily keep old names visible in the repository.
- A materially edited legacy file must fully migrate or be reverted; checksum refresh is not an ordinary option.
- Exact visual values may remain feature-local even when two features look similar. Promotion to shared requires proven semantic reuse, not visual resemblance.
- Governance and scaffold code must evolve with the public API, increasing the review scope of platform-level UI changes.

## Alternatives considered

1. **Rename the existing token tree only.** Rejected because feature branches would remain globally coupled.
2. **Move every Home/Messages component into shared.** Rejected because conversation rows, message bubbles and composer behavior carry feature semantics and capability contracts.
3. **Big-bang delete all legacy APIs.** Rejected during active parallel WIP; compatibility adapters provide a safer strangler migration and rollback boundary.

## Escape hatch

An urgent exception must be explicit: a dedicated governance change records path, owner, reason and validation. Updating a legacy checksum inside an unrelated feature patch is not accepted.
