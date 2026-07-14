# Conversation Reliability v1 operations

## Deployment prerequisite

Enable the Supabase Cron Postgres Module (`pg_cron`) before applying migration
`202607140011_conversation_bootstrap_dispatch_v1.sql`. The migration fails with
`detail=pg_cron_required` when the module is absent; it must never silently
complete without a production bootstrap dispatcher.

## Dispatcher

The named job `conversation-bootstrap-v1` runs every five seconds and calls:

```sql
select public.dispatch_conversation_bootstraps_v1(100);
```

The dispatcher checks `conversation_authority_config_v1.bootstrap_enabled`, then
drains replay-safe `conversation.bootstrap_requested.v1` events using row locks
and `skip locked`. Match creation remains independent: a consumer failure cannot
rollback the match transaction. The existing funnel metrics expose pending
bootstrap count, retry count, and oldest pending age.

## Cutover flags

Migration `011` enables bootstrap, reads, writes, private Realtime, and image
messages. Direct message inserts remain revoked. Authoritative message writes
must never roll back to the simulation/local store.

## Rollback

Disable ingestion first:

```sql
update private.conversation_authority_config_v1
set bootstrap_enabled = false,
    realtime_enabled = false,
    image_messages_enabled = false,
    updated_at = now()
where singleton;
```

This stops new bootstrap drains, falls back from Realtime to query recovery, and
keeps text history/read state authoritative. To pause the scheduler itself:

```sql
select cron.alter_job(
  (select jobid from cron.job where jobname = 'conversation-bootstrap-v1'),
  active => false
);
```

Re-enable the same named job after remediation. Do not schedule a second job or
dual-write messages to a legacy store.

## Health checks

Use `public.get_match_funnel_metrics_v1()` with service role. Alert on:

- `bootstrap.pendingCount > 0` with increasing `oldestPendingAgeSeconds`;
- `bootstrap.retryCount > 0` sustained across intervals;
- `matchCreatedCount > conversationReadyCount` outside the five-second dispatch
  window plus normal transaction time.
