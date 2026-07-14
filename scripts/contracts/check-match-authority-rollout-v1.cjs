const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/202607140009_match_authority_rollout_v1.sql',
  'utf8',
);
const databaseTest = fs.readFileSync(
  'supabase/tests/database/match_authority_rollout_v1.test.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  migration.includes('emergency_stop boolean not null default false'),
  'rollout must have an explicit emergency stop',
);
requireInvariant(
  migration.includes("'reads', 'intent_writes', 'decision_writes'"),
  'read, intent, and decision capabilities must be independent',
);
requireInvariant(
  migration.includes('config.emergency_stop') &&
    migration.indexOf('config.emergency_stop') <
      migration.indexOf('globally_enabled :='),
  'emergency stop must override global and cohort enablement',
);
requireInvariant(
  migration.includes('private.match_authority_cohorts_v1'),
  'cohort rollout persistence must be authoritative',
);
requireInvariant(
  migration.includes('to service_role') &&
    migration.includes('from public, anon, authenticated'),
  'rollout mutation functions must be service-only',
);
requireInvariant(
  migration.includes(
    'create or replace function private.match_intent_writes_enabled_v1()',
  ) &&
    migration.includes(
      'create or replace function private.match_decision_writes_enabled_v1()',
    ) &&
    migration.includes(
      'create or replace function private.discovery_reads_enabled_v1()',
    ),
  'all runtime gates must consume the rollout authority',
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
    `Match Authority rollout v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Match Authority rollout v1 check passed (${assertionCount} pgTAP assertions).`,
);
