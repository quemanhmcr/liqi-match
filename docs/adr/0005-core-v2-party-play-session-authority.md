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

## Conversation saga

`session.created.v2` is the first shared seam for Senior 3. It contains the
canonical participant snapshot and explicitly requests communication
provisioning. Conversation creation is not part of the Session transaction.
Senior 3 consumes the event idempotently and publishes/provides a conversation
receipt. Core V2 stores only a projection (`pending | ready | degraded`) and
never becomes conversation authority.

Membership events contain a monotonic membership version and full active
participant IDs so Senior 3 can converge after replay or missed delivery.

## Outcome handoff

Only `session.completed.v2` is a positive outcome input for Senior 4. Cancelled,
expired, abandoned and disputed states never emit that event. The completed
event includes participants, role assignments, source, started/completed times
and `verification = participant_quorum`.

## Compatibility and rollback

V2 tables and RPCs are additive. V1 Set reads remain available through a
compatibility adapter. New V2 writes are behind a server-side feature gate.
Disabling creation does not downgrade or delete active V2 sessions; reads and
safe terminal transitions remain available for existing aggregates.
