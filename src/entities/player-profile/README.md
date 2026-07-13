# Player profile domain

This entity is the canonical, runtime-validated contract shared by onboarding
and profile editing. It deliberately contains product semantics only; screen
state, navigation state, query state and backend transport details do not belong
here.

## Consumer surface

Import from the entity root:

```ts
import {
  CompletedProfileDraftSchema,
  OnboardingDraftSchema,
  PROFILE_DOMAIN_CATALOGS,
  adaptCompletedProfileToLegacyOnboardingPayload,
  createEmptyOnboardingDraft,
  migratePersistedOnboardingDraft,
} from '@/entities/player-profile';
```

Key rules:

- IDs are stable English identifiers. Vietnamese labels are display copy only.
- `legacyValue` is used only inside compatibility/migration boundaries.
- `null` and empty arrays mean unanswered; factories never insert product
  choices such as Master, Jungle or favorite heroes.
- `profileBasics.gameHandle` is independent from `displayName`.
- `laneSelection.primary` and `laneSelection.secondary` preserve preference
  order even though the current backend cannot round-trip it.
- Favorite hero array order and the explicit `priority` field must agree.
- Long-term habits and a time-bound `matchIntent` are separate concepts.
- Recurring availability always carries an IANA timezone and explicit weekdays.
- Current-backend values are resolved through `resolveCatalogId` or
  `resolveHeroId`; consumers must not compare localized labels or normalize
  arbitrary names into IDs.

### Reading current backend values

Current tables expose rank/role/hero slugs and Vietnamese habit strings. Resolve
those values before placing them into canonical state:

```ts
const rank = resolveCatalogId(RANK_CATALOG, backendRank.slug);
const lane = resolveCatalogId(LANE_CATALOG, backendRole.slug);
const hero = resolveHeroId(backendHero.slug);

if (!rank.ok || !lane.ok || !hero.ok) {
  // Preserve/report the unsupported backend value. Do not guess from labels.
}
```

The resolver returns whether the input was already a canonical ID or an exact
legacy value. It never treats a rank/lane display label or hero name as identity.

Current `profile_habits` rows must pass through `adaptLegacyHabitAnswers`. Its
`value` contains only canonical IDs, while `issues` preserves unknown, malformed,
duplicate or over-limit backend data. A consumer must not persist the canonical
value as a replacement when `lossless` is false without resolving those issues.

## Persistence

Persist only `PersistedOnboardingDraftEnvelopeSchema` data. On hydration, call
`migratePersistedOnboardingDraft` and handle all three outcomes:

- `current`: use the envelope as-is;
- `migrated`: persist the returned current envelope and surface/log warnings;
- `reset-required`: discard the old payload and start from
  `createEmptyOnboardingDraft()` without carrying values forward.

A consumer may supply the device IANA timezone while migrating a legacy draft.
When it does, old coarse time labels are expanded to all seven weekdays because
the old UI never captured weekday preference. The migration reports this loss
of precision explicitly.

## Current backend boundary

`adaptCompletedProfileToLegacyOnboardingPayload` is the only canonical-to-current
RPC boundary. It returns `{ ok, payload, warnings }` or `{ ok, errors, warnings }`.
Do not call the RPC with hand-built payloads and do not suppress its warning
codes. See `docs/contracts/profile-domain.md` for backend gaps and handoff
requirements.
