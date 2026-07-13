# Profile domain contract and backend handoff

Status: contract version `1`

Owner: Senior 1 — Profile Domain Contracts & Shared Semantics

## Purpose

Onboarding and Profile Edit must describe the same player profile without using
Vietnamese display text as identity or silently inventing valid-looking data.
The canonical model lives in `src/entities/player-profile` and the canonical
hero identity/class catalogs live in `src/entities/hero`.

The contract separates five concepts that were previously conflated:

1. **Lane preference** — ordered `primary` and optional `secondary` lane.
2. **Hero class** — fighter/tank/mage/assassin/support/marksman; not a lane.
3. **Favorite heroes** — an ordered list with explicit priority.
4. **Long-term habits** — durable communication, schedule and team preferences.
5. **Match intent** — the player's current, optional, time-bound matching goal.

Labels are presentation. Stable IDs are domain identity. Exact Vietnamese
legacy strings exist only in catalogs so compatibility adapters can translate
to the current database contract.

## Runtime contracts

The public entity exports Zod schemas for:

- onboarding draft;
- completed profile draft;
- lane selection;
- favorite hero selection and priority;
- draft and completed habit answers;
- recurring availability;
- match intent;
- media selection summary;
- versioned persisted onboarding draft envelope;
- the current legacy onboarding RPC payload.

Unanswered data is explicit:

- scalar choices use `null`;
- multi-select choices use `[]`;
- no factory supplies Master, Jungle, Mage, gender, heroes or availability;
- a completed profile requires a separate game handle.

Consumers must validate at ingress, before persistence, and before backend
adaptation. TypeScript types alone are not an external-data boundary.

## Availability semantics

Canonical availability stores:

```ts
{
  timezone: 'Asia/Ho_Chi_Minh',
  slots: [{ dayOfWeek: 1, startMinute: 1320, endMinute: 180 }]
}
```

Weekdays use `0 = Sunday` through `6 = Saturday`. `endMinute <= startMinute` means the interval crosses midnight. The shared
primitive:

- requires explicit weekdays and IANA timezone;
- deduplicates selected days and time preferences;
- splits overnight ranges across weekdays;
- merges overlapping and adjacent intervals;
- returns no fallback slot when input is empty.

The current SQL `time` representation cannot encode `24:00`; its compatibility
adapter writes `23:59:59` and emits `availability_midnight_clamped`.

## Legacy RPC behavior

`adaptCompletedProfileToLegacyOnboardingPayload` translates the canonical
completed profile into the current `complete_onboarding(jsonb)` payload. It does
not:

- copy display name into game handle;
- infer hero class from a Vietnamese label;
- map an unknown hero class to Mage;
- insert default rank, lane, hero, habit or availability data;
- claim that the current backend preserves ordered data.

The adapter refuses to produce a payload when the current RPC's hard
requirements cannot be met, notably its exact-three-heroes requirement.

Warnings currently emitted:

| Code                                   | Meaning                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| `lane_priority_not_persisted`          | `profile_roles` loses primary/secondary order.                       |
| `favorite_hero_priority_not_persisted` | `profile_heroes` loses favorite order.                               |
| `match_intent_not_persisted`           | Current backend has no match-intent aggregate.                       |
| `media_slot_association_not_persisted` | RPC stores only a media summary; upload association is separate.     |
| `wall_media_position_not_persisted`    | Current media model has no wall position.                            |
| `availability_midnight_clamped`        | SQL `time` cannot represent the canonical midnight boundary exactly. |

These warnings are part of the contract and must not be converted into silent
success.

## Persisted draft migration

`migratePersistedOnboardingDraft` returns one of:

- `current` — valid current envelope;
- `migrated` — valid legacy data normalized into version 1 plus warnings;
- `reset-required` — unknown, malformed or unsupported data.

Migration preserves lane and hero order, removes bounded duplicate legacy
values and reverse-maps only exact known legacy strings. Unknown strings require
a reset; they are never guessed. Missing legacy timezone and game handle remain
unanswered. When a caller supplies a timezone, old time presets may be expanded
to all weekdays with a documented warning.

## Backend requirements not solvable in frontend

The next backend profile contract should provide all of the following.

### Ordered lane preferences

Persist lane ID plus priority (`1` primary, `2` secondary), with a uniqueness
constraint per profile and priority. Returning unordered role records is not
enough.

### Ordered favorite heroes

Persist hero ID plus priority and return it in deterministic order. Do not rely
on insertion time as product semantics.

### Dedicated completion status

Add an explicit onboarding/profile completion state or completed-at field.
**Do not introduce or continue using `profile_habits` existence as the new
completion marker.** Completion should be written by the same command that
validates the completed profile.

### Atomic profile command

Provide one transactional command for profile create/update, including basics,
game handle, rank, ordered lanes, ordered heroes, habits, availability and media
associations. The current Profile Edit implementation uses multiple REST
requests and must not be described as atomic.

The command should accept:

- contract version;
- idempotency key/client mutation ID;
- expected profile version for optimistic concurrency;
- a complete validated command or an explicit patch model;
- structured validation errors with stable codes.

### Stable habit IDs

Persist canonical habit IDs rather than Vietnamese strings. Localized copy must
be resolved at presentation time. Backend responses should reject unknown IDs
instead of storing arbitrary text.

### Separate display name and game handle

The backend must require or explicitly model a nullable game handle. It must not
fallback from a missing handle to display name.

### Availability timezone and weekly ranges

Persist the IANA timezone used to interpret recurring local slots. Define DST
behavior and preserve overnight ranges without a `23:59:59` approximation.

### Match intent aggregate

Persist current match intent separately from long-term profile habits. Include
intent kind, active interval, preferred lanes/heroes, communication preferences,
team goals and expiration semantics.

### Media associations

Persist explicit media slot association:

- avatar;
- cover;
- wall;
- wall position/order.

Association and profile update should participate in the same idempotent command
or expose a clear two-phase protocol with retry-safe reconciliation.

### Hero count policy

The product contract allows a bounded ordered favorite list. The current RPC
requires exactly three heroes. Backend should either accept the canonical range
or return a stable policy code so the UI can explain the requirement without
inventing heroes.

## Consumer handoff checklist

Senior 2 and Senior 3 can integrate independently by:

1. importing schemas/catalogs from `@/entities/player-profile`;
2. keeping temporary UI state in their own feature;
3. validating before writing persisted drafts or submitting profile changes;
4. using the migration result rather than merging old state into defaults;
5. using the legacy adapter only at the current backend boundary;
6. preserving and reporting adapter warnings;
7. never adding UI-specific fields to the shared entity.

Consumer feedback should change this contract only when a domain semantic is
missing, a cast/loose string is otherwise unavoidable, or valid product data
cannot be represented.
