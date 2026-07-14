const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607140036_return_loop_authority_v1.sql';
const testPath = 'supabase/tests/database/return_loop_authority_v1.test.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const variableConflictMigrationPath =
  'supabase/migrations/202607140044_fix_return_loop_event_variable_conflict_v1.sql';
const variableConflictMigration = fs.readFileSync(
  variableConflictMigrationPath,
  'utf8',
);
const databaseTest = fs.readFileSync(testPath, 'utf8');
const homeApiRepository = fs.readFileSync(
  'src/features/home/services/api-home-repository.ts',
  'utf8',
);
const notificationApiRepository = fs.readFileSync(
  'src/entities/notifications/data/api-notification-inbox.repository.ts',
  'utf8',
);
const applicationComposition = fs.readFileSync(
  'src/app-shell/runtime/create-application-services.ts',
  'utf8',
);
const failures = [];

function requireInvariant(condition, message) {
  if (!condition) failures.push(message);
}

requireInvariant(
  /resolve_player_identity_v1\(p_account_id, p_lock\)/i.test(migration) &&
    /get_player_lifecycle_snapshot_v1\([\s\S]*resolved_player_id/i.test(
      migration,
    ) &&
    /get_player_profile_version_v1\([\s\S]*resolved_profile_id/i.test(
      migration,
    ),
  'Return Loop must compose provider-owned identity, lifecycle and profile-version seams.',
);
requireInvariant(
  !/from public\.(players|player_profiles_v1)/i.test(
    migration.slice(
      migration.indexOf(
        'create or replace function private.require_return_loop_player_snapshot_by_account_v1',
      ),
      migration.indexOf(
        'create or replace function private.current_return_loop_player_id_v1',
      ),
    ),
  ),
  'Return Loop provider adapters must not duplicate identity or lifecycle table semantics.',
);

const notificationInsert = migration.indexOf(
  'insert into public.notifications_v1',
);
const pushInsert = migration.indexOf(
  'insert into private.notification_push_jobs_v1',
);
const conversationConsumer = migration.slice(
  migration.indexOf(
    'create or replace function private.consume_conversation_ready_v1',
  ),
  migration.indexOf(
    'create or replace function private.consume_message_sent_v1',
  ),
);
const profileConsumer = migration.slice(
  migration.indexOf(
    'create or replace function private.consume_player_profile_updated_v1',
  ),
  migration.indexOf(
    'create or replace function private.consume_return_loop_event_v1',
  ),
);
const eventConsumer = migration.slice(
  migration.indexOf(
    'create or replace function private.consume_return_loop_event_v1',
  ),
  migration.indexOf(
    'create or replace function public.get_notification_summary_v1',
  ),
);

requireInvariant(
  /source_event_id uuid not null unique/i.test(migration),
  'Notification source event identity must be globally unique.',
);
requireInvariant(
  /check \(read_at is null or seen_at is not null\)/i.test(migration) &&
    /check \(read_at is null or read_at >= seen_at\)/i.test(migration),
  'Notification read must imply seen and transitions must be monotonic.',
);
requireInvariant(
  /'seenThrough', jsonb_build_object\([\s\S]*'notificationId', target\.id[\s\S]*'unseenCount', unseen_count/i.test(
    migration,
  ) &&
    /'notification', private\.notification_to_json_v1\(notification\)[\s\S]*'unseenCount', unseen_count/i.test(
      migration,
    ),
  'Seen/read commands must return atomic server timestamps and unseen facts.',
);
requireInvariant(
  notificationInsert >= 0 && pushInsert > notificationInsert,
  'Notification must persist before push delivery is enqueued.',
);
requireInvariant(
  /exception\s+when others then\s+insert into private\.notification_delivery_errors_v1/is.test(
    migration,
  ),
  'Push enqueue failure must be caught after notification persistence.',
);
requireInvariant(
  !/unread_count\s*=\s*[^,;\n]*\+/i.test(migration),
  'Mission 4 must never increment conversation unread from notification rows.',
);
requireInvariant(
  /unread_count = excluded\.unread_count/i.test(migration),
  'Conversation unread must use the exact provider-owned value.',
);
requireInvariant(
  /last_attention_occurred_at <= excluded\.last_attention_occurred_at/i.test(
    migration,
  ),
  'Out-of-order attention events must not regress conversation state.',
);
requireInvariant(
  /public\.apply_conversation_created_to_match_v1\(p_event\)/i.test(
    conversationConsumer,
  ) &&
    !/update\s+public\.matches/i.test(conversationConsumer) &&
    !/insert\s+into\s+public\.conversations/i.test(conversationConsumer),
  'Mission 4 must consume the supplier-owned Match projection without duplicating Match or Conversation semantics.',
);
requireInvariant(
  !/conversation\.bootstrapped\.v1/i.test(migration) &&
    /event_type = 'conversation\.created\.v1'/i.test(eventConsumer),
  'Return Loop must consume only the canonical conversation.created.v1 semantic path.',
);
requireInvariant(
  !/target ->> 'foregroundPolicy'/i.test(migration),
  'Producer events must not decide foreground push suppression.',
);
requireInvariant(
  /resolve_player_identity_v1\(account_id, false\)/i.test(profileConsumer) &&
    /get_player_lifecycle_snapshot_v1\(event_player_id, false\)/i.test(
      profileConsumer,
    ) &&
    /get_player_profile_version_v1\([\s\S]*event_profile_id/i.test(
      profileConsumer,
    ),
  'Profile invalidation must validate AccountId→PlayerId→ProfileId through provider seams.',
);
requireInvariant(
  /home_profile_projection_watermarks_v1/i.test(profileConsumer) &&
    /profile_version < excluded\.profile_version/i.test(profileConsumer) &&
    /source_event_id/i.test(profileConsumer),
  'Profile invalidation watermark must be monotonic and source-event traceable.',
);
requireInvariant(
  !/public\.(profiles|game_profiles|profile_roles|profile_habits)/i.test(
    profileConsumer,
  ),
  'Profile invalidation must not read legacy profile tables to infer identity or version.',
);
requireInvariant(
  /pg_advisory_xact_lock\(hashtextextended\(event_id::text, 0\)\)/i.test(
    eventConsumer,
  ) && /return_loop_processed_events_v1/i.test(eventConsumer),
  'Event consumption must serialize and persist idempotency by EventId.',
);
requireInvariant(
  /create or replace function private\.consume_return_loop_event_without_suspension_v1\(p_event jsonb\)/i.test(
    variableConflictMigration,
  ) &&
    /event_id_value uuid :=/i.test(variableConflictMigration) &&
    /where processed\.event_id = event_id_value/i.test(
      variableConflictMigration,
    ) &&
    !/where processed\.event_id = event_id(?:\s|;)/i.test(
      variableConflictMigration,
    ),
  'Forward Return Loop correction must eliminate EventId variable/column ambiguity.',
);
requireInvariant(
  /process_pending_return_loop_events_v1/i.test(migration) &&
    /for update of event skip locked/i.test(migration) &&
    /return_loop_processed_events_v1/i.test(migration) &&
    !/update\s+private\.outbox_events/i.test(migration) &&
    !/claim_return_loop_events_v1/i.test(migration) &&
    !/complete_return_loop_event_v1/i.test(migration) &&
    !/fail_return_loop_event_v1/i.test(migration),
  'Return Loop must use per-consumer EventId receipts without claiming shared outbox status.',
);
requireInvariant(
  /expires_at timestamptz not null default \(now\(\) \+ interval '24 hours'\)/i.test(
    migration,
  ) && /push_delivery_expired/i.test(migration),
  'Push jobs require a bounded delivery TTL.',
);
requireInvariant(
  /return_loop_feature_enabled_v1\('push', device\.account_id\)/i.test(
    migration,
  ),
  'Push claims must enforce the account cohort at delivery time.',
);
requireInvariant(
  /account_id uuid not null references auth\.users\(id\) on delete cascade/i.test(
    migration,
  ),
  'Push device ownership must be account-authoritative and deletion-safe.',
);
requireInvariant(
  !/where account_id = account_id/i.test(migration),
  'SQL contains a shadowed account identity predicate.',
);
requireInvariant(
  /revoke all on function public\.process_pending_return_loop_events_v1\(integer\)[\s\S]*grant execute[\s\S]*to service_role/i.test(
    migration,
  ),
  'Return Loop dispatcher and push worker RPCs must remain service-role only.',
);
requireInvariant(
  /home_kind_v1/i.test(migration) && /home_status_v1/i.test(migration),
  'Home must read server-owned match kind and status facts.',
);
requireInvariant(
  /from public\.player_profiles_v1 as canonical_profile[\s\S]*join public\.profiles as legacy_profile[\s\S]*canonical_profile\.legacy_profile_id/i.test(
    migration,
  ) && /canonical_profile\.id = snapshot\.profile_id/i.test(migration),
  'Home must bridge canonical ProfileId to legacy profile data explicitly.',
);
requireInvariant(
  /create or replace function public\.get_home_current_profile_v1\(\)[\s\S]*'playerId', snapshot\.player_id[\s\S]*'profileId', snapshot\.profile_id[\s\S]*canonical_profile\.legacy_profile_id/i.test(
    migration,
  ),
  'Home current-profile projection must preserve canonical identity and isolate the legacy storage bridge.',
);
requireInvariant(
  !/\bindex\b.*(?:status|unread|kind)/i.test(migration),
  'Home authority must not depend on array-index heuristics.',
);

requireInvariant(
  /'playerLifecycle', jsonb_build_object\([\s\S]*'playerId', snapshot\.player_id[\s\S]*'profileId', snapshot\.profile_id[\s\S]*'state', snapshot\.state[\s\S]*'version', snapshot\.lifecycle_version[\s\S]*'updatedAt', snapshot\.updated_at/i.test(
    migration,
  ) &&
    !/'playerLifecycle', jsonb_build_object\([\s\S]{0,350}'accountId'/i.test(
      migration,
    ) &&
    !/'playerLifecycle', jsonb_build_object\([\s\S]{0,350}'profileVersion'/i.test(
      migration,
    ),
  'Home lifecycle payload must match the exact provider-owned lifecycle snapshot.',
);
requireInvariant(
  /createApiHomeRepository/.test(applicationComposition) &&
    !/fetchHomeDashboard/.test(applicationComposition),
  'API composition must bind the authoritative Home RPC repository and never the legacy fetch adapter.',
);

requireInvariant(
  /rpc\/get_home_dashboard_v1/.test(homeApiRepository) &&
    /rpc\/get_home_current_profile_v1/.test(homeApiRepository) &&
    /HomeDashboardV1Schema\.parse/.test(homeApiRepository) &&
    /HomeCurrentProfileV1Schema\.parse/.test(homeApiRepository),
  'Production Home must use contract-validated authority RPCs.',
);
requireInvariant(
  !/fetchHomeDashboard|mapMatchRow|resolveMatchedKind|index\s*%|unreadCount:\s*index|status:\s*index/.test(
    `${homeApiRepository}\n${applicationComposition}`,
  ),
  'Production Home source must not retain index-based or legacy heuristic semantics.',
);
requireInvariant(
  /createApiHomeRepository/.test(applicationComposition) &&
    !/getDashboard:\s*fetchHomeDashboard/.test(applicationComposition),
  'Application composition must provide the authoritative Home repository.',
);

requireInvariant(
  /rpc\/get_notification_summary_v1/.test(notificationApiRepository) &&
    /rpc\/list_notifications_v1/.test(notificationApiRepository) &&
    /rpc\/mark_notifications_seen_through_v1/.test(notificationApiRepository) &&
    /rpc\/mark_notification_read_v1/.test(notificationApiRepository) &&
    /NotificationInboxPageV1Schema\.parse/.test(notificationApiRepository) &&
    /NotificationSummaryV1Schema\.parse/.test(notificationApiRepository) &&
    /MarkNotificationsSeenResultV1Schema\.parse/.test(
      notificationApiRepository,
    ) &&
    /MarkNotificationReadResultV1Schema\.parse/.test(notificationApiRepository),
  'Production Notifications must use contract-validated authority RPCs.',
);
requireInvariant(
  /createApiNotificationInboxRepository/.test(applicationComposition) &&
    !/createUnavailableNotificationRepository/.test(applicationComposition),
  'API composition must bind the authoritative Notification repository.',
);

const assertionCount = (
  databaseTest.match(/select\s+(?:is|ok|isnt|throws_ok)\s*\(/gi) ?? []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);

if (failures.length) {
  console.error(
    `Return Loop Authority v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Return Loop Authority v1 check passed (${assertionCount} pgTAP assertions).`,
);
