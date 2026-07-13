# ADR 0004: Authoritative player identity and lifecycle v1

- Status: Accepted
- Date: 2026-07-14
- Owners: Senior 1 (provider), Seniors 2–4 (consumers)

## Context

The legacy model uses `profiles.id = auth.uid()`. That makes AccountId,
PlayerId, and ProfileId indistinguishable and encourages consumers to infer
lifecycle from profile rows. Production Match Loop v1 requires one durable
identity mapping, server-owned lifecycle transitions, optimistic profile
versioning, idempotent commands, and a retained player tombstone after account
deletion.

## Decision

`auth.uid()` is the only authenticated AccountId authority. Postgres stores the
mapping:

```text
players.account_id (immutable auth subject)
  -> players.id (PlayerId)
  -> player_profiles_v1.id (ProfileId)
```

`players.auth_user_id` is a live foreign key to `auth.users`. It equals
`account_id` while the auth identity exists and becomes null on final auth
removal. `account_id` is retained so events, matches, conversations, audit
records, and deleted-player display identity keep a stable semantic key.

Clients may read their own snapshot but cannot mutate identity, lifecycle, or
profile version columns directly. Authoritative commands run in hardened
Database Functions with fixed empty `search_path`, explicit grants, row locks,
expected versions, durable receipts, structured errors, and outbox events.

## Lifecycle and capabilities

Allowed transitions are:

```text
registered -> onboarding | suspended | deleting
onboarding -> active | suspended | deleting
active     -> suspended | deleting
suspended  -> active | deleting
deleting   -> deleted
deleted    -> (terminal)
```

`discoverable` and `messagingAllowed` are authoritative capabilities, not
client-derived convenience fields. Any non-active state must expose both as
false. Consumers must additionally require `state = active` when checking a
capability.

- Mission 2 must exclude the player immediately when discovery eligibility is
  false, even if an active Match Intent still exists. Mission 2 owns whether
  that intent is paused, expired, or otherwise reconciled.
- Mission 3 must reject message-send authorization when
  `messagingAllowed = false`. Historical message retention and read access are
  Conversation-owned, but may not recreate a second lifecycle inference.
- Mission 4 must route onboarding/deleting/session-expired states from the
  provider snapshot rather than profile completeness or local draft status.

## Command replay semantics

A repeated idempotency key never performs the domain write twice. Its response
refreshes the current authenticated principal and current lifecycle snapshot
before returning. Authorization data is therefore never replayed from an old
session, and a bootstrap retry after activation cannot return stale onboarding
state.

Reusing the same key with a different request is rejected.

## Onboarding cutover

During expand/migrate, `complete_player_onboarding_v1` accepts the canonical
minimum activation projection plus a legacy payload transport bridge. The
legacy writer does not decide activation. The v1 command reads the persisted
rows back, verifies the minimum canonical fields, increments ProfileId version,
then performs the sole `onboarding -> active` transition and emits
`player.activated.v1`.

Existing profiles are shadow-computed once during migration and persisted as a
new lifecycle snapshot. No production consumer may repeat the legacy
completion inference at runtime.

## Deletion and tombstones

Final removal of `auth.users` detaches `auth_user_id`. A database invariant
moves the player to terminal `deleted`, disables discovery/messaging, retains
AccountId/PlayerId/ProfileId, emits exactly one `player.deleted.v1`, and writes
an audit entry containing only a hash of AccountId.

The normal deletion command must transition through `deleting`; the auth-detach
invariant is also a safety fallback for legacy deletion paths.

## Rollout and rollback

The schema and RPCs are additive. Feature flags may keep legacy reads and auth
adapters active while consumers adopt v1 snapshots. Rollback disables new
commands/consumers but does not drop new identity or lifecycle data. Only one
lifecycle engine may mutate in production at a time.
