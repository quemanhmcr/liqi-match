const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607141430_core_v2_repeat_activity_commands.sql';
const socialMigrationPath =
  'supabase/migrations/202607140052_core_v2_social_relationship_foundation.sql';
const databaseTestPath =
  'supabase/tests/database/core_v2_repeat_activity_commands.test.sql';
const eventsPath = 'contracts/core-v2/events/trust-events.ts';

const migration = fs.readFileSync(migrationPath, 'utf8');
const socialMigration = fs.readFileSync(socialMigrationPath, 'utf8');
const databaseTest = fs.readFileSync(databaseTestPath, 'utf8');
const events = fs.readFileSync(eventsPath, 'utf8');
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

function functionBlock(functionName, nextFunctionName) {
  const start = migration.indexOf(`create or replace function ${functionName}`);
  if (start < 0) return '';
  const end = nextFunctionName
    ? migration.indexOf(`create or replace function ${nextFunctionName}`, start)
    : migration.length;
  return migration.slice(start, end < 0 ? migration.length : end);
}

const socialCapabilityFunction = 'private.social_relationship_snapshot_v2';
const socialCapabilityDefinition =
  'create or replace function private.social_relationship_snapshot_v2';
requireInvariant(
  socialMigration.split(socialCapabilityDefinition).length - 1 === 1 &&
    socialMigration.includes("'capabilities'") &&
    socialMigration.includes("'blocked'") &&
    socialMigration.includes("'canInviteToSession'"),
  'Exactly one supplier-owned Social blocked/invite capability function must exist',
);
const blockedSqlPath = "'{capabilities,blocked}'";
const inviteSqlPath = "'{capabilities,canInviteToSession}'";

const deriveBlock = functionBlock(
  'private.derive_repeat_teammates_v2',
  'public.confirm_session_participation_v2',
);
const confirmBlock = functionBlock(
  'public.confirm_session_participation_v2',
  'public.request_repeat_session_v2',
);
const requestBlock = functionBlock(
  'public.request_repeat_session_v2',
  'public.dismiss_activity_item_v2',
);
const dismissBlock = functionBlock(
  'public.dismiss_activity_item_v2',
  'public.update_engagement_preferences_v2',
);
const preferencesBlock = functionBlock(
  'public.update_engagement_preferences_v2',
  'public.rebuild_reputation_projection_v2',
);
const rebuildBlock = functionBlock(
  'public.rebuild_reputation_projection_v2',
  null,
);

requireInvariant(
  /create unique index(?: if not exists)?\s+repeat_play_requests_v2_active_unique[\s\S]*?where status = 'requested'/i.test(
    migration,
  ),
  'Active repeat requests must have a durable semantic uniqueness guard',
);
requireInvariant(
  deriveBlock.includes(
    'private.outcome_all_participation_confirmed_v2(candidate.id)',
  ) &&
    deriveBlock.includes('confirmed_session_count_value < 1') &&
    deriveBlock.includes('confirmed_session_count_value >= 2') &&
    deriveBlock.includes(
      'least(left_player.player_id, right_player.player_id)',
    ) &&
    deriveBlock.includes(
      'greatest(left_player.player_id, right_player.player_id)',
    ),
  'Repeat recommendations require one fully confirmed session while repeat teammate formation requires two and canonical pair ordering',
);
const formedIndex = deriveBlock.indexOf('if formed_value then');
const ledgerIndex = deriveBlock.indexOf(
  'private.append_reputation_ledger_entry_v2(',
);
requireInvariant(
  formedIndex >= 0 &&
    ledgerIndex > formedIndex &&
    deriveBlock.includes("'repeat_teammate_count'") &&
    deriveBlock.includes("'repeat_teammate'") &&
    deriveBlock.includes("'repeat_teammate.formed.v2'"),
  'Repeat teammate ledger facts and formed events must be emitted only on first formation',
);
requireInvariant(
  deriveBlock.includes(`${socialCapabilityFunction}(`) &&
    deriveBlock.includes(blockedSqlPath) &&
    deriveBlock.includes(inviteSqlPath) &&
    deriveBlock.includes('if blocked_value or not can_invite_value then') &&
    deriveBlock.includes("'repeat_play_recommendation'") &&
    deriveBlock.includes("'relationshipVersion'") &&
    deriveBlock.includes('coalesce(relationship_row.version, 0)') &&
    deriveBlock.includes('activity.dismissed_at is null') &&
    deriveBlock.includes("activity.payload -> 'teammatePlayerIds'"),
  'Recommendations must consume live Social capability, fail closed, and supersede older active cards for the same teammate',
);
requireInvariant(
  confirmBlock.includes('private.derive_repeat_teammates_v2(') &&
    confirmBlock.indexOf('private.derive_repeat_teammates_v2(') >
      confirmBlock.indexOf(
        'private.outcome_all_participation_confirmed_v2(outcome_row.id)',
      ),
  'Repeat derivation must run only inside final participation confirmation',
);

requireInvariant(
  requestBlock.includes('p_expected_version <> 0') &&
    requestBlock.includes('jsonb_array_length(p_relationship_versions)') &&
    requestBlock.includes("array['teammatePlayerId', 'version']") &&
    requestBlock.includes(
      'relationshipVersions must cover exactly the requested teammates',
    ),
  'Repeat request must be a create aggregate with exact per-teammate relationship versions',
);
requireInvariant(
  requestBlock.includes('public.get_player_lifecycle_snapshot_v1(') &&
    requestBlock.includes(`${socialCapabilityFunction}(`) &&
    requestBlock.includes(blockedSqlPath) &&
    requestBlock.includes(inviteSqlPath) &&
    requestBlock.includes("'repeat_play_blocked'") &&
    requestBlock.includes("'repeat_play_not_allowed'"),
  'Repeat request must re-check target lifecycle and live Social authorization at write time',
);
requireInvariant(
  requestBlock.includes('relationship_row.version <>') &&
    requestBlock.includes("'aggregate_version_conflict'") &&
    requestBlock.includes("'repeat_play_history_required'") &&
    requestBlock.includes('expected_relationship_version_value <> 0') &&
    requestBlock.includes("'repeat_request_already_active'"),
  'Repeat request must allow version-zero verified history while rejecting stale or duplicate repeat requests',
);
requireInvariant(
  requestBlock.includes('private.begin_command_v1(') &&
    requestBlock.includes('private.finish_command_v1(') &&
    requestBlock.includes("'repeat_play.requested.v2'") &&
    requestBlock.includes("'repeat_session_requested'"),
  'Repeat request must return an idempotent authoritative receipt and outbox event',
);
requireInvariant(
  !/request_friendship_v2|accept_friendship_v2|insert\s+into\s+public\.[a-z0-9_]*(friend|social_relationship)/i.test(
    migration,
  ),
  'Repeat trust semantics must never create or mutate friendship authority',
);

for (const [name, block, eventType, resultCode] of [
  [
    'dismiss_activity_item_v2',
    dismissBlock,
    'activity.item_dismissed.v2',
    'activity_item_dismissed',
  ],
  [
    'update_engagement_preferences_v2',
    preferencesBlock,
    'engagement.preferences_updated.v2',
    'engagement_preferences_updated',
  ],
]) {
  requireInvariant(
    block.includes('private.resolve_trust_actor_v2(true, true)') &&
      block.includes('private.validate_command_audit_v2(p_audit)') &&
      block.includes('private.begin_command_v1(') &&
      block.includes('private.finish_command_v1(') &&
      block.includes(`'${eventType}'`) &&
      block.includes(`'${resultCode}'`) &&
      block.includes("'aggregateVersion'") &&
      block.includes("'eventIds'"),
    `${name} must enforce active actor, audit, idempotency, optimistic receipt and a versioned event`,
  );
}
requireInvariant(
  dismissBlock.includes('activity_row.player_id <> actor_player_id_value') &&
    dismissBlock.includes('activity_row.version <> p_expected_version') &&
    dismissBlock.includes('activity_row.dismissed_at is not null'),
  'Activity dismissal must be owner-only, versioned, and one-way',
);
requireInvariant(
  preferencesBlock.includes('private.jsonb_has_exact_keys_v2(') &&
    preferencesBlock.includes('not between 0 and 4') &&
    preferencesBlock.includes('preference_row.version <> p_expected_version'),
  'Engagement preferences must use an exact shape, cap 0-4, and optimistic concurrency',
);
requireInvariant(
  rebuildBlock.includes("auth.role() <> 'service_role'") &&
    rebuildBlock.includes('private.rebuild_player_reputation_projection_v2(') &&
    rebuildBlock.includes(
      'projection_row.projection_version <> p_expected_version',
    ) &&
    rebuildBlock.includes("'player.reputation_changed.v2'") &&
    rebuildBlock.includes("'projection_rebuilt'"),
  'Projection rebuild must be service-role-only, versioned, ledger-derived, idempotent and eventful',
);
requireInvariant(
  /revoke execute on function public\.rebuild_reputation_projection_v2\([\s\S]*?\) from public, anon, authenticated;/i.test(
    migration,
  ) &&
    /grant execute on function public\.rebuild_reputation_projection_v2\([\s\S]*?\) to service_role;/i.test(
      migration,
    ),
  'Projection rebuild must not be executable by mobile authenticated clients',
);
requireInvariant(
  events.includes('ActivityItemDismissedEventV2Schema') &&
    events.includes("'activity.item_dismissed.v2'") &&
    events.includes('EngagementPreferencesUpdatedEventV2Schema') &&
    events.includes("'engagement.preferences_updated.v2'"),
  'New activity and preference mutations must have typed Core V2 event contracts',
);
requireInvariant(
  migration
    .split(/security definer/i)
    .slice(1)
    .every((block) => /^\s*set search_path = ''/i.test(block)),
  'Every security-definer function must pin an empty search_path',
);

const assertionCount = (
  databaseTest.match(
    /select\s+(?:has_function|has_table|is|isnt|ok|lives_ok|throws_ok|throws_like)\s*\(/gi,
  ) ?? []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);
for (const evidence of [
  'one canonical repeat teammate relationship is formed',
  'relationship formation creates one immutable ledger fact per player',
  'repeat derivation replay creates no duplicate ledger facts',
  'activity dismissal replay returns the same receipt',
  'notification cap above four fails closed',
  'projection rebuild replay returns the authoritative receipt',
  'mobile clients cannot invoke projection rebuild tooling',
  'repeat request enforces create aggregate expectedVersion zero before Social capability evaluation',
]) {
  requireInvariant(
    databaseTest.includes(evidence),
    `pgTAP must prove: ${evidence}`,
  );
}

if (failures.length) {
  console.error(
    `Core V2 repeat/activity commands check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Core V2 repeat/activity commands check passed (${assertionCount} pgTAP assertions).`,
);
