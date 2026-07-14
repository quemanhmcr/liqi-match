# Conversation V2 rollout and rollback

Owner: Senior 3 — Conversation and Live Coordination

## Migration order

Apply the authority chain in order:

1. `202607140054_core_v2_party_play_session_foundation.sql`
2. `202607140055_friendship_command_authority_v2.sql`
3. `202607140056_social_safety_command_authority_v2.sql`
4. `202607140057_social_privacy_report_authority_v2.sql`
5. `202607140058_core_v2_conversation_authority.sql`
6. `202607141200_core_v2_play_session_walking_skeleton.sql`
7. `202607141210_core_v2_match_set_commands.sql`
8. `202607141220_core_v2_match_set_membership.sql`
9. `202607141230_core_v2_play_session_commands.sql`
10. `202607141300_core_v2_party_session_transport_alignment.sql`
11. `202607141320_conversation_report_evidence_contract_v2.sql`
12. `202607141330_conversation_mobile_surface_v2.sql`
13. `202607141331_conversation_access_realtime_v2.sql`

Migration 058 is additive. It maps V1 direct conversations by the same UUID and
projects V1 timeline rows at read time. It does not copy or rewrite legacy
messages or cursors.

## Rollout controls

The Expo client gate `EXPO_PUBLIC_CONVERSATION_V2_ENABLED` defaults to `false`.
Only `true`, `1`, or `yes` enable V2; invalid values fail startup configuration
instead of silently selecting an authority. Repository and transport switch
atomically, so the UI cannot read from V2 while sending to V1 or vice versa.

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
3. Enable the Expo V2 gate only for internal accounts after migrations 1200–1331
   are applied and the Session projection acknowledgement reports `ready`.
4. Validate send, delivery, read cursor, membership add/remove, account switch,
   offline retry, and reconnect on two physical devices.
5. Confirm both private topics are authorized: `conversation-v2:<ConversationId>`
   for messages and `conversation-v2-access:<ConversationId>:<PlayerId>` for
   targeted membership/lifecycle revocation.
6. Enable broad V2 writes while retaining V1 direct timeline projection.
7. Enable notification production only after the Senior 4 checkpoint.

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
- account switching removes both private channels and clears aggregate/cursor
  caches before the next send;
- an open screen receives targeted access revocation even after message-channel
  authorization is removed;
- Session-created/member events acknowledge the exact aggregate and membership
  versions through `record_session_conversation_projection_v2`;
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

Also set `EXPO_PUBLIC_CONVERSATION_V2_ENABLED=false` for the next client
configuration rollout. This stops new V2 conversations and writes, disables
realtime and notification production, and leaves existing V2/V1-compatible
conversations readable through controlled polling. Event consumers and membership reconciliation remain
replayable after re-enable.

After mitigation, re-enable one capability at a time. Never delete or rewrite
message, cursor, command-receipt, consumed-event, or report-evidence history as a
rollback mechanism.
