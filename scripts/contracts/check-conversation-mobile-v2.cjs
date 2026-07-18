const fs = require('node:fs');
const path = require('node:path');

const migrationName = '202607141330_conversation_mobile_surface_v2.sql';
const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations', migrationName),
  'utf8',
);
const accessMigrationName = '202607141331_conversation_access_realtime_v2.sql';
const accessMigration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations', accessMigrationName),
  'utf8',
);
const adapter = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/features/messages/services/supabase-conversation-v2-adapter.ts',
  ),
  'utf8',
);
const codec = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/features/messages/services/supabase-conversation-v2-codec.ts',
  ),
  'utf8',
);
const composition = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/app-shell/runtime/create-application-services.ts',
  ),
  'utf8',
);
const rollout = fs.readFileSync(
  path.join(process.cwd(), 'src/shared/config/conversation-v2-rollout.ts'),
  'utf8',
);
const databaseTest = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/tests/database/conversation_mobile_surface_v2.test.sql',
  ),
  'utf8',
);
const nativeTest = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/features/messages/__tests__/supabase-conversation-v2-adapter.native.test.ts',
  ),
  'utf8',
);
const failures = [];

function requireInvariant(condition, message) {
  if (!condition) failures.push(message);
}

for (const fn of [
  'private.conversation_participant_surface_json_v2',
  'private.conversation_latest_message_json_v2',
  'private.conversation_first_unread_message_id_v2',
  'private.conversation_mobile_surface_json_v2',
  'public.get_conversation_mobile_surface_v2',
  'public.list_conversation_mobile_inbox_v2',
]) {
  requireInvariant(
    new RegExp(
      `create or replace function ${fn.replace('.', '\\.')}`,
      'i',
    ).test(migration),
    `missing mobile surface function ${fn}`,
  );
}

requireInvariant(
  !/create table|create type|alter table/i.test(migration),
  'mobile surface migration must remain read-only and additive',
);
requireInvariant(
  /from public\.players players/i.test(migration) &&
    /from public\.player_profiles_v1 profiles/i.test(migration) &&
    /from public\.profiles profiles/i.test(migration),
  'participant display must join canonical PlayerId/profile mapping and use legacy profile only for presentation',
);
requireInvariant(
  /lifecycle_state = 'deleted'[\s\S]*Người chơi đã xóa/i.test(migration) &&
    /visibility = 'public'/i.test(migration) &&
    /moderation_status = 'approved'/i.test(migration),
  'deleted players and avatar visibility/moderation must fail closed',
);
requireInvariant(
  /assert_conversation_access_v2\([\s\S]*'read'/i.test(migration) &&
    /members\.state = 'active'/i.test(migration) &&
    /members\.can_view_conversation/i.test(migration),
  'mobile surface must require authoritative read access and expose only active visible members',
);
requireInvariant(
  /from public\.messages_v2 messages/i.test(migration) &&
    /from public\.messages legacy/i.test(migration) &&
    /union all/i.test(migration),
  'latest/unread projection must union V1 and V2 history',
);
requireInvariant(
  !/insert into public\.messages_v2|update public\.messages|delete from public\.messages/i.test(
    migration,
  ),
  'mobile surface must never copy, rewrite, or delete message history',
);
requireInvariant(
  /limit safe_limit \+ 1/i.test(migration) &&
    /limit safe_limit/i.test(migration) &&
    /array_agg\(retained\.updated_at[\s\S]*\)\[safe_limit\]/i.test(migration) &&
    /array_agg\(retained\.id[\s\S]*\)\[safe_limit\]/i.test(migration),
  'inbox keyset cursor must be derived from the final retained item without skipping the next page',
);
requireInvariant(
  /grant execute on function public\.get_conversation_mobile_surface_v2\(uuid\)[\s\S]*authenticated/i.test(
    migration,
  ) &&
    /grant execute on function public\.list_conversation_mobile_inbox_v2\(integer,timestamptz,uuid\)[\s\S]*authenticated/i.test(
      migration,
    ) &&
    /revoke execute[\s\S]*from public, anon/i.test(migration),
  'mobile read RPCs must be authenticated-only',
);

requireInvariant(
  /create or replace function public\.can_subscribe_conversation_access_v2/i.test(
    accessMigration,
  ) &&
    /conversation-v2-access:/i.test(accessMigration) &&
    /topic_player_id/i.test(accessMigration),
  'targeted access realtime must authorize only the authenticated PlayerId own topic',
);
requireInvariant(
  /conversation_members_access_broadcast_v2/i.test(accessMigration) &&
    /conversations_state_access_broadcast_v2/i.test(accessMigration) &&
    /players_conversation_access_broadcast_v2/i.test(accessMigration),
  'membership, tombstone, lifecycle and messaging changes must emit targeted access signals',
);
requireInvariant(
  /Conversation V2 members receive own access changes/i.test(accessMigration) &&
    /public\.can_subscribe_conversation_access_v2\(realtime\.topic\(\)\)/i.test(
      accessMigration,
    ),
  'targeted access broadcast policy must remain private and player-scoped',
);
requireInvariant(
  !/payload|message\.content|messages_v2/i.test(accessMigration),
  'targeted access realtime must not leak message payloads or history',
);

requireInvariant(
  /list_conversation_mobile_inbox_v2/.test(adapter) &&
    /get_conversation_mobile_surface_v2/.test(adapter) &&
    /get_conversation_timeline_v2/.test(adapter),
  'mobile adapter must consume only the canonical V2 read RPCs',
);
requireInvariant(
  /commandMetadata\([\s\S]{0,180}aggregateVersion/.test(adapter) &&
    /commandMetadata\([\s\S]{0,180}cursorVersion/.test(adapter) &&
    /CoreV2CommandMetadataSchema\.parse/.test(codec) &&
    /expectedAggregateVersion/.test(codec) &&
    /stableCommandKey/.test(adapter) &&
    /stableUuid\(identity\)[\s\S]{0,80}version/.test(codec),
  'send/read commands must carry exact optimistic versions and stable retry identity',
);
requireInvariant(
  /surfaceByConversation\.clear\(\)/.test(adapter) &&
    /removeAllChannels\(\)/.test(adapter) &&
    /conversationSessionIdentity/.test(adapter),
  'account changes must clear authority caches and private channels',
);
requireInvariant(
  /conversation-v2:\$\{conversationId\}/.test(adapter) &&
    /conversation-v2-access:\$\{conversationId\}:\$\{surface\.viewer\.playerId\}/.test(
      adapter,
    ) &&
    /access\.changed/.test(adapter) &&
    /config: \{ private: true \}/.test(adapter) &&
    /get_conversation_mobile_surface_v2[\s\S]*message\.changed/.test(adapter),
  'private realtime must revalidate server access around message signals',
);
requireInvariant(
  /capture_message_report_evidence_v2/.test(adapter) &&
    /MessageReportEvidenceV2Schema/.test(adapter),
  'mobile adapter must expose exact immutable report evidence',
);
requireInvariant(
  /isConversationV2Enabled/.test(composition) &&
    /createSupabaseConversationV2Adapter/.test(composition) &&
    /messageRepository: messages[\s\S]*messageTransport: messages/.test(
      composition,
    ),
  'composition must switch repository and transport atomically',
);
requireInvariant(
  /false/.test(rollout) && /must be true\/false/.test(rollout),
  'rollout must default off and reject ambiguous values',
);
requireInvariant(
  /preflights the new account instead of reusing aggregate caches/.test(
    nativeTest,
  ) && /revalidates private realtime access/.test(nativeTest),
  'native contract tests must cover account isolation and realtime reauthorization',
);

const assertionCount = (
  databaseTest.match(
    /select\s+(?:is|ok|isnt|throws_ok|lives_ok|has_table|has_column|col_is_fk|has_function|has_index|has_policy|has_trigger)\s*\(/gi,
  ) ?? []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);

const migrations = fs
  .readdirSync(path.join(process.cwd(), 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
requireInvariant(
  migrations.includes(migrationName) &&
    migrations.indexOf(migrationName) >
      migrations.indexOf(
        '202607141320_conversation_report_evidence_contract_v2.sql',
      ),
  'mobile surface/access migrations must follow the known supplier sequence through 1320 and remain monotonic',
);

if (failures.length) {
  console.error(
    `Conversation mobile V2 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}
console.log(
  `Conversation mobile V2 check passed with ${plannedCount} pgTAP assertions and mobile authority invariants.`,
);
