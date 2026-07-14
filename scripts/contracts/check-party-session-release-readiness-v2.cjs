const fs = require('node:fs');
const PgQueryModule = require('pg-query-emscripten').default;

const migration = fs.readFileSync(
  'supabase/migrations/202607141462_party_session_release_readiness_v2.sql',
  'utf8',
);
const test = fs.readFileSync(
  'supabase/tests/database/party_session_release_readiness_v2.test.sql',
  'utf8',
);
const runbook = fs.readFileSync(
  'docs/runbooks/party-session-v2-rollout.md',
  'utf8',
);
const apiRunner = fs.readFileSync(
  'scripts/e2e/party-session-api-v2.cjs',
  'utf8',
);
const apiTest = fs.readFileSync(
  'scripts/e2e/__tests__/party-session-api-v2.test.cjs',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  migration.includes('create table private.party_session_api_e2e_runs_v2') &&
    migration.includes('recorded_at timestamptz') &&
    migration.includes('on conflict (run_id) do update'),
  'API E2E evidence must be durable, deterministic and idempotent',
);
requireInvariant(
  migration.includes('get_party_session_release_readiness_v2') &&
    migration.includes("interval '24 hours'") &&
    migration.includes("latest_e2e.status = 'passed'"),
  'readiness must require fresh passing API-mode E2E evidence',
);
for (const metric of [
  'sessionCreatedCount',
  'sessionInviteCreatedCount',
  'sessionMemberJoinedCount',
  'inviteAcceptanceRate',
  'readyCheckOpenedCount',
  'readyCheckPassedCount',
  'readyCheckExpiredCount',
  'readyPassRate',
  'sessionStartedCount',
  'sessionCompletedCount',
  'sessionDisputedCount',
  'sessionCancelledCount',
  'completionRate',
]) {
  requireInvariant(
    migration.includes(`'${metric}'`),
    `missing funnel metric ${metric}`,
  );
}
for (const metric of [
  'staleCommunicationCount',
  'overdueReadyCheckCount',
  'dueSocialRetryCount',
  'ownerInvariantViolationCount',
  'capacityInvariantViolationCount',
  'readyStateInvariantViolationCount',
  'completionEventInvariantViolationCount',
]) {
  requireInvariant(
    migration.includes(`'${metric}'`),
    `missing operational metric ${metric}`,
  );
}
requireInvariant(
  migration.includes(
    "projections.updated_at < generated_at - interval '5 minutes'",
  ) &&
    migration.includes('checks.deadline_at <= generated_at') &&
    migration.includes('failures.available_at <= generated_at'),
  'readiness must detect stale communication, overdue ready checks and due safety retries',
);
requireInvariant(
  migration.includes("events.event_type = 'session.completed.v2'") &&
    migration.includes("members.role = 'owner'") &&
    migration.includes('> sessions.capacity') &&
    migration.includes(
      'required_membership_version <> sessions.membership_version',
    ),
  'readiness must project canonical aggregate invariants',
);
requireInvariant(
  migration.includes('config_row.reads_enabled') &&
    migration.includes('config_row.creation_writes_enabled') &&
    migration.includes('config_row.mutation_writes_enabled') &&
    migration.includes('config_row.reconciliation_writes_enabled'),
  'readiness and rollback must project all authority flags',
);
requireInvariant(
  migration.includes(
    'grant execute on function public.get_party_session_release_readiness_v2(interval)',
  ) &&
    migration.includes('to service_role;') &&
    migration.includes('from public, anon, authenticated;'),
  'operational readiness must be service-role only',
);
requireInvariant(
  /create_play_session_v2[\s\S]*accept_session_invite_v2[\s\S]*open_ready_check_v2[\s\S]*respond_ready_check_v2[\s\S]*start_session_v2[\s\S]*propose_session_completion_v2/.test(
    apiRunner,
  ),
  'API E2E must cover the authoritative Session lifecycle RPCs',
);
requireInvariant(
  apiRunner.includes("error.code === 'version_conflict'") &&
    apiRunner.includes('restartedDeviceB') &&
    apiRunner.includes('record_party_session_api_e2e_result_v2') &&
    apiRunner.includes(
      "serviceRoleKey: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY')",
    ) &&
    apiTest.includes('toHaveLength(3)'),
  'API E2E must prove stale rejection, retry and process restart',
);
requireInvariant(
  runbook.includes('creation_writes_enabled = false') &&
    runbook.includes('mutation_writes_enabled = false') &&
    runbook.includes('reconciliation_writes_enabled = false') &&
    runbook.includes('reads_enabled = true'),
  'runbook must define a read-preserving rollback posture',
);
for (const preserved of [
  'outbox events',
  'command receipts',
  'audits',
  'Social consumed-event receipts',
  'API E2E evidence',
]) {
  requireInvariant(
    runbook.includes(preserved),
    `rollback runbook must preserve ${preserved}`,
  );
}
requireInvariant(
  runbook.includes('Never dual-write') &&
    runbook.includes('Never delete or rewrite membership'),
  'rollback must forbid dual-write and destructive history rewrites',
);

const assertionCount = (
  test.match(
    /select\s+(?:has_table|has_function|function_privs_are|is|ok|throws_like)\s*\(/gi,
  ) ?? []
).length;
const planned = Number(test.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  planned === assertionCount && assertionCount >= 25,
  `pgTAP plan=${planned}, assertions=${assertionCount}`,
);

(async () => {
  const parser = await new PgQueryModule();
  for (const [label, sql] of [
    ['migration', migration],
    ['pgTAP', test],
  ]) {
    const parsed = parser.parse(sql);
    if (parsed.error)
      failures.push(`${label} SQL parse failed: ${parsed.error.message}`);
  }
  if (failures.length) {
    console.error('Party/Session release readiness v2 check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    `Party/Session release readiness v2 check passed (${assertionCount} pgTAP assertions).`,
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
