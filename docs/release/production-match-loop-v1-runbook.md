# Production Match Loop v1 — Release and Rollback Runbook

> Primary integration note: this release runbook complements `docs/runbooks/primary-production-integration-v1.md`. Source validation does not imply that migrations, Edge Functions, Cron jobs, or push credentials have been deployed.

## Authority and scope

The database projection `get_return_loop_release_readiness_v1()` is the release authority. A dashboard, client screenshot, simulation run, or document checkbox cannot override `ready=false`.

This runbook covers Home, notification inbox, push, deep links, feature cohorts, observability, API-mode acceptance and rollback. Player lifecycle, Match creation, message persistence and conversation unread semantics remain provider-owned.

## Preconditions

1. The collision-free primary migration chain `202607140001` through `202607140041` has been applied in filename order and `npm run migration-history:check` is green.
2. `npm run task:check` is green.
3. Missions 1–3 have published their provider contract fixtures and real events.
4. Two real-device test accounts exist with distinct AccountId, PlayerId and ProfileId values.
5. Expo project ID, push credentials and worker secret are configured in the deployment secret store.
6. The operator, not the assistant, runs any required native build or prebuild and records its result.

## API-mode acceptance

The upstream setup must complete secure login, activate both players, create
mutual intent exactly once, and create one Match. The production Conversation
bootstrap dispatcher runs every five seconds, so Supabase Cron must be enabled.
The runner allows at least one dispatch interval plus normal transaction time
and polls Home until the canonical MatchId maps to the expected ConversationId.
It then sends the message itself.

```bash
npm run e2e:return-loop:api
```

Required environment:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RETURN_LOOP_E2E_ACCESS_TOKEN_A`
- `RETURN_LOOP_E2E_ACCESS_TOKEN_B`
- `RETURN_LOOP_E2E_MATCH_ID`
- `RETURN_LOOP_E2E_CONVERSATION_ID`

Optional diagnostic assertions:

- `RETURN_LOOP_E2E_RECIPIENT_PLAYER_ID`
- `RETURN_LOOP_E2E_NOTIFICATION_ID`
- `RETURN_LOOP_E2E_SOURCE_EVENT_ID`
- `RETURN_LOOP_E2E_PUSH_OBSERVED=true` only after a provider ticket/receipt or
  real-device receipt is observed.

The runner fails unless:

- both authenticated principals have distinct AccountId, PlayerId and ProfileId;
- Home eventually exposes the expected Match and canonical Conversation;
- device A sends a text message and an exact retry returns the same MessageId
  and sequence;
- device B timeline contains that MessageId exactly once;
- Home receives authoritative unread state and the inbox receives exactly one
  new message notification;
- the persisted deep link resolves to the expected ConversationId;
- device B advances the read watermark and an exact retry is idempotent;
- a new client process restores the message, zero unread state, read watermark
  and notification read state;
- retrying the resolver creates no duplicate source EventId;
- the service-role E2E evidence record succeeds.

## Readiness gate

Query as an operator/service role:

```sql
select public.get_return_loop_release_readiness_v1(interval '24 hours');
```

Do not advance a cohort unless `ready=true`. Review all projected checks and raw metrics. Required invariants include zero duplicate notifications, deep-link success at or above 99% when traffic exists, no stale push backlog, observed push-provider outcomes and a passing API-mode E2E run within 24 hours.

## Cohort rollout

Use small additive steps and hold each step long enough to observe the configured SLO window:

1. Internal accounts only; Home shadow read, inbox and deep links enabled, push disabled.
2. 1% cohort; enable push after ticket/receipt telemetry is visible.
3. 10% cohort.
4. 25% cohort.
5. 50% cohort.
6. 100% cohort.

At every step, compare server Home facts with the legacy display only for diagnosis. Never copy synthetic unread, online status or index-derived match kind into authoritative storage.

## Kill-switch hierarchy

`core_loop_enabled` is the master switch. It dominates Home, inbox, push and deep-link cohort flags. Capability switches remain independently operable for partial rollback.

Preferred rollback order:

1. Disable push claims.
2. Disable deep-link routing.
3. Disable inbox UI/API cohort.
4. Return Home to the minimal safe dashboard.
5. Disable the master core-loop switch only for cross-capability or identity incidents.

Disabling transport or UI must not fail producer domain commands.

## Push incident rollback

- Set the push capability off. Pending jobs remain persisted.
- Do not delete notifications, delivery rows or device ownership rows.
- Correct provider credentials, token handling or worker code.
- Re-enable a small cohort and replay claimable jobs before increasing rollout.
- `DeviceNotRegistered` must disable only the affected device token.

## Deep-link incident rollback

- Disable deep links independently.
- Pending notification intents fall back safely; persisted notifications remain readable in the inbox.
- Repair resolver target logic or auth gating.
- Re-run API-mode acceptance, then restore the cohort.

## Home incident rollback

- Disable authoritative Home read for the affected cohort and show the minimal safe dashboard.
- Never restore synthetic unread, online state or array-index semantics.
- Inbox, push and persisted notifications may stay enabled if their checks remain healthy.

## Event-consumer incident

- Stop the affected Return Loop consumer without rejecting producer commands.
- Preserve shared outbox rows; each consumer resumes from its own EventId receipt and must not claim another consumer's status.
- Preserve notification uniqueness by source EventId.
- Deploy the fix, replay the outbox and verify duplicate count remains zero.

## Rollback drill evidence

A completed drill records:

- the switch changed;
- producer commands continued succeeding;
- persisted notifications remained present;
- push backlog was recoverable;
- deep links fell back safely;
- Home returned a safe server-owned state;
- replay produced no duplicate source EventId;
- API-mode acceptance passed after restoration.

Release approval is invalid without this evidence and a fresh readiness projection.
