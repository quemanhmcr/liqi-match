const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/202607140020_match_set_authority_v1.sql',
  'utf8',
);
const databaseTest = fs.readFileSync(
  'supabase/tests/database/match_set_authority_v1.test.sql',
  'utf8',
);
const receiptMigration = fs.readFileSync(
  'supabase/migrations/202607140043_match_set_receipt_contract_v1.sql',
  'utf8',
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};
const inviteStart = migration.indexOf(
  'create or replace function public.create_set_invite_v1',
);
const joinStart = migration.indexOf(
  'create or replace function public.request_set_join_v1',
);
const invite = migration.slice(inviteStart, joinStart);
const join = migration.slice(joinStart);

requireInvariant(
  !migration.includes('create table private.discovery_snapshots_v1') &&
    !migration.includes(
      'create or replace function public.record_player_decision_v1',
    ),
  'Set migration must be additive and must not duplicate Match/Discovery authority',
);

requireInvariant(
  migration.includes('unique (snapshot_id, set_id)') &&
    migration.includes('unique (snapshot_id, next_ordinal)'),
  'Set snapshots and cursors must prevent duplicate pages',
);
requireInvariant(
  migration.includes('snapshot_row.intent_version <> actor_intent.version'),
  'Set cursors must bind to one Match Intent version',
);
requireInvariant(
  migration.includes(
    'private.is_player_discovery_eligible_v1(sets.owner_player_id)',
  ),
  'Set discovery must consume lifecycle authority',
);
requireInvariant(
  migration.includes('private.assert_active_match_intent_v1'),
  'Set reads and commands must require active Match Intent',
);
for (const command of [invite, join]) {
  requireInvariant(
    command.includes('private.begin_command_v1') &&
      command.includes('private.finish_command_v1'),
    'Set commands must use shared durable receipts',
  );
  requireInvariant(
    command.indexOf('pg_advisory_xact_lock') < command.indexOf('for update'),
    'Set advisory lock must precede aggregate row lock',
  );
  requireInvariant(
    !command.includes('insert into public.match_set_members_v1'),
    'pending Set commands must not mutate membership',
  );
  requireInvariant(
    !command.includes('insert into public.matches'),
    'pending Set commands must not create Match semantics',
  );
}
requireInvariant(
  invite.includes("'set.invite_created.v1'") &&
    invite.includes("'set_invite_created'"),
  'invite event and notification must be transactional',
);
requireInvariant(
  join.includes("'set.join_requested.v1'") &&
    join.includes("'set_join_requested'"),
  'join event and notification must be transactional',
);
requireInvariant(
  receiptMigration.includes("'createdAt', invite.created_at") &&
    receiptMigration.includes("'setId', invite.set_id") &&
    receiptMigration.includes("'targetPlayerId', invite.target_player_id"),
  'invite receipts must carry canonical Set and target facts',
);
requireInvariant(
  receiptMigration.includes("'createdAt', join_request.created_at") &&
    receiptMigration.includes("'setId', join_request.set_id"),
  'join receipts must carry canonical Set facts',
);
requireInvariant(
  receiptMigration.includes('command_state.response || jsonb_build_object') &&
    receiptMigration.includes("command_state.response ? 'inviteId'") &&
    receiptMigration.includes("command_state.response ? 'joinRequestId'"),
  'forward migration must enrich durable receipts created before migration 043',
);
requireInvariant(
  migration.includes("where state = 'pending'") &&
    migration.includes(
      'on public.match_set_invites_v1 (set_id, target_player_id)',
    ) &&
    migration.includes(
      'on public.match_set_join_requests_v1 (set_id, requester_player_id)',
    ),
  'pending invite/join uniqueness must be database-enforced',
);
requireInvariant(
  migration.includes('get_player_lifecycle_snapshot_v1(low_player_id, true)') &&
    migration.includes(
      'get_player_lifecycle_snapshot_v1(high_player_id, true)',
    ),
  'invite command must lock actor/target lifecycle in canonical order',
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
    `Match Set Authority v1 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Match Set Authority v1 check passed (${assertionCount} pgTAP assertions).`,
);
