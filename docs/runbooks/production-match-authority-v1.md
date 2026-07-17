# Production Match Authority v1 rollout

> Integrated primary note: use `docs/runbooks/primary-production-integration-v1.md` for the canonical migration boundary, cross-domain deployment order, and release evidence. Before claiming staging or production behavior, complete `docs/runbooks/mobile-backend-environment-parity.md` on that exact project; E2E project results are not transferable.

## Expansion

Apply additive migrations through `202607140009`. Keep global and cohort
capabilities disabled. Existing matches remain readable; authoritative events are
never deleted during rollback.

## Cohort progression

Use the service role only:

1. Enable `readsEnabled` for internal accounts and compare candidate eligibility.
2. Enable `intentWritesEnabled` for the same cohort.
3. Enable `decisionWritesEnabled` only after conversation and notification
   consumers accept the published fixtures.
4. Promote global reads, then global intent writes, then global decisions.

`configure_match_authority_cohort_v1` changes one account atomically. The three
capabilities are independent by design.

## Emergency stop

`set_match_authority_emergency_stop_v1(true)` disables authoritative reads and
new writes immediately, including enabled cohorts. It does not delete Match
Intents, matches, command receipts, conversations, or outbox events.

After the first authoritative match, `record_swipe` remains permanently unable
to create a second semantic match path. Recovery resumes the authoritative
engine; it never rolls production writes back to legacy matching.

## Verification

Read the effective state with `get_match_authority_rollout_v1(account_id)` using
the service role. Before enabling decisions, verify:

- lifecycle provider calls succeed;
- candidate snapshots have no duplicates;
- command receipts replay consistently;
- `conversation.bootstrap_requested.v1` has an active consumer;
- `conversation.created.v1` advances Home to `conversation_ready`;
- pending outbox age is within the agreed SLO.

## Operational metrics

Call `get_match_funnel_metrics_v1(window_minutes)` with the service role. The
result includes funnel transition counts, p95 duration for
`record_player_decision_v1` from durable command receipts, and pending
`match.created.v1` / `conversation.bootstrap_requested.v1` outbox age.

Alert before decision cutover when:

- pending bootstrap age exceeds the agreed event-lag SLO;
- match-created and conversation-ready counts diverge unexpectedly;
- like command p95 exceeds the command SLO;
- duplicate telemetry constraints or authoritative match uniqueness fail.
