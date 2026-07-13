# Production simulation runtime

This package owns deterministic simulation lifecycle only. It deliberately does
not know what a profile, set, notification, message or media asset means.
Scenario definitions and invariant validators are injected by the domain/world
owner, while feature adapters translate typed runtime faults into their public
repository error taxonomy.

## Core guarantees

- Every runtime instance has an explicit namespace; no mutable singleton is
  exported.
- Scenario worlds and snapshots must be JSON-shaped and are cloned at every
  ownership boundary.
- Mutations are serialized, validated and committed atomically.
- Clock, network and fault plans are shared by all adapters using the instance.
- One-shot faults are matched deterministically by operation and optional scope.
- Query clients, Zustand stores, AsyncStorage state, drafts and asset caches join
  reset/snapshot through registered participants; the runtime imports none of
  them directly.
- Snapshot restore rejects another test namespace or an incompatible scenario
  version.

## Integration boundary

App-shell composition creates one runtime and registers app-level reset
participants. Feature repositories receive that runtime through composition and
must never import another feature's fixture or mutable store. Tests create one
runtime per test with a unique namespace.

Asset resolver/cache integrations subscribe to `subscribeNetworkState`, register
an `after-world` reset participant, and consume adapter-scoped faults through
`execute`. Uploaded-but-unassociated media remains domain state in the scenario
world or feature participant snapshot; asset cache bytes themselves are not part
of the world snapshot unless the asset owner explicitly registers them.
