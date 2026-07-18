const fs = require('node:fs');

const { E2E_DISPOSABLE_PROJECT } = require('../supabase/project-registry.cjs');

const runner = fs.readFileSync(
  'scripts/e2e/party-session-cloud-db-v2.cjs',
  'utf8',
);
const bootstrap = fs.readFileSync(
  'scripts/e2e/sql/party-session-cloud-db-bootstrap-v2.sql',
  'utf8',
);
const runtime = fs.readFileSync(
  'supabase/tests/database/party_session_runtime_v2.test.sql',
  'utf8',
);

const expectedRef = E2E_DISPOSABLE_PROJECT.projectRef;
const expectedSuites = [
  ['match_set_authority_v1.test.sql', 31],
  ['match_set_dashboard_identity_v2.test.sql', 18],
  ['repeat_play_session_consumer_v2.test.sql', 12],
  ['core_v2_completed_session_consumer.test.sql', 36],
  ['session_social_safety_consumer_v2.test.sql', 47],
  ['party_session_release_readiness_v2.test.sql', 29],
  ['party_session_runtime_v2.test.sql', 58],
  ['decline_session_invite_v2.test.sql', 18],
  ['session_conversation_dispatch_runtime_v2.test.sql', 31],
];
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  runner.includes('requireExplicitProjectTarget') &&
    runner.includes('assertLinkedProjectTarget') &&
    runner.includes("'e2e-disposable'") &&
    !runner.includes('staging-runtime'),
  'cloud runner must use the central E2E allowlist and verify the linked project role',
);
requireInvariant(
  runner.includes("const SUPABASE_CLI = 'supabase@2.109.1'") &&
    runner.includes("'db',") &&
    runner.includes("'query',") &&
    runner.includes("'--linked',"),
  'cloud runner must pin Supabase CLI 2.109.1 and execute linked DB queries',
);
requireInvariant(
  runner.includes('/\\bnot ok\\b/i') &&
    runner.includes('Looks like you planned') &&
    runner.includes('Did not observe final pgTAP assertion'),
  'cloud runner must reject failed assertions, plan mismatches, and truncated output',
);

let total = 0;
for (const [name, plan] of expectedSuites) {
  requireInvariant(runner.includes(name), `runner is missing ${name}`);
  const path = `supabase/tests/database/${name}`;
  const sql = fs.readFileSync(path, 'utf8');
  const actualPlan = Number(sql.match(/select\s+plan\((\d+)\);/i)?.[1]);
  requireInvariant(actualPlan === plan, `${name} plan must be ${plan}`);
  total += plan;
}
requireInvariant(
  total === 280,
  `cloud proof must total 280 assertions, got ${total}`,
);
requireInvariant(
  runner.includes(
    'ALL_PARTY_SESSION_CLOUD_DB_PASS suites=${suites.length} assertions=${assertionCount} project_ref=${linkedProjectRef}',
  ),
  'runner must emit the aggregate success marker',
);

for (const invariant of [
  'messages.source_event_id = source_event_id_value',
  'started_at = clock_timestamp()',
  "started_at + interval ''1 microsecond''",
  'occurred_at_value timestamptz := clock_timestamp()',
]) {
  requireInvariant(
    bootstrap.includes(invariant),
    `bootstrap is missing deployed-function invariant: ${invariant}`,
  );
}

for (const rpc of [
  'create_play_session_v2',
  'list_my_session_invites_v2',
  'accept_session_invite_v2',
  'consume_session_conversation_event_v2',
  'open_ready_check_v2',
  'respond_ready_check_v2',
  'start_session_v2',
  'propose_session_completion_v2',
  'consume_session_completed_v2',
  'get_play_session_v2',
]) {
  requireInvariant(runtime.includes(rpc), `runtime proof is missing ${rpc}`);
}
requireInvariant(
  runtime.includes("'%version_conflict%'") &&
    runtime.includes('create_replay') &&
    runtime.includes('conversation_join_replay') &&
    runtime.includes('trust_replay'),
  'runtime proof must cover stale rejection and three replay boundaries',
);
requireInvariant(
  runtime.includes('begin;') &&
    runtime.includes('select * from finish();') &&
    runtime.includes('rollback;'),
  'runtime proof must be rollback-only pgTAP',
);
requireInvariant(
  !/insert\s+into\s+public\.play_sessions_v2/i.test(runtime) &&
    !/insert\s+into\s+public\.conversations_v2/i.test(runtime),
  'runtime proof must create Session and Conversation only through authority RPC/event seams',
);
requireInvariant(
  !/(SUPABASE_DB_PASSWORD|SERVICE_ROLE_KEY|ANON_KEY)\s*=/.test(
    `${runner}\n${bootstrap}\n${runtime}`,
  ),
  'cloud evidence must not embed credentials',
);

if (failures.length) {
  console.error('Party/Session cloud DB evidence check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `Party/Session cloud DB evidence check passed (${expectedSuites.length} suites, ${total} assertions, project_ref=${expectedRef}).`,
);
