# Session Conversation dispatch staging evidence — 2026-07-17

Status: project-scoped staging evidence. This document is not transferable to
another Supabase project or environment.

## Target

- Supabase project: `liqi-match-staging`
- Project ref: `wngumhizuxtlhavbpxzy`
- Applied migrations:
  - `202607170103_session_conversation_dispatch_runtime_v2.sql`
  - `202607170104_session_conversation_dispatch_ordering_v2.sql`

## Root cause and repair

The canonical `consume_session_conversation_event_v2` consumer and replay ledger
already existed, but no Cron dispatcher delivered Session outbox events to it.
The first dispatcher proof also exposed a same-transaction ordering race:
`session.created.v2` and `session.member_joined.v2` can share `created_at`, so UUID
order could process aggregate version 2 before version 1. Migration `170104`
orders by event-envelope `aggregateVersion` before wall clock and UUID.

## Executable evidence

- Isolated E2E project: 9 Party/Session suites, 280 assertions, all pass.
- Staging dispatcher suite: 31 assertions, all pass and rollback-only.
- Staging Cron schedule: `session-conversation-events-v2`, every 5 seconds.
- Five observed Cron runs: `succeeded`.
- Pre-deployment backlog: 3 supported Session events.
- Post-deployment backlog: 0 pending, 0 due, 0 failed.
- Manual dispatcher replay 1: attempted 0, processed 0, failed 0.
- Manual dispatcher replay 2: attempted 0, processed 0, failed 0.
- Existing solo/cancelled Session projections remained `pending` with no
  Conversation source, matching the contract that solo Sessions do not require
  group communication.

## Required interpretation

A `pending` communication projection is healthy for a Session with fewer than
two active members. Once a second member joins, the `session.member_joined.v2`
event requires provisioning and the projection must converge to `ready` with one
canonical Conversation ID. Release monitoring must use
`get_session_conversation_dispatch_health_v2()` plus member-count-aware
projection checks, not `pendingProjectionCount` in isolation.
