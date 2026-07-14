# Conversation V2 rollout and rollback

Owner: Senior 3 — Conversation and Live Coordination

## Migration order

Apply the authority chain in order:

1. `202607140054_core_v2_party_play_session_foundation.sql`
2. `202607140055_friendship_command_authority_v2.sql`
3. `202607140056_social_safety_command_authority_v2.sql`
4. `202607140057_social_privacy_report_authority_v2.sql`
5. `202607140058_core_v2_conversation_authority.sql`

Migration 058 is additive. It maps V1 direct conversations by the same UUID and
projects V1 timeline rows at read time. It does not copy or rewrite legacy
messages or cursors.

## Rollout controls

`private.conversation_authority_config_v2` owns independent capability flags:

- `reads_enabled`
- `writes_enabled`
- `provisioning_enabled`
- `realtime_enabled`
- `notifications_enabled`
- `shadow_inbox_enabled`

Initial state keeps reads, writes, provisioning, realtime, and shadow comparison
enabled. Notification production remains disabled until Senior 4's republished
producer/consumer migration is integrated and its correlation tests pass.

Recommended rollout:

1. Compare V1 and V2 direct inbox facts with `shadow_inbox_enabled = true`.
2. Enable session/group provisioning for internal accounts.
3. Validate send, delivery, read cursor, membership add/remove, and reconnect on
   two physical devices.
4. Enable broad V2 writes while retaining V1 direct timeline projection.
5. Enable notification production only after the Senior 4 checkpoint.

## Operational evidence

Track `private.conversation_authority_metrics_v2` and outbox processing for:

- message send success rate;
- duplicate message conflicts;
- send-to-realtime latency;
- membership revocation latency;
- session provisioning eventual success;
- report evidence capture failures;
- account-switch/session authorization failures.

A release gate must verify:

- removed or blocked members cannot fetch, send, subscribe, or receive push;
- membership revocation is observed within five seconds;
- sender `clientMessageId` retries do not create another message;
- read cursors never regress;
- token refresh is used by RPC and realtime;
- V1 direct history remains readable;
- evidence capture remains retryable after access revocation.

## Controlled rollback

Rollback does not drop tables, events, messages, receipts, or cursors. Apply:

```sql
update private.conversation_authority_config_v2
set provisioning_enabled = false,
    writes_enabled = false,
    realtime_enabled = false,
    notifications_enabled = false,
    reads_enabled = true,
    shadow_inbox_enabled = true,
    updated_at = now()
where singleton;
```

This stops new V2 conversations and writes, disables realtime and notification
production, and leaves existing V2/V1-compatible conversations readable through
controlled polling. Event consumers and membership reconciliation remain
replayable after re-enable.

After mitigation, re-enable one capability at a time. Never delete or rewrite
message, cursor, command-receipt, consumed-event, or report-evidence history as a
rollback mechanism.
