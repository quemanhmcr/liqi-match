#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = process.cwd();
const files = {
  foundationMigration: path.join(
    root,
    'supabase/migrations/202607140052_core_v2_social_relationship_foundation.sql',
  ),
  foundationTest: path.join(
    root,
    'supabase/tests/database/social_relationship_foundation_v2.test.sql',
  ),
  trustMigration: path.join(
    root,
    'supabase/migrations/202607140053_social_trust_visibility_v2.sql',
  ),
  trustTest: path.join(
    root,
    'supabase/tests/database/social_trust_visibility_v2.test.sql',
  ),
  consumerBridgeMigration: path.join(
    root,
    'supabase/migrations/202607140061_social_block_consumer_bridge_v2.sql',
  ),
  consumerBridgeTest: path.join(
    root,
    'supabase/tests/database/social_block_consumer_bridge_v2.test.sql',
  ),
  profileVisibilityMigration: path.join(
    root,
    'supabase/migrations/202607140062_profile_social_visibility_bridge_v2.sql',
  ),
  profileVisibilityTest: path.join(
    root,
    'supabase/tests/database/profile_social_visibility_bridge_v2.test.sql',
  ),
};
const source = Object.fromEntries(
  Object.entries(files).map(([name, filename]) => [
    name,
    fs.readFileSync(filename, 'utf8'),
  ]),
);

for (const marker of [
  'create table public.social_relationships_v2',
  'create table public.friendship_requests_v2',
  'create table public.player_blocks_v2',
  'create table public.player_mutes_v2',
  'create table public.player_privacy_settings_v2',
  'create table public.reports_v2',
  'create table public.report_evidence_v2',
  'private.are_players_blocked_v2',
  'private.social_relationship_snapshot_v2',
  'public.get_relationship_v2',
  'public.list_friendships_v2',
  "'eventVersion', 2",
  "'aggregateVersion', p_aggregate_version",
  "'actorPlayerId', p_actor_player_id",
  'legacy_block_shadow_reads_enabled',
  'enable row level security',
]) {
  if (!source.foundationMigration.includes(marker)) {
    throw new Error(`Missing Core V2 social authority marker: ${marker}`);
  }
}

for (const marker of [
  'public.trust_visibility_v2',
  'private.social_trust_visibility_decision_v2',
  'public.get_trust_visibility_v2',
  "'canViewTrust', can_view_trust_value",
  "default 'friends'",
]) {
  if (!source.trustMigration.includes(marker)) {
    throw new Error(`Missing Core V2 trust visibility marker: ${marker}`);
  }
}

for (const marker of [
  'create or replace function private.are_profiles_blocked',
  'public.player_blocks_v2',
  'legacy_block_shadow_reads_enabled',
  "'Compatibility seam: V2 PlayerId block authority first",
]) {
  if (!source.consumerBridgeMigration.includes(marker)) {
    throw new Error(`Missing Core V2 consumer bridge marker: ${marker}`);
  }
}
if (
  !source.consumerBridgeTest.includes(
    'legacy-profile consumers observe a V2-only block',
  )
) {
  throw new Error(
    'Consumer bridge pgTAP must prove V2 block enforcement for legacy consumers.',
  );
}

for (const marker of [
  'private.can_view_legacy_profile_v2',
  'public.resolve_visible_profile_identity_v2',
  'Profiles follow Core V2 social visibility',
  "'profile_visibility_denied'",
]) {
  if (!source.profileVisibilityMigration.includes(marker)) {
    throw new Error(`Missing Core V2 profile visibility marker: ${marker}`);
  }
}
if (
  !source.profileVisibilityTest.includes(
    'block override also revokes legacy profile RLS visibility',
  )
) {
  throw new Error(
    'Profile visibility pgTAP must prove block revokes direct legacy profile reads.',
  );
}

if (/auth\.uid\(\).*player/i.test(source.foundationMigration)) {
  throw new Error('Core V2 must not treat auth.uid() as canonical PlayerId.');
}
if (!source.foundationTest.includes('permission denied')) {
  throw new Error(
    'Core V2 pgTAP must prove direct cross-account reads are denied.',
  );
}
if (
  !source.foundationTest.includes('block override prevents presence disclosure')
) {
  throw new Error('Core V2 pgTAP must prove privacy fails closed under block.');
}
if (
  !source.trustTest.includes(
    'block override revokes trust projection visibility',
  )
) {
  throw new Error(
    'Trust pgTAP must prove block revokes trust projection visibility.',
  );
}

function countAssertions(sql, label) {
  const plan = Number(sql.match(/select plan\((\d+)\)/)?.[1] ?? 0);
  const assertions = (
    sql.match(/select (?:is|isnt|ok|throws_ok|throws_like)\(/g) ?? []
  ).length;
  if (plan !== assertions) {
    throw new Error(
      `${label} pgTAP plan ${plan} does not match ${assertions} assertions.`,
    );
  }
  return assertions;
}

const assertionCount =
  countAssertions(source.foundationTest, 'Foundation') +
  countAssertions(source.trustTest, 'Trust visibility') +
  countAssertions(source.consumerBridgeTest, 'Consumer bridge') +
  countAssertions(source.profileVisibilityTest, 'Profile visibility');

(async () => {
  const parser = await new PgQueryModule();
  for (const [label, sql] of [
    ['foundation', source.foundationMigration],
    ['trust visibility', source.trustMigration],
    ['consumer bridge', source.consumerBridgeMigration],
    ['profile visibility', source.profileVisibilityMigration],
  ]) {
    const parsed = parser.parse(sql);
    if (parsed.error) {
      throw new Error(
        `${label}: ${parsed.error.message ?? String(parsed.error)}`,
      );
    }
  }
  console.log(
    `Core V2 social authority check passed (${assertionCount} pgTAP assertions).`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
