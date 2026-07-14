const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607140004_production_match_authority_v1.sql';
const lifecycleMigrationPath =
  'supabase/migrations/202607140001_secure_identity_lifecycle_v1.sql';
const testPath =
  'supabase/tests/database/production_match_authority_v1.test.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const lifecycleMigration = fs.readFileSync(lifecycleMigrationPath, 'utf8');
const databaseTest = fs.readFileSync(testPath, 'utf8');
const overloadRepair = fs.readFileSync(
  'supabase/migrations/202607140033_remove_match_command_overloads_v1.sql',
  'utf8',
);
const canonicalDecisionRepair = fs.readFileSync(
  'supabase/migrations/202607140048_repair_canonical_match_decision_v1.sql',
  'utf8',
);

const activationStart = migration.indexOf(
  'create or replace function public.activate_match_intent_v1',
);
const decisionStart = migration.indexOf(
  'create or replace function public.record_player_decision_v1',
);
const legacyStart = migration.indexOf(
  'create or replace function public.record_swipe',
  decisionStart,
);
const activation = migration.slice(activationStart, decisionStart);
const decision = migration.slice(decisionStart, legacyStart);
const legacy = migration.slice(legacyStart);
const failures = [];

function requireInvariant(condition, message) {
  if (!condition) failures.push(message);
}

requireInvariant(
  activationStart >= 0 &&
    decisionStart > activationStart &&
    legacyStart > decisionStart,
  'authoritative and legacy function boundaries must be present in order',
);
requireInvariant(
  lifecycleMigration.includes('create table private.command_receipts_v1'),
  'Mission 1 shared command receipt authority must precede Match Authority',
);
requireInvariant(
  !migration.includes('create table private.command_idempotency_v1'),
  'Match Authority must not create a second command receipt semantic engine',
);
requireInvariant(
  activation.indexOf('command_state.repeated') <
    activation.indexOf('match_intent_writes_enabled_v1'),
  'Match Intent replay must precede current rollout-policy checks',
);
requireInvariant(
  decision.indexOf('command_state.repeated') <
    decision.indexOf('match_decision_writes_enabled_v1'),
  'decision replay must precede current rollout-policy checks',
);
requireInvariant(
  decision.indexOf('pg_advisory_xact_lock') <
    decision.indexOf('get_player_lifecycle_snapshot_v1(low_player_id, true)'),
  'canonical pair lock must precede provider-owned lifecycle row locks',
);
requireInvariant(
  decision.indexOf('get_player_lifecycle_snapshot_v1(low_player_id, true)') <
    decision.indexOf('get_player_lifecycle_snapshot_v1(high_player_id, true)'),
  'lifecycle provider locks must be acquired in ascending PlayerId order',
);
requireInvariant(
  decision.includes('get_player_profile_version_v1'),
  'profile optimistic concurrency must consume the profile-version provider',
);
requireInvariant(
  decision.includes('private.assert_discovery_eligible_v1') &&
    migration.includes(
      'private.is_player_discovery_eligible_v1(player_id_value)',
    ),
  'command-time eligibility must consume the Mission 1 lifecycle authority through one wrapper',
);
requireInvariant(
  /where id in \(actor_intent\.id, target_intent\.id\)/.test(decision),
  'both Match Intents must be fulfilled in the match transaction',
);
requireInvariant(
  !/insert\s+into\s+public\.conversations/i.test(decision),
  'Mission 2 must not create conversations directly',
);
requireInvariant(
  /on conflict \(profile_low_id, profile_high_id\) do update[\s\S]*?player_low_id = excluded\.player_low_id/.test(
    decision,
  ),
  'v1 must adopt an existing legacy match row instead of creating a duplicate',
);
requireInvariant(
  decision.includes("'conversation.bootstrap_requested.v1'"),
  'Mission 2 must emit the conversation bootstrap request',
);
requireInvariant(
  /player_low_id is not null/.test(legacy),
  'legacy matching must remain blocked after the first authoritative match',
);
requireInvariant(
  !migration.includes(
    'drop constraint if exists outbox_events_event_type_check',
  ),
  'Match Authority must not replace the shared additive event-type policy',
);
requireInvariant(
  !/language plpgsql\s+language plpgsql/i.test(migration),
  'SQL contains a duplicate language clause',
);
requireInvariant(
  !/\) values \(\s*\) values \(/i.test(migration),
  'SQL contains a duplicate values clause',
);

requireInvariant(
  overloadRepair.includes(
    'drop function if exists public.activate_match_intent_v1(jsonb, text, integer)',
  ) &&
    overloadRepair.includes(
      'drop function if exists public.record_player_decision_v1(',
    ) &&
    /integer,\s*integer\s*\)/i.test(overloadRepair),
  'parallel integer Match command overloads must be removed so the shared-receipt bigint signatures remain canonical',
);
requireInvariant(
  /p_expected_intent_version bigint[\s\S]*p_expected_target_profile_version bigint/i.test(
    canonicalDecisionRepair,
  ) &&
    /actor_player_id_value uuid/i.test(canonicalDecisionRepair) &&
    /where decisions\.actor_player_id = actor_player_id_value/i.test(
      canonicalDecisionRepair,
    ) &&
    !/where decisions\.actor_player_id = actor_player_id(?:\s|$)/i.test(
      canonicalDecisionRepair,
    ),
  'The surviving bigint decision authority must use collision-free PL/pgSQL identifiers.',
);
requireInvariant(
  !fs
    .readdirSync('supabase/migrations')
    .some((name) =>
      fs
        .readFileSync(`supabase/migrations/${name}`, 'utf8')
        .includes('create table private.command_idempotency_v1'),
    ),
  'the integrated schema must not create a second Match command idempotency engine',
);

const assertionCount = (
  databaseTest.match(/select\s+(?:is|isnt|ok|throws_ok|throws_like)\s*\(/gi) ??
  []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);

if (failures.length) {
  console.error(
    `Match Authority v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Match Authority v1 check passed (${assertionCount} pgTAP assertions).`,
);
