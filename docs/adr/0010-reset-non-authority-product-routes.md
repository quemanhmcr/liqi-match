# ADR 0010: Reset non-authority authenticated product routes

- **Status:** Accepted
- **Date:** 2026-07-20
- **Decision owners:** Product design and mobile platform

## Context

Home and Messages are the only approved production UI authorities for the rebuild. Other authenticated product pages contain earlier visual systems and could be copied accidentally while the new shared UI architecture is being established. Deleting their feature/domain code would destroy tested business behavior and make later reconstruction harder.

## Decision

All authenticated product route adapters except Home, Messages and chat conversation detail mount `ResetRouteScreen`, an intentionally blank app-shell host.

The reset includes Explore, Profile, Discover, Notifications, Sessions, Sets and Social routes. Stable URLs, route names, access gates, navigation contracts and feature/domain source remain in place.

The following are deliberately preserved:

- `/home`, `/messages` and `/messages/[conversationId]`;
- the legacy session-conversation redirect into canonical chat;
- public login, OAuth callback and Home preview;
- onboarding routes and access orchestration, because removing them would prevent a new account from reaching the approved authenticated surfaces;
- the development design-system route.

A static test classifies every authenticated route adapter. Adding a new adapter requires an explicit choice: mount an approved authority or enter the reset set.

## Consequences

- Navigation to a reset route succeeds but displays no legacy feature UI.
- Domain/repository code remains available for rebuilding and tests.
- Existing deep links keep stable paths but may land on a blank host until that route is rebuilt.
- Push/deep-link product experiences targeting reset routes must not be described as fully restored UI.
- Route restoration should be one feature at a time and must remove that adapter from the reset policy test in the same change.

## Alternatives considered

1. **Delete old feature code.** Rejected because it would erase domain contracts and tested behavior.
2. **Hide tabs only.** Rejected because deep links and internal navigation could still mount legacy pages.
3. **Reset auth and onboarding too.** Rejected because the app would become inaccessible to new or incomplete accounts.
