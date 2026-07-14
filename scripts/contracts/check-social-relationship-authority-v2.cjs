#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/202607140052_core_v2_social_relationship_foundation.sql',
);
const testPath = path.join(
  root,
  'supabase/tests/database/social_relationship_foundation_v2.test.sql',
);

const migration = fs.readFileSync(migrationPath, 'utf8');
const test = fs.readFileSync(testPath, 'utf8');
const required = [
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
];

for (const marker of required) {
  if (!migration.includes(marker)) {
    throw new Error(`Missing Core V2 social authority marker: ${marker}`);
  }
}

if (/auth\.uid\(\).*player/i.test(migration)) {
  throw new Error('Core V2 must not treat auth.uid() as canonical PlayerId.');
}
if (!test.includes('permission denied')) {
  throw new Error(
    'Core V2 pgTAP must prove direct cross-account reads are denied.',
  );
}
if (!test.includes('block override prevents presence disclosure')) {
  throw new Error('Core V2 pgTAP must prove privacy fails closed under block.');
}

const plan = Number(test.match(/select plan\((\d+)\)/)?.[1] ?? 0);
const assertions = (
  test.match(/select (?:is|isnt|ok|throws_ok|throws_like)\(/g) ?? []
).length;
if (plan !== assertions) {
  throw new Error(
    `pgTAP plan ${plan} does not match ${assertions} assertions.`,
  );
}

(async () => {
  const parser = await new PgQueryModule();
  const parsed = parser.parse(migration);
  if (parsed.error)
    throw new Error(parsed.error.message ?? String(parsed.error));
  console.log(
    `Core V2 social foundation check passed (${assertions} pgTAP assertions).`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
