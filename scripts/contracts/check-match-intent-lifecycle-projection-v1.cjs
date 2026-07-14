const fs = require('node:fs');

const matchAuthority = fs.readFileSync(
  'supabase/migrations/202607140004_production_match_authority_v1.sql',
  'utf8',
);
const candidateAuthority = fs.readFileSync(
  'supabase/migrations/202607140006_discovery_candidate_snapshot_v1.sql',
  'utf8',
);
const lifecycleAuthority = fs.readFileSync(
  'supabase/migrations/202607140013_suspend_resume_player_v1.sql',
  'utf8',
);
const projection = fs.readFileSync(
  'supabase/migrations/202607140014_match_intent_lifecycle_projection_v1.sql',
  'utf8',
);
const dispatch = fs.readFileSync(
  'supabase/migrations/202607140035_match_intent_lifecycle_dispatch_v1.sql',
  'utf8',
);
const setAuthority = fs.readFileSync(
  'supabase/migrations/202607140020_match_set_authority_v1.sql',
  'utf8',
);
const databaseTest = fs.readFileSync(
  'supabase/tests/database/match_intent_lifecycle_projection_v1.test.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  lifecycleAuthority.includes(
    "private.enqueue_contract_event_v1(\n    'player.suspended.v1'",
  ) &&
    lifecycleAuthority.includes(
      "private.enqueue_contract_event_v1(\n    'player.resumed.v1'",
    ) &&
    !lifecycleAuthority.includes('insert into private.outbox_events'),
  'suspend/resume provider events must use the shared transactional Core V1 outbox helper',
);
requireInvariant(
  lifecycleAuthority.includes("'player.suspended.v1:%s:%s'") &&
    lifecycleAuthority.includes("'player.resumed.v1:%s:%s'"),
  'lifecycle events must deduplicate by player and lifecycle version',
);
requireInvariant(
  projection.includes('match_intent_lifecycle_projection_receipts_v1') &&
    projection.includes('request_hash_value') &&
    projection.includes("'idempotency_conflict'"),
  'projection must persist event receipts and reject conflicting event retries',
);
requireInvariant(
  projection.includes("set state = 'paused'") &&
    projection.includes('activated_at = null') &&
    projection.includes('expires_at = null'),
  'suspend/resume projection must pause active intents and clear active timestamps',
);
requireInvariant(
  !projection.includes("set state = 'active'") &&
    projection.includes("'paused_before_resume_eligibility'"),
  'resume projection must never auto-activate a Match Intent',
);
requireInvariant(
  projection.includes('current_lifecycle_version > lifecycle_version_value') &&
    projection.includes("result_code_value := 'stale_event'"),
  'stale lifecycle events must be acknowledged without reversing newer state',
);
requireInvariant(
  projection.includes("event_type_value = 'player.resumed.v1'") &&
    projection.includes("current_lifecycle_state = 'active'") &&
    projection.includes('current_discoverable'),
  'resume eligibility requires both the resumed event and authoritative active/discoverable snapshot',
);
requireInvariant(
  matchAuthority.includes('is_match_intent_lifecycle_projection_ready_v1') &&
    matchAuthority.includes(
      'Player lifecycle eligibility projection is pending.',
    ),
  'all command/read eligibility checks must fail closed while lifecycle projection is pending',
);
requireInvariant(
  candidateAuthority.includes(
    'private.is_match_intent_lifecycle_projection_ready_v1(',
  ),
  'player candidates must consume the lifecycle projection gate',
);
requireInvariant(
  setAuthority.includes(
    'private.is_match_intent_lifecycle_projection_ready_v1(',
  ),
  'Set owner discovery must consume the lifecycle projection gate',
);
requireInvariant(
  projection.includes('to service_role') &&
    projection.includes('from public, anon, authenticated'),
  'lifecycle projection must be service-only',
);
requireInvariant(
  dispatch.includes('process_pending_match_intent_lifecycle_events_v1') &&
    dispatch.includes('match_intent_lifecycle_projection_receipts_v1') &&
    dispatch.includes('for update of events skip locked'),
  'lifecycle dispatch must batch unprojected events with concurrency-safe selection',
);
requireInvariant(
  dispatch.includes('apply_player_lifecycle_to_match_intent_v1') &&
    dispatch.includes('failedCount') &&
    dispatch.includes('processedEventIds'),
  'lifecycle dispatch must invoke the idempotent projection and expose operational results',
);
requireInvariant(
  !/update\s+private\.outbox_events/i.test(dispatch) &&
    !/processed_at\s*=/.test(dispatch) &&
    !/status\s*=/.test(dispatch),
  'Match Intent dispatch must not claim shared outbox state owned by other consumers',
);
requireInvariant(
  dispatch.includes('to service_role') &&
    dispatch.includes('from public, anon, authenticated'),
  'lifecycle dispatch must be service-only',
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
    `Match Intent lifecycle projection v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Match Intent lifecycle projection v1 check passed (${assertionCount} pgTAP assertions).`,
);
