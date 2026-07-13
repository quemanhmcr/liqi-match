# Media Asset Entity

`AssetKey` is a stable domain identity. Features carry keys, never filesystem paths.

Version 1 key convention:

- `asset:v1/profile/<profile-id>/avatar`
- `asset:v1/profile/<profile-id>/cover`
- `asset:v1/set/<set-id>/artwork`
- `asset:v1/message/<message-id>/image/<slot>`
- `asset:v1/library/<kind>/<slug>` for an explicitly declared reusable library item

The resolver is synchronous for rendering and asynchronous for preload/invalidation. It consumes the shared simulation state through `AssetSimulationStateProvider`; it does not own a network or scenario controller.

Key-specific invalidation clears the resolver's logical state. Global invalidation also clears the native Expo Image memory/disk caches. Remote content must use immutable or revisioned URLs because Expo Image exposes global, not selective, physical cache deletion.
