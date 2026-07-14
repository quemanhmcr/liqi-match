const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/202607140054_core_v2_party_play_session_foundation.sql',
);
const contractPath = path.join(root, 'contracts/core-v2/party/play-session.ts');
const eventPath = path.join(root, 'contracts/core-v2/events/events.ts');
const adrPath = path.join(
  root,
  'docs/adr/0005-core-v2-party-play-session-authority.md',
);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (file) => {
  if (!fs.existsSync(file)) {
    failures.push(`${path.relative(root, file)} is missing.`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
};

const migration = read(migrationPath);
const contract = read(contractPath);
const events = read(eventPath);
const adr = read(adrPath);

const requiredTables = [
  'match_sets_v2',
  'match_set_members_v2',
  'match_set_invites_v2',
  'match_set_join_requests_v2',
  'play_sessions_v2',
  'play_session_members_v2',
  'play_session_invites_v2',
  'play_session_role_assignments_v2',
  'play_session_ready_checks_v2',
  'play_session_ready_responses_v2',
  'play_session_completion_claims_v2',
];
for (const table of requiredTables) {
  expect(
    new RegExp(`create table public\\.${table}\\b`, 'i').test(migration),
    `${table} authority table is missing.`,
  );
  expect(
    new RegExp(
      `alter table public\\.${table} enable row level security`,
      'i',
    ).test(migration),
    `${table} must enable RLS.`,
  );
  expect(
    new RegExp(
      `revoke all on public\\.${table} from public, anon, authenticated`,
      'i',
    ).test(migration),
    `${table} must deny direct authenticated access.`,
  );
}

expect(
  /create table public\.match_sets_v2[\s\S]*?create table public\.play_sessions_v2/i.test(
    migration,
  ),
  'Set and Play Session must remain separate aggregates.',
);
expect(
  /owner_player_id uuid not null references public\.players\(id\)/i.test(
    migration,
  ),
  'Aggregate ownership must reference canonical PlayerId.',
);
expect(
  !/legacy_profile_id|auth_user_id\s+uuid/i.test(migration),
  'Core V2 aggregates must not introduce legacy/auth identity columns.',
);
expect(
  /private\.social_relationship_snapshot_v2\s*\(/i.test(migration),
  'Session invitation authorization must consume Senior 1 capability authority.',
);
expect(
  /canInviteToSession/i.test(migration) &&
    /relationship_blocked/i.test(migration),
  'Session invitation authorization must fail closed for capability denial/block.',
);

for (const flag of [
  'reads_enabled',
  'creation_writes_enabled',
  'mutation_writes_enabled',
  'reconciliation_writes_enabled',
]) {
  expect(
    new RegExp(`${flag} boolean not null default false`, 'i').test(migration),
    `${flag} must default disabled for rollback safety.`,
  );
}

for (const index of [
  'match_set_members_v2_active_owner_idx',
  'match_set_invites_v2_pending_target_idx',
  'match_set_join_requests_v2_pending_player_idx',
  'play_sessions_v2_source_match_idx',
  'play_sessions_v2_source_set_idx',
  'play_session_members_v2_active_owner_idx',
  'play_session_invites_v2_pending_target_idx',
  'play_session_ready_checks_v2_open_idx',
]) {
  expect(
    new RegExp(`create unique index ${index}`, 'i').test(migration),
    `${index} uniqueness invariant is missing.`,
  );
}

expect(
  /membership_version bigint not null default 1/i.test(migration) &&
    /source_aggregate_version bigint not null default 0/i.test(migration),
  'Aggregate and membership version axes must remain distinct.',
);
expect(
  /create table private\.core_v2_command_audit/i.test(migration) &&
    /audit_metadata jsonb not null/i.test(migration),
  'Core V2 mutations require durable audit metadata.',
);
expect(
  /foreign key \(command_name, account_id, idempotency_key\)[\s\S]*private\.command_receipts_v1/i.test(
    migration,
  ),
  'Core V2 audit rows must be tied to authoritative command receipts.',
);
expect(
  /create or replace function private\.play_session_membership_snapshot_v2/i.test(
    migration,
  ) && /'membershipVersion'/i.test(migration),
  'Conversation consumers require a versioned full membership snapshot.',
);
expect(
  /create or replace function private\.play_session_snapshot_v2/i.test(
    migration,
  ) && /'communication'/i.test(migration),
  'Play Session read authority must include communication projection status.',
);
expect(
  !/grant (select|insert|update|delete|all) on public\.(match_sets_v2|play_sessions_v2)[\s\S]*to authenticated/i.test(
    migration,
  ),
  'Core V2 aggregate tables must remain RPC-only.',
);

expect(
  /export const PlaySessionIdSchema/i.test(
    read(path.join(root, 'contracts/core-v2/identity/semantic-ids.ts')),
  ),
  'PlaySessionId must be a dedicated S2 semantic ID.',
);
expect(
  /PlaySessionMembershipProjectionV2Schema[\s\S]*membershipVersion/i.test(
    contract,
  ),
  'Shared contract must expose a monotonic membership projection.',
);
expect(
  /SessionCompletedEventV2Schema[\s\S]*participantPlayerIds[\s\S]*scheduledFor[\s\S]*verification/i.test(
    events,
  ),
  'Completed event must carry authoritative participants and timing semantics.',
);
expect(
  /Conversation creation is not part of the Session transaction/i.test(adr),
  'ADR must explicitly forbid a fake distributed transaction.',
);
expect(
  /participant-attested|participant quorum/i.test(adr),
  'ADR must state participant-quorum completion semantics.',
);

if (failures.length) {
  console.error('Party/Session authority v2 check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `Party/Session authority v2 check passed (${requiredTables.length} public authority tables).`,
);
