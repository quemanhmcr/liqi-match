# Media Asset Entity

`AssetKey` is the canonical identity exported by `@/entities/simulation`.
Features carry keys, never filesystem paths or feature-owned lookup tables.

Canonical examples:

- `asset:profile:minh-anh:avatar`
- `asset:profile:quan-viewer:cover`
- `asset:profile:quan-viewer:wall:0`
- `asset:set:sao-bang:artwork`
- `asset:message:victory-photo`
- `asset:shared:avatar-fallback`

The versioned physical manifest maps those identities to bundled, local, remote,
or placeholder sources. The resolver is synchronous for render decisions and
asynchronous for preload/invalidation. Its simulation adapter consumes the shared
runtime network, world state, fault controller and reset registry; it never owns
a second clock, scenario or network controller.

World states map to presentation-neutral resolver states:

- `available` -> `ready`
- `missing` -> `missing`
- `corrupt` -> `corrupt`
- `unassociated` -> `uploaded-but-unassociated`

Key-specific invalidation clears logical resolver state. Global invalidation also
clears Expo Image memory/disk caches. Remote assets must use immutable or
revisioned URLs because Expo Image exposes global rather than selective physical
cache deletion.
