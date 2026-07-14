const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/202607140007_match_conversation_projection_v1.sql',
  'utf8',
);
const databaseTest = fs.readFileSync(
  'supabase/tests/database/match_conversation_projection_v1.test.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  migration.includes(
    "p_event ->> 'eventType' is distinct from 'conversation.created.v1'",
  ),
  'consumer must accept only the canonical conversation.created.v1 event',
);
requireInvariant(
  migration.includes(
    "p_event ->> 'aggregateType' is distinct from 'conversation'",
  ),
  'consumer must require the shared conversation aggregate envelope',
);
requireInvariant(
  migration.includes('from public.matches matches') &&
    migration.includes('for update'),
  'consumer must lock the canonical Match before projection',
);
requireInvariant(
  migration.includes('from public.conversations conversations'),
  'conversation row must exist before Home becomes ready',
);
requireInvariant(
  migration.includes("home_status_v1 = 'conversation_ready'"),
  'consumer must persist the authoritative ready fact',
);
requireInvariant(
  migration.includes("match_row.home_status_v1 = 'closed'"),
  'a delayed consumer event must not reopen a closed Match',
);
requireInvariant(
  migration.includes(
    'match_row.correlation_id_v1 is distinct from correlation_id_value',
  ),
  'conversation correlation must remain linked to the canonical Match',
);
requireInvariant(
  migration.includes(
    "repeated_value := match_row.home_status_v1 = 'conversation_ready'",
  ),
  'consumer retry must be idempotent',
);
requireInvariant(
  !migration.includes('conversation.bootstrapped.v1'),
  'legacy event names must not become a second semantic path',
);
requireInvariant(
  migration.includes('to service_role') &&
    migration.includes('from public, anon, authenticated'),
  'projection consumer must be service-only',
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
    `Match conversation projection v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Match conversation projection v1 check passed (${assertionCount} pgTAP assertions).`,
);
