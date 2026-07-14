# ADR 0005: Core V2 conversation source and membership projection

- Status: proposed for checkpoint S3.1
- Owner: Senior 3
- Reviewers: Senior 1 (relationship/block), Senior 2 (session membership)

## Decision

`conversations_v2` owns communication state only. It does not own friendship,
block, match, or play-session semantics. Every conversation has one creation
source and one or more unique, versioned source bindings:

- `direct_match`
- `friendship`
- `play_session`
- `system`

`conversation_sources_v2` maps each authoritative source to one conversation.
The source mapping is unique. A direct thread created by a match may later bind a
friendship source without creating a second thread. Retried provisioning and
source-event replay return the original receipt.

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
conversation provider closes public history fetch, send, realtime subscription,
and push eligibility immediately and emits `conversation.access_revoked.v2`.
Message rows, delivery receipts, and read cursors are retained rather than
deleted. A privileged moderation seam may capture immutable report evidence for
a current or historical member after revocation; it does not restore chat
access.

Relationship-level mute is projected into notification policy only. It does not
remove messages from inbox/timeline and cannot be overridden by the separate
conversation-level mute command. Delivery recipients and push recipients are
therefore distinct facts.

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
