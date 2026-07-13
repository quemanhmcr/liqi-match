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

`SimulationWorld` is the preferred domain name for the normalized graph.
`SimulationWorldSnapshot` remains a compatibility alias required by the v1
deliverable; Senior 2's runtime snapshot is a different envelope type.

`SimulationWorld` is a normalized domain graph. Records store each
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

`SIMULATION_RUNTIME_SCENARIOS` adapts the domain definitions to Senior 2's
generic runtime contract. `SIMULATION_RUNTIME_SCENARIO_PLANS` retains the
ordered timeline, domain fault declarations and mutation capabilities that do
not belong in the runtime's generic world baseline. Use
`validateSimulationWorldForRuntime` for every runtime ingress and commit.

`SIMULATION_OPERATION_IDS` is the canonical operation vocabulary.
`projectSimulationFaultToRuntime` maps activated domain targets to the runtime's
exact-operation fault directives; offline faults remain network controller
transitions. The mapping catalog is injectable when composition needs narrower
scopes.

Messages, Notifications and Set membership adapters call the exported mutation lenses from
`mutations.ts` inside `runtime.mutate`. Lenses own delivery transitions, read
watermarks, notification ownership and graph updates; runtime owns FIFO,
rollback and faults. `changeSimulationSetMembership` makes join/leave explicit and
forbids owner departure without ownership transfer.

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
