# Production Simulation Domain v1

This entity is the single semantic source for the production-simulation world.
It deliberately owns no AsyncStorage, Zustand, QueryClient, latency scheduler,
image loader, provider composition, or screen integration.

## Dependency direction

```text
simulation identity/schema/golden world
              |
              +-> pure integrity validation
              +-> scenario declarations and ordered domain events
              +-> pure Profile/Home/Discover projections

runtime adapters, asset resolvers and feature repositories depend on this API.
This entity never imports those consumers.
```

## Canonical identity

Every identity is branded and runtime-validated. Prefixes are part of the v1
contract:

- `profile:`
- `set:`
- `match:`
- `conversation:`
- `message:`
- `notification:`
- `asset:`
- `scenario:`
- `event:`
- `fault:`

Consumers must not derive one ID from another. In particular, do not construct
`profile-${id}` or `conversation-${profileId}` in a feature.

## World and clock semantics

`SimulationWorldSnapshot` is a normalized domain graph. Records store each
entity exactly once and relationships use canonical IDs. Arrays such as
`conversation.messageIds`, `set.memberIds` and ordered profile selections carry
business order explicitly.

`generatedAt` is the simulation clock represented by the snapshot. Initial
entity timestamps must not be later than it. Scenario timeline events may occur
at or after `initialClock`, are ordered ascending, and are applied only by the
runtime owner. Senior 1 declarations do not mutate a world.

Immutable v1 fields are exported as `SIMULATION_IMMUTABLE_FIELDS`. Runtime may
perform only the mutation kinds listed by each scenario's `allowedMutations`.
IDs, creation timestamps, logical identity keys and asset identity/kind are not
runtime mutation targets.

## Golden world

The intentional dataset contains:

- 12 profiles, including one viewer;
- 3 sets;
- 6 direct matches;
- 8 conversations;
- 40 messages;
- 10 notifications.

`GOLDEN_ASSET_REQUIREMENTS` is the machine-readable handoff for the asset
platform. It maps profile to avatar/cover/wall/pending assets, set to artwork,
and message to attachment/build assets. `GOLDEN_ASSET_KEYS` contains the stable
named keys used by scenarios and tests.

Asset manifest states mean:

- `available`: resolver should deliver the asset normally;
- `missing`: the canonical requirement exists, but no loadable asset is
  available;
- `corrupt`: bytes or metadata are intentionally invalid;
- `unassociated`: upload exists but the owning profile slot is not associated.

A profile with no requested media uses `null`, not a fabricated asset key. The
Discover projection may select the canonical shared fallback for display.
`media-partially-associated` exercises `unassociated`; runtime fault declarations
can make an otherwise available key temporarily unavailable without rewriting
entity identity.

## Scenario/runtime boundary

Scenarios declare initial world, initial clock, required relationships,
capabilities, faults and ordered domain events. Runtime owns persistence, reset,
network state, latency, retry counters and application of events.

The six required scenarios are exported through `SIMULATION_SCENARIOS`:

1. `viewer-ready-happy-path`
2. `newly-onboarded-profile-propagation`
3. `social-unread-cross-link`
4. `empty-cold-start`
5. `degraded-offline-recovery`
6. `media-partially-associated`

## Consumer boundary

Profile, Home and Discover projections are pure and retain `AssetKey`. They do
not produce React Native `ImageSource`, URL, cache key or loading state. Asset
resolution belongs to the asset adapter. Feature repositories may translate the
projection into their existing versioned response envelope, but screens must
continue consuming only their feature contract/repository.

Run the domain tests with:

```sh
npm run test:unit -- --runTestsByPath src/entities/simulation/__tests__
```
