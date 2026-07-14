const fs = require('node:fs');
const baseMigration = fs.readFileSync(
  'supabase/migrations/202607140039_return_loop_release_readiness_v1.sql',
  'utf8',
);
const funnelGuardMigration = fs.readFileSync(
  'supabase/migrations/202607140040_return_loop_match_funnel_guard_v1.sql',
  'utf8',
);
const deterministicE2eMigration = fs.readFileSync(
  'supabase/migrations/202607140046_deterministic_return_loop_e2e_order_v1.sql',
  'utf8',
);
const migration = `${baseMigration}\n${funnelGuardMigration}\n${deterministicE2eMigration}`;
const test = fs.readFileSync(
  'supabase/tests/database/return_loop_release_readiness_v1.test.sql',
  'utf8',
);
const e2eRunner = fs.readFileSync('scripts/e2e/return-loop-api-v1.cjs', 'utf8');
const e2eTest = fs.readFileSync(
  'scripts/e2e/__tests__/return-loop-api-v1.test.cjs',
  'utf8',
);
const failures = [];
const requireInvariant = (value, message) => {
  if (!value) failures.push(message);
};

requireInvariant(
  /add column core_loop_enabled boolean not null default true/i.test(
    migration,
  ) && /return_loop_feature_enabled_without_master_v1/i.test(migration),
  'Feature hierarchy must add a compatibility-safe master kill switch.',
);
requireInvariant(
  /core_loop_enabled[\s\S]*return_loop_feature_enabled_without_master_v1/i.test(
    migration,
  ),
  'Master kill switch must dominate all lower-level cohort flags.',
);
requireInvariant(
  /home_reads_enabled/i.test(baseMigration) &&
    !/->> 'home_enabled'/i.test(baseMigration),
  'Readiness must read the authoritative Home kill-switch column.',
);
requireInvariant(
  /duplicateNotificationCount[\s\S]*deepLinkSuccessRate[\s\S]*pushProviderErrorCount[\s\S]*stalePushJobCount/i.test(
    migration,
  ),
  'Readiness projection must expose integrated duplicate, deep-link, push and backlog metrics.',
);
requireInvariant(
  /get_match_funnel_metrics_v1/i.test(funnelGuardMigration) &&
    /matchConversationDivergenceCount/i.test(funnelGuardMigration) &&
    /unexplainedMatchConversationDivergenceCount/i.test(funnelGuardMigration),
  'Release readiness must consume Mission 2 funnel metrics without recomputing Match semantics.',
);
requireInvariant(
  /unexplained_divergence_count = 0[\s\S]*oldest_pending_seconds <= 300/i.test(
    funnelGuardMigration,
  ),
  'Funnel guard must block unexplained divergence and stale pending bootstrap work.',
);
requireInvariant(
  /deep_link_success_rate >= 0\.99/i.test(migration),
  'Deep-link SLO gate must enforce at least 99 percent success.',
);
requireInvariant(
  /latest_e2e\.status = 'passed'[\s\S]*interval '24 hours'/i.test(migration),
  'Readiness must require a fresh passing API-mode E2E run.',
);
requireInvariant(
  /record_return_loop_api_e2e_result_v1/i.test(migration) &&
    /on conflict \(run_id\) do update/i.test(migration),
  'API-mode E2E evidence must be durable and idempotent by run id.',
);
requireInvariant(
  /add column recorded_at timestamptz/i.test(deterministicE2eMigration) &&
    /recorded_at = clock_timestamp\(\)/i.test(deterministicE2eMigration) &&
    /order by run\.completed_at desc,\s*run\.recorded_at desc,\s*run\.run_id desc/i.test(
      deterministicE2eMigration,
    ),
  'Latest API-mode E2E evidence must use a deterministic authority-write tie-breaker.',
);
requireInvariant(
  /deviceA\.rpc\(\s*'send_message_v1'/m.test(e2eRunner) &&
    /deviceB\.rpc\(\s*'get_conversation_timeline_v1'/m.test(e2eRunner) &&
    /deviceB\.rpc\(\s*'advance_conversation_read_v1'/m.test(e2eRunner) &&
    /restartedDeviceB\.rpc\(\s*'get_conversation_surface_v1'/m.test(e2eRunner),
  'API-mode E2E must execute production Conversation send, timeline, read, and restart paths.',
);
requireInvariant(
  /retrySend\.message\.messageId !== firstSend\.message\.messageId/i.test(
    e2eRunner,
  ) &&
    /retrySend\.message\.sequence !== firstSend\.message\.sequence/i.test(
      e2eRunner,
    ) &&
    /retryRead[\s\S]*repeated:\s*true/i.test(e2eRunner),
  'API-mode E2E must prove idempotent message and read retries using authoritative IDs and sequence.',
);
requireInvariant(
  /pollUntil\(\s*'canonical Match-to-Conversation readiness'/m.test(
    e2eRunner,
  ) && /hasHomeCoreLoop\(home, input\)/i.test(e2eRunner),
  'API-mode E2E must wait for canonical conversation readiness instead of assuming mutual-like is synchronous.',
);
requireInvariant(
  /baselineNotificationIds/i.test(e2eRunner) &&
    /newMessageNotifications/i.test(e2eRunner) &&
    /Expected exactly one new message notification/i.test(e2eRunner),
  'API-mode E2E must discover the notification produced by the sent message and reject duplicates.',
);
requireInvariant(
  e2eTest.includes('sendBodies[1]).toEqual(sendBodies[0])') &&
    e2eTest.includes('readBodies[1]).toEqual(readBodies[0])') &&
    e2eTest.includes('duplicate notifications'),
  'E2E provider tests must lock exact retry payloads and duplicate notification failure.',
);
requireInvariant(
  /grant execute on function public\.get_return_loop_release_readiness_v1\(interval\)[\s\S]*to service_role/i.test(
    migration,
  ),
  'Integrated readiness projection must be operational, not a public client endpoint.',
);

const assertionCount = (
  test.match(/select\s+(?:is|ok|isnt|throws_ok)\s*\(/gi) ?? []
).length;
const plannedCount = Number(test.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);
if (failures.length) {
  console.error(
    `Return-loop release readiness check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}
console.log(
  `Return-loop release readiness check passed (${assertionCount} pgTAP assertions).`,
);
