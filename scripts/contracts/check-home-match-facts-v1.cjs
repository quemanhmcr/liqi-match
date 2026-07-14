const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/202607140008_home_match_facts_v1.sql',
  'utf8',
);
const discoveryMigration = fs.readFileSync(
  'supabase/migrations/202607140006_discovery_candidate_snapshot_v1.sql',
  'utf8',
);
const databaseTest = fs.readFileSync(
  'supabase/tests/database/home_match_facts_v1.test.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  discoveryMigration.includes('private.player_summary_v1') &&
    migration.includes('private.player_summary_v1'),
  'Discover and Home must consume one PlayerSummaryV1 SQL authority',
);
requireInvariant(
  migration.includes("matches.home_status_v1 = 'conversation_ready'") &&
    migration.includes('conversations.id is not null'),
  'canMessage must require persisted conversation_ready and ConversationId',
);
requireInvariant(
  migration.includes("'kind', matches.home_kind_v1") &&
    migration.includes("'status', matches.home_status_v1"),
  'Home kind/status must come from persisted Match facts',
);
requireInvariant(
  !/["'](?:unreadCount|online|presence|notificationState)["']/.test(migration),
  'Home Match facts must not emit unread, online, presence, or notification fields',
);
requireInvariant(
  migration.includes(
    'grant execute on function public.list_home_match_facts_v1()',
  ) && migration.includes('to authenticated, service_role'),
  'authenticated mobile consumers must receive the guarded RPC capability',
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
    `Home Match Facts v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Home Match Facts v1 check passed (${assertionCount} pgTAP assertions).`,
);
