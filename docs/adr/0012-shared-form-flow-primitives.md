# ADR 0012: Shared form and full-screen flow primitives

- **Status:** Accepted
- **Date:** 2026-07-21
- **Decision owners:** Mobile platform and Profile

## Context

The rebuilt Profile Edit flow imported the canonical `@/shared/ui` tokens but still implemented focus borders, validation copy, selectable card states, inline notices and safe-area action docks locally. Profile Share independently implemented the same bottom action-dock behavior. This produced visually similar controls with different accessibility and pressed-state ownership.

Moving Profile-specific panels, hero selection or media semantics into shared would be the opposite error: those compositions depend on Profile contracts and should be deleted with the feature.

## Decision

Add four reusable behavior contracts to the public shared UI API:

- `AppTextField` owns label metadata, focus, disabled and validation presentation;
- `AppNotice` owns semantic tone and alert accessibility;
- `AppPressableCard` owns pressed, selected and disabled card interaction;
- `AppActionDock` owns safe-area geometry for non-tab full-screen actions.

Profile Edit composes those primitives while keeping preview, category definitions, media staging, hero selection, habits and availability feature-owned. Profile Share becomes the second real consumer of `AppActionDock`.

The Profile Edit module is split into flow chrome, feature form primitives and domain panels. The split follows semantic ownership rather than creating one file per visual fragment.

## Consequences

- Focus, validation, selected state and safe-area behavior no longer drift per screen.
- The shared public API grows by four components and therefore requires focused accessibility tests and design-governance coverage.
- Feature recipes no longer own input, notice or dock values that have been promoted to shared recipes.
- Domain-specific panels remain intentionally local even when they use similar cards or chips.

## Alternatives considered

1. **Keep local wrappers around raw React Native controls.** Rejected because behavior and accessibility were already duplicated.
2. **Move every Profile Edit component into shared.** Rejected because visual similarity does not make profile media, heroes or availability generic.
3. **Use only `AppSurface` directly everywhere.** Rejected because callers would still reimplement focus, selected, disabled and safe-area behavior.
