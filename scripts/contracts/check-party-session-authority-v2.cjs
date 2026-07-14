const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/202607140054_core_v2_party_play_session_foundation.sql',
);
const walkingMigrationPath = path.join(
  root,
  'supabase/migrations/202607141200_core_v2_play_session_walking_skeleton.sql',
);
const setCommandMigrationPath = path.join(
  root,
  'supabase/migrations/202607141210_core_v2_match_set_commands.sql',
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

function functionSql(sql, name) {
  const pattern = new RegExp(
    `create or replace function\\s+${name.replaceAll('.', '\\.')}` +
      `[\\s\\S]*?\\$\\$;`,
    'i',
  );
  return pattern.exec(sql)?.[0] ?? '';
}

const read = (file) => {
  if (!fs.existsSync(file)) {
    failures.push(`${path.relative(root, file)} is missing.`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
};

const migration = read(migrationPath);
const walkingMigration = read(walkingMigrationPath);
const setCommandMigration = read(setCommandMigrationPath);
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

const mutationFunctions = [
  'public.create_session_from_match_v2',
  'public.invite_to_session_v2',
  'public.accept_session_invite_v2',
  'public.open_ready_check_v2',
  'public.respond_ready_check_v2',
  'public.start_session_v2',
  'public.propose_session_completion_v2',
  'public.cancel_session_v2',
];
for (const functionName of mutationFunctions) {
  const sql = functionSql(walkingMigration, functionName);
  expect(sql.length > 0, `${functionName} RPC is missing.`);
  expect(
    /private\.begin_command_v1\s*\(/i.test(sql) &&
      /private\.finish_command_v1\s*\(/i.test(sql),
    `${functionName} must use authoritative durable receipts.`,
  );
  expect(
    /private\.record_core_v2_command_audit\s*\(/i.test(sql),
    `${functionName} must persist audit metadata.`,
  );
  expect(
    /p_correlation_id/i.test(sql) && /p_expected_version/i.test(sql),
    `${functionName} must require correlation and expected-version semantics.`,
  );
  expect(
    /private\.assert_party_session_feature_v2\s*\(/i.test(sql),
    `${functionName} must respect the server-side rollback gate.`,
  );
  expect(
    /private\.enqueue_contract_event_v2\s*\(/i.test(sql),
    `${functionName} must emit at least one versioned outbox event.`,
  );
}

for (const functionName of [
  'public.invite_to_session_v2',
  'public.accept_session_invite_v2',
  'public.open_ready_check_v2',
  'public.respond_ready_check_v2',
  'public.start_session_v2',
  'public.propose_session_completion_v2',
  'public.cancel_session_v2',
]) {
  const sql = functionSql(walkingMigration, functionName);
  expect(
    /pg_advisory_xact_lock/i.test(sql) && /for update/i.test(sql),
    `${functionName} must serialize the aggregate before transition checks.`,
  );
  expect(
    /session_row\.version\s*<>\s*p_expected_version/i.test(sql),
    `${functionName} must reject stale aggregate writes.`,
  );
}

const acceptInviteSql = functionSql(
  walkingMigration,
  'public.accept_session_invite_v2',
);
expect(
  /active_count\s*>=\s*session_row\.capacity/i.test(acceptInviteSql),
  'Accept Session invite must enforce capacity while holding the aggregate lock.',
);
expect(
  /private\.assert_session_invite_eligible_v2/i.test(acceptInviteSql) &&
    /private\.are_players_blocked_v2/i.test(acceptInviteSql),
  'Accept Session invite must re-check relationship authority at write time.',
);

const completionSql = functionSql(
  walkingMigration,
  'public.propose_session_completion_v2',
);
for (const eventType of [
  'session.completion_proposed.v2',
  'session.completed.v2',
  'session.disputed.v2',
]) {
  expect(
    completionSql.includes(`'${eventType}'`),
    `Completion authority must emit ${eventType}.`,
  );
}
expect(
  /completed_claim_count\s*=\s*participant_count/i.test(completionSql) &&
    /'verification',\s*'participant_quorum'/i.test(completionSql),
  'Completed Session authority must require participant quorum explicitly.',
);

const readyResponseSql = functionSql(
  walkingMigration,
  'public.respond_ready_check_v2',
);
expect(
  /session\.member_ready\.v2/i.test(readyResponseSql) &&
    /session\.member_not_ready\.v2/i.test(readyResponseSql),
  'Every ready response mutation must publish a stable event type.',
);
expect(
  /session\.ready_check_passed\.v2/i.test(readyResponseSql) &&
    /session\.scheduled\.v2/i.test(readyResponseSql),
  'Ready quorum must publish passed and scheduled facts.',
);

for (const functionName of [
  'public.get_play_session_v2',
  'public.list_current_play_sessions_v2',
  'public.list_my_session_invites_v2',
]) {
  const sql = functionSql(walkingMigration, functionName);
  expect(sql.length > 0, `${functionName} read RPC is missing.`);
  expect(
    /assert_party_session_feature_v2\('read'\)/i.test(sql) &&
      /resolve_party_session_actor_v2\(true, false\)/i.test(sql),
    `${functionName} must use active canonical identity and the read gate.`,
  );
}

const conversationReceiptSql = functionSql(
  walkingMigration,
  'public.record_session_conversation_projection_v2',
);
expect(
  /p_accepted_membership\s+is distinct from\s+current_membership/i.test(
    conversationReceiptSql,
  ) && /membership_version/i.test(conversationReceiptSql),
  'Conversation receipts must match the full current membership projection.',
);
expect(
  /jsonb_typeof\(p_accepted_membership -> 'members'\)/i.test(
    conversationReceiptSql,
  ) && /membershipVersion'\) !~ '\^\[1-9\]/i.test(conversationReceiptSql),
  'Malformed conversation receipts must fail validation before UUID/version casts.',
);
expect(
  /revoke execute on function public\.record_session_conversation_projection_v2[\s\S]*from public, anon, authenticated/i.test(
    walkingMigration,
  ) &&
    /grant execute on function public\.record_session_conversation_projection_v2[\s\S]*to service_role/i.test(
      walkingMigration,
    ),
  'Conversation reconciliation must be service-role only.',
);

const expirationSql = functionSql(
  walkingMigration,
  'public.expire_play_session_ready_checks_v2',
);
expect(
  /for update skip locked/i.test(expirationSql) &&
    /session\.ready_check_expired\.v2/i.test(expirationSql),
  'Ready-check timeout worker must be deterministic, concurrent-safe, and evented.',
);
expect(
  /revoke execute on function public\.expire_play_session_ready_checks_v2[\s\S]*from public, anon, authenticated/i.test(
    walkingMigration,
  ) &&
    /grant execute on function public\.expire_play_session_ready_checks_v2[\s\S]*to service_role/i.test(
      walkingMigration,
    ),
  'Ready-check timeout worker must be service-role only.',
);

const setMutationFunctions = [
  'public.create_match_set_v2',
  'public.update_match_set_v2',
  'public.close_match_set_v2',
  'public.reopen_match_set_v2',
  'public.invite_to_set_v2',
  'public.request_set_join_v2',
];
for (const functionName of setMutationFunctions) {
  const sql = functionSql(setCommandMigration, functionName);
  expect(sql.length > 0, `${functionName} RPC is missing.`);
  expect(
    /private\.begin_command_v1\s*\(/i.test(sql) &&
      /private\.finish_command_v1\s*\(/i.test(sql),
    `${functionName} must use authoritative durable receipts.`,
  );
  expect(
    /private\.record_core_v2_command_audit\s*\(/i.test(sql),
    `${functionName} must persist Core V2 audit metadata.`,
  );
  expect(
    /p_correlation_id/i.test(sql) && /p_expected_version/i.test(sql),
    `${functionName} must require correlation and expected-version semantics.`,
  );
  expect(
    /private\.assert_party_session_feature_v2\s*\(/i.test(sql),
    `${functionName} must respect the server-side feature gate.`,
  );
  expect(
    /private\.enqueue_contract_event_v2\s*\(/i.test(sql),
    `${functionName} must emit at least one versioned Set event.`,
  );
}

for (const functionName of [
  'public.update_match_set_v2',
  'public.close_match_set_v2',
  'public.reopen_match_set_v2',
  'public.invite_to_set_v2',
  'public.request_set_join_v2',
]) {
  const sql = functionSql(setCommandMigration, functionName);
  expect(
    /pg_advisory_xact_lock/i.test(sql) && /for update/i.test(sql),
    `${functionName} must serialize the Set aggregate before transition checks.`,
  );
  expect(
    /set_row\.version\s*<>\s*p_expected_version/i.test(sql),
    `${functionName} must reject stale Set writes.`,
  );
}

const createSetSql = functionSql(
  setCommandMigration,
  'public.create_match_set_v2',
);
expect(
  /insert into public\.match_sets_v2/i.test(createSetSql) &&
    /insert into public\.match_set_members_v2/i.test(createSetSql) &&
    /'owner'/i.test(createSetSql),
  'Create Match Set must atomically create its canonical owner membership.',
);
expect(
  /'set\.created\.v2'/i.test(createSetSql),
  'Create Match Set must publish set.created.v2.',
);

const updateSetSql = functionSql(
  setCommandMigration,
  'public.update_match_set_v2',
);
expect(
  /p_capacity\s*<\s*active_count/i.test(updateSetSql),
  'Set capacity cannot be reduced below active membership.',
);
expect(
  /case when active_count >= p_capacity then 'full' else 'open' end/i.test(
    updateSetSql,
  ),
  'Set update must derive recruitment state from authoritative capacity.',
);

const closeSetSql = functionSql(
  setCommandMigration,
  'public.close_match_set_v2',
);
expect(
  /match_set_invites_v2[\s\S]*state = 'cancelled'/i.test(closeSetSql) &&
    /match_set_join_requests_v2[\s\S]*state = 'cancelled'/i.test(closeSetSql),
  'Closing a Set must deterministically cancel pending recruitment records.',
);
expect(
  /'set\.closed\.v2'/i.test(closeSetSql),
  'Closing a Set must publish set.closed.v2.',
);

const reopenSetSql = functionSql(
  setCommandMigration,
  'public.reopen_match_set_v2',
);
expect(
  /close_reason\s*<>\s*'owner_closed'/i.test(reopenSetSql) &&
    /expires_at is not null[\s\S]*expires_at <= now/i.test(reopenSetSql),
  'Only a non-expired owner-closed Set may reopen.',
);

const inviteSetSql = functionSql(
  setCommandMigration,
  'public.invite_to_set_v2',
);
expect(
  /private\.assert_session_invite_eligible_v2/i.test(inviteSetSql),
  'Set invitation supply must consume Senior 1 capability authority.',
);
expect(
  /active_count\s*>=\s*set_row\.capacity/i.test(inviteSetSql),
  'Set invitation supply must reject already-full aggregates under lock.',
);
expect(
  /'set\.invite_created\.v2'/i.test(inviteSetSql),
  'Set invitation supply must publish set.invite_created.v2.',
);

const joinRequestSql = functionSql(
  setCommandMigration,
  'public.request_set_join_v2',
);
expect(
  /private\.are_players_blocked_v2/i.test(joinRequestSql),
  'Join-request supply must consume canonical block authority.',
);
expect(
  /'set\.join_requested\.v2'/i.test(joinRequestSql),
  'Join-request supply must publish set.join_requested.v2.',
);

expect(
  /revoke execute on function public\.create_match_set_v2[\s\S]*from public, anon/i.test(
    setCommandMigration,
  ) &&
    /grant execute on function public\.create_match_set_v2[\s\S]*to authenticated, service_role/i.test(
      setCommandMigration,
    ),
  'Set command RPCs must be authenticated/service-role only.',
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
