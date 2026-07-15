const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/202607140058_core_v2_conversation_authority.sql',
);
const testPath = path.join(
  process.cwd(),
  'supabase/tests/database/conversation_authority_v2.test.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const databaseTest = fs.readFileSync(testPath, 'utf8');
const runbook = fs.readFileSync(
  path.join(process.cwd(), 'docs/runbooks/conversation-v2-rollout.md'),
  'utf8',
);
const failures = [];

function requireInvariant(condition, message) {
  if (!condition) failures.push(message);
}

function section(startNeedle, endNeedle) {
  const start = migration.indexOf(startNeedle);
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  requireInvariant(start >= 0, `missing section ${startNeedle}`);
  requireInvariant(end > start, `missing boundary ${endNeedle}`);
  return start >= 0 && end > start ? migration.slice(start, end) : '';
}

const direct = section(
  'create or replace function public.provision_direct_conversation_v2',
  'create or replace function public.provision_session_conversation_v2',
);
const session = section(
  'create or replace function public.provision_session_conversation_v2',
  'create or replace function public.reconcile_conversation_membership_v2',
);
const reconcile = section(
  'create or replace function public.reconcile_conversation_membership_v2',
  'create or replace function public.project_conversation_system_activity_v2',
);
const systemActivity = section(
  'create or replace function public.project_conversation_system_activity_v2',
  'create or replace function private.append_conversation_message_v2',
);
const systemActivityHotfix = fs.readFileSync(
  'supabase/migrations/202607142102_conversation_system_activity_deployed_fix_v2.sql',
  'utf8',
);
const send = section(
  'create or replace function private.append_conversation_message_v2',
  'create or replace function public.send_message_v2',
);
const read = section(
  'create or replace function public.advance_read_cursor_v2',
  'create or replace function private.set_conversation_mute_v2',
);
const relationshipEvent = section(
  'create or replace function public.consume_relationship_access_event_v2',
  'create or replace function private.acknowledge_session_conversation_v2',
);
const relationshipSnapshot = section(
  'create or replace function public.reconcile_relationship_conversation_v2',
  'create or replace function public.can_subscribe_conversation_v2',
);
const sessionConsumer = section(
  'create or replace function public.consume_session_conversation_event_v2',
  'alter table public.reports_v2',
);
const report = section(
  'create or replace function public.report_message_v2',
  'create or replace function public.acknowledge_message_delivery_v2',
);
const timeline = section(
  'create or replace function public.get_conversation_timeline_v2',
  'create or replace function public.can_subscribe_conversation_v2',
);

const publicTables = [
  'conversations_v2',
  'conversation_sources_v2',
  'conversation_members_v2',
  'messages_v2',
  'message_receipts_v2',
  'conversation_read_cursors_v2',
  'conversation_mutes_v2',
  'message_report_evidence_v2',
];
for (const table of publicTables) {
  requireInvariant(
    new RegExp(`create table public\\.${table}\\b`, 'i').test(migration),
    `missing canonical table public.${table}`,
  );
  requireInvariant(
    new RegExp(
      `alter table public\\.${table} enable row level security`,
      'i',
    ).test(migration),
    `${table} must enable RLS`,
  );
}

requireInvariant(
  (migration.match(/references public\.players\(id\)/gi) ?? []).length >= 9,
  'Conversation V2 identity columns must reference canonical PlayerId authority',
);
requireInvariant(
  !/create table public\.(?:players|profiles|player_profiles)/i.test(migration),
  'Conversation V2 must not create duplicate identity/profile authority',
);
requireInvariant(
  !/auth\.uid\(\)[\s\S]{0,120}(?:conversation|message|member)/i.test(migration),
  'Conversation aggregates must not use auth.uid() as PlayerId',
);
requireInvariant(
  /unique \(source_type, source_id\)/i.test(migration) &&
    /primary key \(player_low_id, player_high_id\)/i.test(migration),
  'source mapping and direct player pairs must be globally unique',
);
requireInvariant(
  /source_aggregate_version bigint/i.test(migration) &&
    /membership_version\s+bigint/i.test(migration) &&
    /acceptedSourceAggregateVersion/i.test(migration) &&
    /acceptedMembership/i.test(migration),
  'source aggregate and membership versions must remain independent in receipts',
);

for (const command of [
  'provision_direct_conversation_v2',
  'provision_session_conversation_v2',
  'send_message_v2',
  'send_media_message_v2',
  'advance_read_cursor_v2',
  'mute_conversation_v2',
  'unmute_conversation_v2',
  'reconcile_conversation_membership_v2',
  'tombstone_conversation_v2',
]) {
  requireInvariant(
    new RegExp(`create or replace function public\\.${command}\\b`, 'i').test(
      migration,
    ),
    `missing command ${command}`,
  );
}
requireInvariant(
  /begin_command_v1/i.test(migration) &&
    /finish_command_v1/i.test(migration) &&
    /conversation_service_command_receipts_v2/i.test(migration),
  'mutations must use durable user/service command receipts',
);
requireInvariant(
  /insert into private\.audit_logs/i.test(migration) &&
    /enqueue_contract_event_v2/i.test(migration),
  'mutations must publish audit metadata and versioned outbox events',
);
requireInvariant(
  /resolve_conversation_actor_v2\(false, true\)/i.test(migration) &&
    send.indexOf('select * into existing') <
      send.indexOf('assert_conversation_access_v2'),
  'committed message retries must replay after authentication but before current lifecycle/access checks',
);

requireInvariant(
  /unique \(conversation_id, sender_player_id, client_message_id\)/i.test(
    migration,
  ) &&
    /message_idempotency_conflict/i.test(send) &&
    /content_fingerprint is distinct from content_fingerprint_value/i.test(
      send,
    ),
  'clientMessageId must dedupe exact content and reject conflicting reuse',
);
requireInvariant(
  /from public\.conversations_v2[\s\S]*for update/i.test(send) &&
    send.indexOf('for update;') < send.indexOf('next_sequence :='),
  'message sequence allocation must follow the conversation row lock',
);
requireInvariant(
  /media\.visibility <> 'conversation_members'/i.test(send) &&
    /media\.purpose <> 'chat_attachment'/i.test(send) &&
    /media_owner_player_id is distinct from actor_player_id/i.test(send),
  'media sends must require private ready owned chat attachments',
);
requireInvariant(
  /insert into public\.conversation_read_cursors_v2[\s\S]*actor_player_id[\s\S]*next_sequence/i.test(
    send,
  ),
  'sending must advance the sender read cursor to prevent self-unread',
);
requireInvariant(
  /insert into public\.message_receipts_v2/i.test(send) &&
    /recipientPlayerIds/i.test(send),
  'message delivery recipients must be materialized independently of push policy',
);

requireInvariant(
  /read_cursor_version_conflict/i.test(read) &&
    /read_cursor_regression/i.test(read) &&
    /requested_sequence < cursor\.last_read_sequence/i.test(read),
  'read cursor must be optimistic and monotonic',
);
requireInvariant(
  /requested_sequence < cursor\.last_read_sequence/i.test(read) &&
    /set last_read_sequence = requested_sequence/i.test(read),
  'read advancement must reject regressions before assigning the requested cursor',
);
requireInvariant(
  /relationship_muted boolean/i.test(migration) &&
    /mutes\.muted or mutes\.relationship_muted/i.test(migration),
  'conversation mute and relationship mute must remain separate projections',
);

requireInvariant(
  /realtime\.broadcast_changes/i.test(migration) &&
    /can_subscribe_conversation_v2\(realtime\.topic\(\)\)/i.test(migration) &&
    /assert_conversation_feature_v2\('realtime'\)/i.test(migration),
  'realtime must be private, access-authorized, and rollback-gated',
);
requireInvariant(
  /source_event_id_value uuid/i.test(systemActivity) &&
    /messages\.source_event_id = source_event_id_value/i.test(systemActivity) &&
    /source_event_id,\s*source_event_type,\s*source_event_version,\s*correlation_id\s*\) values/i.test(
      systemActivity,
    ) &&
    !/messages\.source_event_id = source_event_id\s*;/i.test(systemActivity) &&
    !/messages\.source_event_id_value/i.test(systemActivity),
  'system activity must disambiguate local variables while preserving canonical message columns',
);
requireInvariant(
  /create or replace function public\.project_conversation_system_activity_v2/i.test(
    systemActivityHotfix,
  ) &&
    /messages\.source_event_id = source_event_id_value/i.test(
      systemActivityHotfix,
    ) &&
    !/messages\.source_event_id = source_event_id\s*;/i.test(
      systemActivityHotfix,
    ),
  'deployed Conversation hotfix must reapply the non-ambiguous system activity projector',
);
requireInvariant(
  /friendship\.accepted\.v2/i.test(relationshipEvent) &&
    /friendship-conversation:/i.test(relationshipEvent) &&
    /project_conversation_system_activity_v2/i.test(relationshipEvent),
  'friendship accepted must provision/bind a direct conversation and system activity',
);
requireInvariant(
  /player\.blocked\.v2/i.test(relationshipEvent) &&
    /conversation\.access_revoked\.v2/i.test(relationshipEvent) &&
    /can_view_conversation = false/i.test(relationshipEvent),
  'block must immediately revoke API/realtime/delivery projection',
);
requireInvariant(
  /player\.unblocked\.v2 never restores access/i.test(relationshipEvent) &&
    /conversation_relationship_versions_v2/i.test(relationshipEvent),
  'unblock must not restore without a same/newer full relationship snapshot',
);
requireInvariant(
  /canMessage/i.test(relationshipSnapshot) &&
    /canViewConversation/i.test(relationshipSnapshot) &&
    /access_reconciled/i.test(relationshipSnapshot),
  'full Senior 1 capabilities must control access restoration/revocation',
);
requireInvariant(
  /relationship\.snapshot\.v2/i.test(relationshipSnapshot) &&
    /event_replay_conflict/i.test(relationshipSnapshot),
  'relationship snapshot reconciliation must be replay-safe',
);

requireInvariant(
  /session\.created\.v2/i.test(sessionConsumer) &&
    /session\.member_joined\.v2/i.test(sessionConsumer) &&
    /session\.member_left\.v2/i.test(sessionConsumer),
  'session events must drive provisioning and membership reconciliation',
);
requireInvariant(
  /play_session_membership_snapshot_v2/i.test(session) &&
    /accepted_membership is distinct from current_membership/i.test(session),
  'session provisioning must validate the exact supplier membership snapshot',
);
requireInvariant(
  /session_conversation_membership_projection_v2/i.test(reconcile) &&
    /true,[\s\n]*source_aggregate_version_value,[\s\n]*accepted_membership/i.test(
      reconcile,
    ),
  'same session aggregate/membership facts must return an idempotent receipt',
);
requireInvariant(
  /to_regprocedure\([\s\S]*record_session_conversation_projection_v2/i.test(
    migration,
  ) &&
    /acknowledgementPending/i.test(migration) &&
    /acknowledgementPending[\s\S]*acknowledge_session_conversation_v2/i.test(
      sessionConsumer,
    ),
  'session acknowledgement must be order-safe and retry when the supplier RPC becomes available',
);

requireInvariant(
  /conversation_v2_id uuid references public\.conversations_v2/i.test(
    migration,
  ) && /message_v2_id uuid references public\.messages_v2/i.test(migration),
  'Senior 1 report authority must retain explicit V1 and V2 message targets',
);
requireInvariant(
  /insert into public\.message_report_evidence_v2/i.test(report) &&
    /message_report_evidence_v2_immutable/i.test(migration),
  'V2 message reports must capture immutable content evidence transactionally',
);
requireInvariant(
  /is_conversation_player_member_v1/i.test(report) &&
    /conversationSchemaVersion/i.test(report),
  'report_message_v2 must preserve the V1 compatibility path',
);
requireInvariant(
  /current or historical conversation member/i.test(migration) &&
    /capture_message_report_evidence_v2/i.test(migration),
  'evidence retry must remain available after access revocation without granting public history access',
);

requireInvariant(
  /legacy_conversation_id uuid unique references public\.conversations/i.test(
    migration,
  ) &&
    /insert into public\.conversations_v2[\s\S]*from public\.conversations/i.test(
      migration,
    ),
  'V1 direct conversations must be mapped additively',
);
requireInvariant(
  /from public\.messages legacy/i.test(timeline) &&
    /from public\.messages_v2 messages/i.test(timeline),
  'V2 timeline must union legacy and V2 history',
);
requireInvariant(
  !/insert into public\.messages_v2\s*\([^;]+?\)\s*select\b/i.test(migration),
  'migration must not rewrite/copy V1 message history',
);
requireInvariant(
  /conversation_authority_config_v2/i.test(migration) &&
    /notifications_enabled boolean not null default false/i.test(migration) &&
    /shadow_inbox_enabled boolean not null default true/i.test(migration),
  'rollback/cutover flags must keep notifications disabled until S4 and shadow reads enabled',
);
requireInvariant(
  /revoke execute on function public\.provision_session_conversation_v2\(jsonb\)[\s\S]*grant execute[\s\S]*service_role/i.test(
    migration,
  ) &&
    /grant execute on function public\.send_message_v2\(jsonb\) to authenticated/i.test(
      migration,
    ),
  'service provisioning and authenticated messaging privileges must be separated',
);

requireInvariant(
  /provisioning_enabled = false/.test(runbook) &&
    /writes_enabled = false/.test(runbook) &&
    /realtime_enabled = false/.test(runbook) &&
    /notifications_enabled = false/.test(runbook) &&
    /reads_enabled = true/.test(runbook) &&
    /Never delete or rewrite/.test(runbook),
  'rollback runbook must preserve readable history while disabling new V2 side effects',
);

for (const forbidden of [
  /versionversion/i,
  /source_id\s*=\s*source_id(?!_)/i,
  /membership_version\s*=\s*membership_version(?:\s|,|;)/i,
  /set\s+response\s*=\s*response(?:\s|,|;)/i,
  /language plpgsql\s+language plpgsql/i,
]) {
  requireInvariant(
    !forbidden.test(migration),
    `migration contains forbidden ambiguity ${forbidden}`,
  );
}

const assertionCount = (
  databaseTest.match(
    /select\s+(?:is|ok|isnt|throws_ok|lives_ok|has_table|has_column|col_is_fk|has_function|has_index|has_policy)\s*\(/gi,
  ) ?? []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);

const migrations = new Set(
  fs
    .readdirSync(path.join(process.cwd(), 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql')),
);
const requiredMigrationSequence = [
  '202607140054_core_v2_party_play_session_foundation.sql',
  '202607140055_friendship_command_authority_v2.sql',
  '202607140056_social_safety_command_authority_v2.sql',
  '202607140057_social_privacy_report_authority_v2.sql',
  '202607140058_core_v2_conversation_authority.sql',
];
requireInvariant(
  requiredMigrationSequence.every((name) => migrations.has(name)),
  'Conversation migration 058 must use the agreed exact party/social sequence 054-057',
);

if (failures.length) {
  console.error(
    `Conversation Authority v2 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}
console.log(
  `Conversation Authority v2 check passed with migration, ${plannedCount} pgTAP assertions, V1 compatibility, and provider/consumer authority invariants.`,
);
