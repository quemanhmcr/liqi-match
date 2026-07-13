const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607140001_production_match_authority_v1.sql';
const testPath =
  'supabase/tests/database/production_match_authority_v1.test.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const databaseTest = fs.readFileSync(testPath, 'utf8');

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
  activation.indexOf('stored_response is not null') <
    activation.indexOf('match_intent_writes_enabled_v1'),
  'Match Intent replay must precede current rollout-policy checks',
);
requireInvariant(
  decision.indexOf('stored_response is not null') <
    decision.indexOf('match_decision_writes_enabled_v1'),
  'decision replay must precede current rollout-policy checks',
);
requireInvariant(
  decision.indexOf('actor_account_id, true') >
    decision.indexOf('pg_advisory_xact_lock'),
  'no provider lifecycle row may be locked before the canonical pair lock',
);
requireInvariant(
  decision.includes('actor_snapshot.player_id = low_player_id'),
  'lifecycle rows must be locked in deterministic player order',
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
  decision.includes("'conversation.bootstrap_requested.v1'"),
  'Mission 2 must emit the conversation bootstrap request',
);
requireInvariant(
  /player_low_id is not null/.test(legacy),
  'legacy matching must remain blocked after the first authoritative match',
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
  !/where actor_account_id = actor_account_id/i.test(migration),
  'SQL contains a shadowed idempotency predicate',
);

const assertionCount = (
  databaseTest.match(/select\s+(?:is|throws_ok)\s*\(/gi) ?? []
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
