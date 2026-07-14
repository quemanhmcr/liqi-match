const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607141420_core_v2_trust_commands.sql';
const databaseTestPath =
  'supabase/tests/database/core_v2_trust_commands.test.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const databaseTest = fs.readFileSync(databaseTestPath, 'utf8');
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

function functionBlock(functionName, nextFunctionName) {
  const start = migration.indexOf(`create or replace function ${functionName}`);
  if (start < 0) return '';
  const end = nextFunctionName
    ? migration.indexOf(`create or replace function ${nextFunctionName}`, start)
    : migration.length;
  return migration.slice(start, end < 0 ? migration.length : end);
}

const confirmBlock = functionBlock(
  'public.confirm_session_participation_v2',
  'public.dispute_session_participation_v2',
);
const disputeBlock = functionBlock(
  'public.dispute_session_participation_v2',
  'public.submit_player_endorsement_v2',
);
const endorsementBlock = functionBlock(
  'public.submit_player_endorsement_v2',
  null,
);

for (const [name, block] of [
  ['confirm_session_participation_v2', confirmBlock],
  ['dispute_session_participation_v2', disputeBlock],
  ['submit_player_endorsement_v2', endorsementBlock],
]) {
  requireInvariant(block.length > 0, `${name} RPC must exist`);
  requireInvariant(
    block.includes('private.resolve_trust_actor_v2(true, true)'),
    `${name} must use active Core V1 identity/lifecycle authority`,
  );
  requireInvariant(
    block.includes('private.validate_command_audit_v2(p_audit)'),
    `${name} must validate audit metadata`,
  );
  requireInvariant(
    block.includes('private.begin_command_v1(') &&
      block.includes('private.finish_command_v1(') &&
      block.includes("'{repeated}'"),
    `${name} must use durable idempotent command receipts`,
  );
  requireInvariant(
    block.includes('private.enqueue_contract_event_v2('),
    `${name} must emit at least one versioned Core V2 event`,
  );
  requireInvariant(
    block.includes("'aggregateId'") &&
      block.includes("'aggregateVersion'") &&
      block.includes("'eventIds'") &&
      block.includes("'resultCode'"),
    `${name} receipt must carry authoritative aggregate and event metadata`,
  );
}

requireInvariant(
  migration.includes('private.validate_command_audit_v2') &&
    migration.includes('p_audit ?& array[') &&
    migration.includes("'clientCreatedAt'") &&
    migration.includes("'clientRequestId'") &&
    migration.includes("'platform'") &&
    migration.includes("'deviceInstallationId'"),
  'Commands must require canonical client audit metadata and reject unknown fields',
);
requireInvariant(
  confirmBlock.includes("outcome_row.state = 'disputed'") &&
    confirmBlock.includes('outcome_row.version <> p_expected_version') &&
    confirmBlock.includes(
      'private.outcome_all_participation_confirmed_v2(outcome_row.id)',
    ),
  'Confirmation must reject disputed/stale outcomes and wait for every participant',
);
const fullConfirmationIndex = confirmBlock.indexOf(
  'private.outcome_all_participation_confirmed_v2(outcome_row.id)',
);
const completedLedgerIndex = confirmBlock.indexOf(
  'private.append_reputation_ledger_entry_v2(',
);
requireInvariant(
  fullConfirmationIndex >= 0 && completedLedgerIndex > fullConfirmationIndex,
  'Completed-session ledger facts must only be appended inside the full-confirmation branch',
);
requireInvariant(
  confirmBlock.includes("'completed_sessions'") &&
    confirmBlock.includes("'participation_confirmation'") &&
    confirmBlock.includes("'session.participation_confirmed.v2'") &&
    confirmBlock.includes('private.emit_reputation_progress_v2('),
  'Final confirmation must create explainable ledger facts and reputation/activity events',
);
requireInvariant(
  disputeBlock.includes("set state = 'disputed'") &&
    disputeBlock.includes("'session.participation_disputed.v2'") &&
    !disputeBlock.includes('private.append_reputation_ledger_entry_v2(') &&
    !disputeBlock.includes("'completed_sessions'"),
  'Dispute must record immutable evidence without positive reputation mutation',
);
requireInvariant(
  endorsementBlock.includes('p_expected_version <> 0') &&
    endorsementBlock.includes(
      'outcome_row.version <> p_expected_outcome_version',
    ) &&
    endorsementBlock.includes("'self_endorsement_forbidden'") &&
    endorsementBlock.includes(
      'private.outcome_all_participation_confirmed_v2(outcome_row.id)',
    ) &&
    endorsementBlock.includes("'endorsement_already_submitted'"),
  'Endorsement must use create-version zero, dependency versioning, no self endorsement, full confirmation, and semantic dedupe',
);
requireInvariant(
  endorsementBlock.includes("'positive_endorsements'") &&
    endorsementBlock.includes("'endorsement'") &&
    endorsementBlock.includes("'player.endorsed.v2'") &&
    endorsementBlock.includes('private.emit_reputation_progress_v2('),
  'Endorsements must create immutable explainable facts and versioned reputation/activity events',
);
requireInvariant(
  migration.includes("'player.reputation_changed.v2'") &&
    migration.includes("'reputation_progress'") &&
    migration.includes('p_activity_deduplication_key'),
  'Trust mutations must produce event-backed reputation progress activity',
);
requireInvariant(
  migration
    .split(/security definer/i)
    .slice(1)
    .every((block) => /^\s*set search_path = ''/i.test(block)),
  'Every security-definer function must pin an empty search_path',
);
const normalizedMigration = migration.replace(/\s+/g, ' ');
for (const functionName of [
  'confirm_session_participation_v2',
  'dispute_session_participation_v2',
  'submit_player_endorsement_v2',
]) {
  const grantStart = normalizedMigration.indexOf(
    `grant execute on function public.${functionName}(`,
  );
  const grantEnd = normalizedMigration.indexOf(';', grantStart);
  const grantStatement =
    grantStart >= 0 && grantEnd > grantStart
      ? normalizedMigration.slice(grantStart, grantEnd + 1)
      : '';
  const revokeStart = normalizedMigration.indexOf(
    `revoke execute on function public.${functionName}(`,
  );
  const revokeEnd = normalizedMigration.indexOf(';', revokeStart);
  const revokeStatement =
    revokeStart >= 0 && revokeEnd > revokeStart
      ? normalizedMigration.slice(revokeStart, revokeEnd + 1)
      : '';
  requireInvariant(
    grantStatement.endsWith('to authenticated, service_role;') &&
      revokeStatement.endsWith('from public, anon;'),
    `${functionName} must be granted only to authenticated/service_role after public/anon revoke`,
  );
}
requireInvariant(
  !/auth\.uid\(\)/.test(migration),
  'Trust commands must never use auth.uid() as PlayerId',
);

const assertionCount = (
  databaseTest.match(
    /select\s+(?:has_function|has_table|is|isnt|ok|lives_ok|throws_ok|throws_like)\s*\(/gi,
  ) ?? []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);
for (const evidence of [
  'partial confirmation does not create completed-session reputation facts',
  'same idempotency key cannot mutate a different request',
  'full confirmation creates one immutable completion fact per participant',
  'endorsement replay creates no duplicate aggregate',
  'self endorsement is rejected',
  'disputed session creates no positive completed-session ledger fact',
  'positive confirmation is blocked after a dispute',
  'missing audit metadata fails before mutation',
  'suspended lifecycle fails closed before command execution',
  'anonymous callers cannot execute trust commands',
]) {
  requireInvariant(
    databaseTest.includes(evidence),
    `pgTAP must prove: ${evidence}`,
  );
}

if (failures.length) {
  console.error(
    `Core V2 trust commands check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Core V2 trust commands check passed (${assertionCount} pgTAP assertions).`,
);
