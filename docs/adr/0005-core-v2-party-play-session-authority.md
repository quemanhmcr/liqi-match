# ADR 0005: Core V2 Party and Play Session authority

- Status: proposed for checkpoint S2.1
- Owner: Senior 2
- Date: 2026-07-14

## Decision

Core V2 keeps recruitment and actual play as separate aggregates.

- `match_sets_v2` owns recruitment, membership requests, invitations, capacity,
  ownership and close/reopen behavior.
- `play_sessions_v2` owns a concrete scheduled play attempt, accepted
  participants, role assignments, ready checks, start, completion, cancellation
  and dispute state.
- Every foreign identity is a Core V1 `player_id`. No Core V2 aggregate stores
  `auth.uid()` or legacy profile IDs as player identity.
- `PlaySessionId` is owned by this contract and is intentionally distinct from
  Core V1 `AuthenticatedPrincipal.sessionId`, which identifies an auth session.
  Consumers must import the Core V2 semantic ID instead of rebranding either
  identifier locally.

## Session lifecycle

```text
draft -> recruiting -> ready_check -> scheduled -> in_progress
      -> completion_pending -> completed

terminal/exception: cancelled | expired | abandoned | disputed
```

Rules:

1. Creation starts at `draft` only when the owner is the sole participant and
   no invite has been issued. Match/Set conversions start at `recruiting`.
2. A ready check snapshots all active member IDs. Membership or role changes
   invalidate the open/passed check and return the aggregate to `recruiting`.
3. Ready-check pass requires every snapshotted member to answer `ready` before
   the server deadline. Timeout is evaluated from server time and is
   deterministic.
4. Passing a ready check moves the session to `scheduled`; start is a separate
   command and requires the same active membership set.
5. Completion is participant-attested. The first `completed` claim moves an
   in-progress session to `completion_pending`; all active participants must
   submit `completed` for `session.completed.v2` to be emitted.
6. Any `disputed` or `no_show` claim moves completion to `disputed`. Core V2
   does not label participant quorum as external verification.
7. Cancellation requires a stable reason code. Completed and disputed sessions
   are immutable except for separately owned moderation/reconciliation flows.

## Concurrency and retry

Every mutation has an authenticated actor resolved at the identity boundary,
`idempotencyKey`, `correlationId`, expected aggregate version, stable error code,
authoritative receipt, event envelope and audit metadata.

The database implementation serializes each Set/Session aggregate before
checking capacity or transition policy. Optimistic version checks reject stale
mobile writes. The final-slot invariant is enforced inside the same transaction
that accepts membership.

## Relationship and block consumption

Session invite/join authorization consumes Senior 1's relationship capability
and requires `canInviteToSession = true`; Core V2 never infers permission from
friendship, match or chat history.

A block created before start invalidates pending invites, removes the blocked
participant from active pre-start membership, invalidates the ready check and
preserves the membership row as history. A block created during `in_progress`
or `completion_pending` fail-closes further coordination and moves the Session
to `disputed` for explicit resolution; it does not rewrite participation
history or synthesize a completed outcome. Senior 3 independently revokes
conversation access from the same block/session events.

Historical Set/Session rows are retained for participants, audit and outcome
integrity. User-facing history may redact the blocked counterpart's live
profile/presence projection, but must not delete or alter the canonical member
and timestamp facts.

## Conversation saga

`session.created.v2` is the first shared seam for Senior 3. It contains the
canonical participant snapshot and explicitly requests communication
provisioning. Conversation creation is not part of the Session transaction.
Senior 3 consumes the event idempotently and publishes/provides a conversation
receipt. Core V2 stores only a projection (`pending | ready | degraded`) and
never becomes conversation authority.

Session event envelopes carry the Session `aggregateVersion`. Membership
projections separately carry a monotonic `membershipVersion` and the complete
active `{ playerId, role }` list. These version axes must not be collapsed:
ready/lifecycle events can advance the aggregate without changing membership.
Senior 3 can therefore replay system activity and membership reconciliation
independently without rejecting a valid projection as stale.

## Outcome handoff

`session.completed.v2` uses the event envelope `aggregateVersion` as the
session version. It does not duplicate that fact inside the payload. The payload
contains canonical `participantPlayerIds`, scheduling/start/completion times,
role assignments, source and `verification = participant_quorum`.

Only `session.completed.v2` is a positive outcome input for Senior 4. Cancelled,
expired, abandoned and disputed states never emit that event. The completed
event includes participants, role assignments, source, started/completed times
and `verification = participant_quorum`.

## Compatibility and rollback

V2 tables and RPCs are additive. V1 Set reads remain available through a
compatibility adapter. New V2 writes are behind a server-side feature gate.
Disabling creation does not downgrade or delete active V2 sessions; reads and
safe terminal transitions remain available for existing aggregates.
