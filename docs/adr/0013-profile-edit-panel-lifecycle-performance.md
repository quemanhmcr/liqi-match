# ADR 0013: Profile Edit panel lifecycle performance

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision owners:** Mobile platform and Profile

## Context

Profile Edit exposes four bounded editing categories. The first rebuild rendered only the active category with conditional JSX. Switching categories therefore unmounted one panel and synchronously mounted another on the same interaction. The play-style panel contains many option groups and compact chips, so rebuilding its React and native view trees could block visible feedback on the JavaScript thread.

The availability panel also owns intentional ephemeral state: a selected day must survive while the user visits another category before choosing a time window. Conditional unmounting discarded that partial state.

Expo SDK 56 in this repository provides React 19.2 and React Native 0.85, including React `Activity` support in the Fabric renderer.

## Decision

Wrap each of the four category panels in a named React `Activity` boundary and switch its `mode` between `visible` and `hidden`.

- Hidden panels are prepared and updated at lower priority instead of being rebuilt on the category press.
- Local panel state is restored when the panel becomes visible again.
- Effects inside hidden panels follow `Activity` cleanup semantics; Profile Edit panels must not rely on hidden effects for authority or persistence.
- Panel and preview boundaries use shallow `memo` with stable, narrow props. No custom deep comparator is introduced.
- Dense editor chips opt out of decorative sheen gradients. Selection, border, typography and accessibility semantics remain unchanged.
- Category selection remains an urgent state update. `startTransition` is not used to mask the delay or postpone selected-state feedback.

## Consequences

- Category changes no longer pay the full panel mount cost on the interaction path after background preparation.
- Partial availability input and other ephemeral panel state survive category round trips.
- Four bounded hidden trees consume some background render work and retained React state. This is acceptable for this fixed editor, but the pattern must not be copied to unbounded lists or unrelated full screens.
- Hidden panels must keep effects disposable and must not perform authority-bearing writes merely because they are rendered.
- Form chips are visually quieter than showcase chips, which is appropriate for a dense editing surface and reduces native gradient nodes.

## Alternatives considered

1. **Keep conditional mounting and add an animation.** Rejected because it hides rather than removes the synchronous mount cost.
2. **Move the category update into `startTransition`.** Rejected because the selected category itself is direct interaction feedback and should remain urgent.
3. **Mount all panels in ordinary `View` containers with `display: none`.** Rejected because React would not receive lifecycle and priority intent, and effects would remain caller-managed.
4. **Enable React Compiler for the application.** Rejected as an application-wide migration disproportionate to a local lifecycle problem.
5. **Virtualize the option groups.** Rejected because each panel is bounded and semantically a form, not a long homogeneous list.
