# ADR 0005: Core V2 conversation source and membership projection

- Status: proposed for checkpoint S3.1
- Owner: Senior 3
- Reviewers: Senior 1 (relationship/block), Senior 2 (session membership)

## Decision

`conversations_v2` owns communication state only. It does not own friendship,
block, match, or play-session semantics. Every conversation has exactly one
versioned source reference:

- `direct_match`
- `friendship`
- `play_session`
- `system`

`conversation_sources_v2` maps that authoritative source to one conversation.
The source mapping is unique. Retried provisioning returns the original receipt.

`conversation_members_v2` is a replayable projection. Supplier events provide
`sourceId`, `sourceVersion`, and the complete authoritative member set. The
projection may cache role and active/revoked access, but it never derives a
friendship or session state. Mobile clients cannot add members.

A member may read/send/subscribe only when all of these are true:

1. Core V1 resolves the authenticated account to the same active `player_id`.
2. Core V1 says messaging is allowed.
3. The projected source membership is active.
4. The conversation is not tombstoned for writes.

A removed or blocked player is revoked by an authoritative source event. The
conversation provider closes API and realtime access immediately and emits
`conversation.access_revoked.v2`; notification fan-out must read the same active
membership projection.

System activity is stored as a message with the supplier event ID. A unique
`source_event_id` makes replay idempotent and prevents duplicate system messages.
The payload is presentation data, not a second copy of relationship/session
state.

## Command and event rules

All public mutations carry idempotency, correlation, causation, expected
aggregate version, and audit metadata. The server resolves the actor from the
session and writes an authoritative receipt, audit row, and versioned outbox
event atomically.

The Core V2 event envelope is strict and uses `payload`; consumers reject event
versions they do not support, remain replay-safe, and never mutate supplier
aggregates.

## Expo SDK 56 execution notes

- Notification navigation is handled from both the initial notification response
  and the response listener at the root navigation boundary.
- Conversation deep links are still re-authorized after navigation; a route is
  not an access-control boundary.
- Realtime channels are recreated or re-authenticated after token refresh and
  removed on account switch.
- Offline message commands use a durable, account-scoped journal with stable
  client message IDs. Network reachability only schedules a retry; it never
  proves server availability.
- Background remote notifications are not required for correctness. Authoritative
  inbox/read state is recovered on foreground and reconnect.

## Compatibility and rollback

V1 direct conversations remain readable through an adapter. V2 group creation
can be disabled independently. Existing V2 conversations and cursor history
remain readable. Realtime can fall back to bounded polling. Membership
reconciliation and source events are replayable.
