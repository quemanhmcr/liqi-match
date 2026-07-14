const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/202607140010_match_funnel_telemetry_v1.sql',
  'utf8',
);
const databaseTest = fs.readFileSync(
  'supabase/tests/database/match_funnel_telemetry_v1.test.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const eventName of [
  'match_intent_activated',
  'discovery_snapshot_created',
  'player_liked',
  'player_passed',
  'match_created',
  'conversation_ready',
]) {
  requireInvariant(
    migration.includes(`'${eventName}'`),
    `telemetry must include ${eventName}`,
  );
}
requireInvariant(
  migration.includes('unique (event_name, aggregate_id, aggregate_version)'),
  'telemetry transitions must be idempotent per aggregate version',
);
requireInvariant(
  migration.includes(
    'after update of total_candidates on private.discovery_snapshots_v1',
  ),
  'candidate count must be observed only after the snapshot is populated',
);
requireInvariant(
  migration.includes('private.command_receipts_v1') &&
    migration.includes('percentile_cont(0.95)'),
  'like command p95 must derive from shared durable receipts',
);
requireInvariant(
  migration.includes("event_type = 'match.created.v1'") &&
    migration.includes("event_type = 'conversation.bootstrap_requested.v1'"),
  'outbox lag must observe the Match-to-conversation seam',
);
requireInvariant(
  !migration.includes('update public.match_intents_v1') &&
    !migration.includes('insert into public.matches'),
  'telemetry must not decide product semantics',
);
requireInvariant(
  migration.includes('to service_role') &&
    migration.includes('from public, anon, authenticated'),
  'operational metrics must be service-only',
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
    `Match funnel telemetry v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Match funnel telemetry v1 check passed (${assertionCount} pgTAP assertions).`,
);
