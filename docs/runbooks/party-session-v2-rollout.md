# Party and Play Session V2 rollout and rollback

Owner: Senior 2 — Party and Play Session Lifecycle

## Preconditions

Name and verify the target project before applying or enabling anything. Complete
the [mobile/backend environment parity runbook](mobile-backend-environment-parity.md)
on that same target; disposable E2E evidence cannot substitute for staging or
production readiness.

Run `npm run migration-history:check`, record the repository migration head,
and require the target project to match that exact head. The current Session
Conversation dispatch boundary is introduced by
`202607170103_session_conversation_dispatch_runtime_v2.sql` and its causal
ordering repair `202607170104_session_conversation_dispatch_ordering_v2.sql`.
Do not enable a cohort until contract checks, database parsing, the two-device
native E2E, and `e2e:party-session:api:test` pass. A live environment must also
record a passing `e2e:party-session:api` run and show
`get_party_session_release_readiness_v2().ready = true`.

Session notification delivery remains owned by the notification provider.
Party/Session only publishes canonical event envelopes and does not create a
second notification authority.

## Rollout controls

`private.party_session_config_v2` owns independent flags:

- `reads_enabled`
- `creation_writes_enabled`
- `mutation_writes_enabled`
- `reconciliation_writes_enabled`

Recommended order:

1. Enable reads for internal accounts and compare V1 Set discovery with the
   V1-read/V2-write compatibility adapter.
2. Enable reconciliation workers and verify the named Cron jobs
   `session-conversation-events-v2` and `play-session-social-safety-v2` are active.
   Confirm Conversation projection convergence plus `player.blocked.v2`
   revocation within five seconds.
3. Enable mutation writes, then creation writes for the first cohort.
4. Run two-device invite, ready, chat, start, completion, stale-version retry,
   block-before-start, and block-during-play journeys.
5. Record the live API E2E result and require server readiness before expansion.

## Operational evidence

Review `public.get_party_session_release_readiness_v2()` for:

- Session create, invite, join, ready, start, completion, dispute and cancel counts;
- invite acceptance, ready-pass and completion rates;
- stale pending/degraded conversation projections;
- overdue ready checks;
- due Social safety retries;
- owner, capacity, ready-version and completed-event invariant violations;
- a fresh passing API-mode E2E run from the last 24 hours.

Also call `public.get_session_conversation_dispatch_health_v2()` as service
role and require:

- `cronActive = true`;
- `dueEventCount = 0`;
- `failedEventCount = 0`;
- no `degraded` projection;
- every Session with at least two active members has a `ready` projection and
  exactly one `play_session` Conversation source.

A solo or cancelled Session may retain a `pending` projection because the
contract intentionally provisions group Conversation only when communication
is required. Do not treat `pendingProjectionCount > 0` alone as an incident.

Do not infer release health from mobile cache state or screenshots.

## Controlled rollback drill

Rollback is capability shutdown, never destructive migration reversal:

```sql
update private.party_session_config_v2
set creation_writes_enabled = false,
    mutation_writes_enabled = false,
    reconciliation_writes_enabled = false,
    reads_enabled = true,
    updated_at = now()
where singleton;
```

This stops new Party/Session side effects while preserving V1 discovery reads,
V2 Session/Set history, outbox events, command receipts, audits, conversation
projection receipts, Social consumed-event receipts and API E2E evidence.
Never dual-write or restore V1 Set mutation authority as an emergency fallback.
Never delete or rewrite membership, completion, dispute or block history.

During rollback, existing Session detail/history remains readable. Operational
staff may perform an explicitly reviewed safe terminal transition through a
separate narrowly enabled mutation window; do not leave broad mutation writes
enabled merely to cancel one Session.

Restore in this order: reads, reconciliation, mutation writes, creation writes.
After each step, re-run the API E2E and confirm no stale communication, overdue
ready check, due safety retry or invariant violation exists.
