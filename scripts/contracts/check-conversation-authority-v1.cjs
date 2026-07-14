const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607140006_conversation_reliability_v1.sql';
const testPath = 'supabase/tests/database/conversation_reliability_v1.test.sql';
const mobileSurfacePath =
  'supabase/migrations/202607140008_conversation_mobile_surface_v1.sql';
const accountDeletePath = 'supabase/functions/account-delete/handler.ts';
const migration = fs.readFileSync(migrationPath, 'utf8');
const mobileSurface = fs.existsSync(mobileSurfacePath)
  ? fs.readFileSync(mobileSurfacePath, 'utf8')
  : '';
const databaseTest = fs.existsSync(testPath)
  ? fs.readFileSync(testPath, 'utf8')
  : '';
const accountDelete = fs.existsSync(accountDeletePath)
  ? fs.readFileSync(accountDeletePath, 'utf8')
  : '';
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

const bootstrap = section(
  'create or replace function private.consume_conversation_bootstrap_event_v1',
  'create or replace function public.consume_conversation_bootstrap_event_v1',
);
const send = section(
  'create or replace function public.send_message_v1',
  'create or replace function public.advance_conversation_read_v1',
);
const read = section(
  'create or replace function public.advance_conversation_read_v1',
  'create or replace function public.get_conversation_inbox_v1',
);
const timeline = section(
  'create or replace function public.get_conversation_timeline_v1',
  'create or replace function public.get_conversation_read_state_v1',
);

requireInvariant(
  !/create\s+table\s+(?:public\.)?(?:messages_v1|conversation_messages_v1)/i.test(
    migration,
  ),
  'Conversation v1 must expand the canonical messages table, not create a second store',
);
requireInvariant(
  /create table public\.conversation_participants_v1/i.test(migration) &&
    /references public\.players\(id\)/i.test(migration) &&
    /references public\.player_profiles_v1\(id\)/i.test(migration),
  'participant authority must persist canonical PlayerId and ProfileId independently of legacy profiles',
);
requireInvariant(
  /foreign key \(sender_id\) references public\.profiles\(id\) on delete set null/i.test(
    migration,
  ),
  'legacy profile deletion must not cascade-delete canonical messages',
);
requireInvariant(
  /public\.get_authenticated_player_v1\(\)/i.test(migration),
  'authenticated Conversation commands must consume Mission 1 principal authority',
);
requireInvariant(
  /create unique index conversations?_?.*|conversations_match_id_key/i.test(
    migration,
  ) || /on conflict \(match_id\)/i.test(bootstrap),
  'bootstrap must rely on canonical match-to-conversation uniqueness',
);
requireInvariant(
  /from private\.outbox_events/i.test(bootstrap) &&
    /event_type = 'conversation\.bootstrap_requested\.v1'/i.test(bootstrap),
  'bootstrap must consume the authoritative outbox contract',
);
requireInvariant(
  !/relationship_decisions_v1|\bswipes\b/i.test(bootstrap),
  'bootstrap must not derive conversation existence from relationship/swipe tables',
);
requireInvariant(
  /from public\.matches[\s\S]*for update/i.test(bootstrap),
  'bootstrap must serialize by locking the authoritative match row',
);
requireInvariant(
  /conversation_bootstrap_receipts_v1/i.test(bootstrap) &&
    /request_fingerprint/i.test(bootstrap),
  'bootstrap retry/conflict semantics must be receipt-backed',
);
requireInvariant(
  /'conversation\.created\.v1'/i.test(bootstrap) &&
    /apply_conversation_created_projection_v1/i.test(bootstrap),
  'successful bootstrap must emit conversation.created.v1 and invoke the Match projection seam',
);
requireInvariant(
  !/update public\.matches[\s\S]*home_status_v1 = 'conversation_ready'/i.test(
    bootstrap,
  ),
  'Conversation bootstrap must not mutate Mission 2 Home status directly',
);
requireInvariant(
  /messages_client_id_v1_key/i.test(migration) &&
    /conversation_id,[\s\n]*sender_player_id_v1,[\s\n]*client_message_id_v1/i.test(
      migration,
    ),
  'message idempotency must be scoped by conversation, sender PlayerId and clientMessageId',
);
requireInvariant(
  /messages_sequence_v1_key/i.test(migration),
  'message sequence must be unique per conversation',
);
requireInvariant(
  send.indexOf('select * into existing_message') <
    send.indexOf('require_authenticated_messaging_snapshot_v1(true)') &&
    send.indexOf('select * into existing_message') <
      send.indexOf('conversation_writes_enabled_v1'),
  'committed send retries must replay by authenticated PlayerId before rollout or lifecycle enforcement',
);
requireInvariant(
  send.indexOf('select * into existing_message') <
    send.indexOf('image_messages_enabled_v1'),
  'committed image retries must replay before the image-message rollout flag',
);
requireInvariant(
  /from public\.conversations[\s\S]*for update/i.test(send) &&
    send.indexOf('for update;') < send.indexOf('next_sequence :='),
  'sequence allocation must happen after the conversation row lock',
);
requireInvariant(
  /request_fingerprint_v1 is distinct from request_fingerprint/i.test(send),
  'same clientMessageId with conflicting content must be rejected',
);
requireInvariant(
  /assert_messaging_allowed_v1/i.test(send) &&
    /messagingAllowed/i.test(migration),
  'send authorization must consume authoritative messagingAllowed',
);
requireInvariant(
  /content_kind = 'media'[\s\S]*chat_attachment[\s\S]*conversation_members/i.test(
    send,
  ),
  'media messages must validate authoritative chat attachment ownership/readiness',
);
requireInvariant(
  /'message\.sent\.v1'/i.test(send) &&
    /'notification\.requested\.v1'/i.test(send),
  'send must publish message and attention events transactionally',
);
requireInvariant(
  /greatest\(|p_last_read_sequence <= member\.last_read_sequence/i.test(read),
  'read watermark must be monotonic and repeated advances idempotent',
);
requireInvariant(
  /message\.sequence_v1 > p_after_sequence/i.test(timeline) &&
    /order by message\.sequence_v1/i.test(timeline),
  'timeline must expose ordered afterSequence gap recovery',
);
requireInvariant(
  /realtime\.broadcast_changes/i.test(migration) &&
    /public\.can_subscribe_conversation_v1\(realtime\.topic\(\)\)/i.test(
      migration,
    ) &&
    /can_subscribe_conversation_v1[\s\S]*assert_messaging_allowed_v1/i.test(
      migration,
    ),
  'realtime must use private Broadcast authorization backed by active messaging capability and membership',
);
requireInvariant(
  /drop policy if exists "Conversation members can insert own messages"/i.test(
    migration,
  ) && /revoke insert on public\.messages from authenticated/i.test(migration),
  'direct client message inserts must be removed at authoritative cutover',
);
requireInvariant(
  /media_asset_id_v1/i.test(migration) &&
    !/m\.body like '%' \|\| media_assets\.id/i.test(migration),
  'v1 media access must use an explicit message attachment association',
);
requireInvariant(
  /from\('players'\)[\s\S]*\.eq\('account_id', user\.id\)/i.test(
    accountDelete,
  ) && /sender_player_id_v1\.eq\.\$\{playerId\}/i.test(accountDelete),
  'account deletion must tombstone messages through authoritative PlayerId, not only legacy profile identity',
);
requireInvariant(
  /content_kind_v1: 'system'/i.test(accountDelete) &&
    /eventType: 'message_removed'/i.test(accountDelete) &&
    /media_asset_id_v1: null/i.test(accountDelete),
  'account deletion must remove message content and attachment association without deleting message rows',
);
requireInvariant(
  /resolve_player_identity_v1/i.test(migration) &&
    /get_player_lifecycle_snapshot_v1/i.test(migration) &&
    /get_player_profile_version_v1/i.test(migration),
  'authenticated messaging must compose identity, lifecycle, and profile-version provider seams',
);
requireInvariant(
  migration.includes("'player.deletion_requested.v1'") &&
    migration.includes("'player.deleted.v1'"),
  'Conversation outbox compatibility must preserve deletion lifecycle events',
);
requireInvariant(
  !/foregroundPolicy/i.test(migration) &&
    /authoritativeUnreadCount/i.test(migration),
  'notification requests must provide authoritative unread without deciding foreground suppression',
);
requireInvariant(
  /conversation_participants_v1/i.test(mobileSurface) &&
    /conversation_unread_count_v1/i.test(mobileSurface) &&
    /get_conversation_inbox_page_v1/i.test(mobileSurface),
  'mobile surfaces must project canonical participants and authoritative unread watermarks',
);
requireInvariant(
  /security definer[\s\S]*set search_path = ''/i.test(migration),
  'security-definer functions must pin an empty search_path',
);
requireInvariant(
  !/language plpgsql\s+language plpgsql/i.test(migration),
  'SQL contains a duplicate language clause',
);
requireInvariant(
  !/last_error\s*=\s*null,\s*last_error\s*=\s*null/i.test(migration),
  'SQL contains a duplicate assignment',
);

if (databaseTest) {
  const assertionCount = (
    databaseTest.match(
      /select\s+(?:is|ok|isnt|throws_ok|lives_ok|has_column|has_function|has_index|has_policy)\s*\(/gi,
    ) ?? []
  ).length;
  const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
  requireInvariant(
    assertionCount === plannedCount,
    `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
  );
}

if (failures.length) {
  console.error(
    `Conversation Authority v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  databaseTest
    ? 'Conversation Authority v1 check passed with migration and pgTAP coverage.'
    : 'Conversation Authority v1 migration invariants passed; pgTAP file pending.',
);
