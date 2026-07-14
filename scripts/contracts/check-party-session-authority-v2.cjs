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
const setMembershipMigrationPath = path.join(
  root,
  'supabase/migrations/202607141220_core_v2_match_set_membership.sql',
);
const sessionCommandMigrationPath = path.join(
  root,
  'supabase/migrations/202607141230_core_v2_play_session_commands.sql',
);
const transportAlignmentMigrationPath = path.join(
  root,
  'supabase/migrations/202607141300_core_v2_party_session_transport_alignment.sql',
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
const setMembershipMigration = read(setMembershipMigrationPath);
const sessionCommandMigration = read(sessionCommandMigrationPath);
const transportAlignmentMigration = read(transportAlignmentMigrationPath);
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

const setMembershipMutationFunctions = [
  'public.accept_set_invite_v2',
  'public.decline_set_invite_v2',
  'public.cancel_set_invite_v2',
  'public.accept_set_join_request_v2',
  'public.reject_set_join_request_v2',
  'public.cancel_set_join_request_v2',
  'public.leave_set_v2',
  'public.remove_set_member_v2',
  'public.transfer_set_ownership_v2',
  'public.create_session_from_set_v2',
];
for (const functionName of setMembershipMutationFunctions) {
  const sql = functionSql(setMembershipMigration, functionName);
  expect(sql.length > 0, `${functionName} RPC is missing.`);
  expect(
    /private\.begin_command_v1\s*\(/i.test(sql) &&
      /private\.finish_command_v1\s*\(/i.test(sql),
    `${functionName} must use durable command receipts.`,
  );
  expect(
    /private\.record_core_v2_command_audit\s*\(/i.test(sql),
    `${functionName} must persist audit metadata.`,
  );
  expect(
    /pg_advisory_xact_lock/i.test(sql) && /for update/i.test(sql),
    `${functionName} must serialize the Set aggregate.`,
  );
  expect(
    /set_row\.version\s*<>\s*p_expected_version/i.test(sql),
    `${functionName} must reject stale Set writes.`,
  );
  expect(
    /private\.enqueue_contract_event_v2\s*\(/i.test(sql),
    `${functionName} must emit at least one Set/Session outbox fact.`,
  );
}

for (const functionName of [
  'public.accept_set_invite_v2',
  'public.accept_set_join_request_v2',
]) {
  const sql = functionSql(setMembershipMigration, functionName);
  expect(
    /active_count\s*>=\s*set_row\.capacity/i.test(sql),
    `${functionName} must enforce final-slot capacity while locked.`,
  );
  expect(
    /private\.assert_match_set_pairwise_eligible_v2/i.test(sql),
    `${functionName} must re-check pairwise block/lifecycle authority.`,
  );
  expect(
    /private\.advance_match_set_after_join_v2/i.test(sql),
    `${functionName} must derive full/open state from post-join membership.`,
  );
  expect(
    /'set\.member_joined\.v2'/i.test(sql),
    `${functionName} must publish set.member_joined.v2.`,
  );
}

const pairwiseSetSql = functionSql(
  setMembershipMigration,
  'private.assert_match_set_pairwise_eligible_v2',
);
expect(
  /private\.are_players_blocked_v2/i.test(pairwiseSetSql) &&
    /assert_party_session_player_active_v2/i.test(pairwiseSetSql),
  'Set acceptance must consume canonical lifecycle and block authorities.',
);

const leaveSetSql = functionSql(setMembershipMigration, 'public.leave_set_v2');
expect(
  /owner_transfer_required/i.test(leaveSetSql) &&
    /owner_player_id\s*=\s*actor_player_id/i.test(leaveSetSql),
  'Set owner must transfer ownership or close before leaving.',
);
expect(
  /'set\.member_removed\.v2'/i.test(leaveSetSql),
  'Set leave must publish an authoritative membership removal fact.',
);

const removeSetSql = functionSql(
  setMembershipMigration,
  'public.remove_set_member_v2',
);
expect(
  /p_member_player_id\s*=\s*set_row\.owner_player_id/i.test(removeSetSql) &&
    /owner_transfer_required/i.test(removeSetSql),
  'Set owner cannot remove themselves through the member-removal command.',
);

const transferSetSql = functionSql(
  setMembershipMigration,
  'public.transfer_set_ownership_v2',
);
expect(
  /set role = 'member'/i.test(transferSetSql) &&
    /set role = 'owner'/i.test(transferSetSql) &&
    /owner_player_id = p_new_owner_player_id/i.test(transferSetSql),
  'Ownership transfer must update both member roles and aggregate owner atomically.',
);
expect(
  /'changeType',\s*'owner_transferred'/i.test(transferSetSql),
  'Ownership transfer must publish a typed administrative update event.',
);

const convertSetSql = functionSql(
  setMembershipMigration,
  'public.create_session_from_set_v2',
);
expect(
  /insert into public\.play_sessions_v2/i.test(convertSetSql) &&
    /insert into public\.play_session_members_v2[\s\S]*select/i.test(
      convertSetSql,
    ),
  'Set conversion must create a distinct Session aggregate and copy active membership.',
);
expect(
  /source_kind[\s\S]*'set'/i.test(convertSetSql) &&
    /source_set_id/i.test(convertSetSql),
  'Converted Session must retain its authoritative Set source.',
);
expect(
  /close_reason = 'converted_to_session'/i.test(convertSetSql) &&
    /'set\.closed\.v2'/i.test(convertSetSql) &&
    /'session\.created\.v2'/i.test(convertSetSql),
  'Set conversion must close recruitment and emit both aggregate facts atomically.',
);
expect(
  /insert into private\.play_session_conversation_projection_v2/i.test(
    convertSetSql,
  ) &&
    !/record_session_conversation_projection_v2|conversationProvision/i.test(
      convertSetSql,
    ),
  'Set conversion may enqueue conversation work but must not fake a distributed transaction.',
);
expect(
  /communicationProvisioningRequired',\s*true/i.test(convertSetSql) &&
    /play_session_membership_snapshot_v2/i.test(convertSetSql),
  'Converted Session must publish full membership for conversation provisioning.',
);

for (const functionName of [
  'public.get_match_set_v2',
  'public.list_recruiting_match_sets_v2',
]) {
  const sql = functionSql(setMembershipMigration, functionName);
  expect(sql.length > 0, `${functionName} read RPC is missing.`);
  expect(
    /assert_party_session_feature_v2\('read'\)/i.test(sql) &&
      /resolve_party_session_actor_v2\(true, false\)/i.test(sql),
    `${functionName} must use the read gate and active canonical identity.`,
  );
}
expect(
  /private\.are_players_blocked_v2/i.test(
    functionSql(setMembershipMigration, 'public.list_recruiting_match_sets_v2'),
  ),
  'Recruiting Set discovery must fail closed for canonical block authority.',
);

const extendedSessionMutationFunctions = [
  'public.create_play_session_v2',
  'public.leave_session_v2',
  'public.remove_session_member_v2',
  'public.assign_session_role_v2',
  'public.schedule_session_v2',
];
for (const functionName of extendedSessionMutationFunctions) {
  const sql = functionSql(sessionCommandMigration, functionName);
  expect(sql.length > 0, `${functionName} RPC is missing.`);
  expect(
    /private\.begin_command_v1\s*\(/i.test(sql) &&
      /private\.finish_command_v1\s*\(/i.test(sql),
    `${functionName} must use durable receipts.`,
  );
  expect(
    /private\.record_core_v2_command_audit\s*\(/i.test(sql),
    `${functionName} must persist audit metadata.`,
  );
  expect(
    /private\.enqueue_contract_event_v2\s*\(/i.test(sql),
    `${functionName} must emit a versioned Session event.`,
  );
}

for (const functionName of [
  'public.leave_session_v2',
  'public.remove_session_member_v2',
  'public.assign_session_role_v2',
  'public.schedule_session_v2',
]) {
  const sql = functionSql(sessionCommandMigration, functionName);
  expect(
    /pg_advisory_xact_lock/i.test(sql) && /for update/i.test(sql),
    `${functionName} must serialize the Session aggregate.`,
  );
  expect(
    /session_row\.version\s*<>\s*p_expected_version/i.test(sql),
    `${functionName} must reject stale Session writes.`,
  );
}

const communicationTriggerSql = functionSql(
  sessionCommandMigration,
  'private.mark_play_session_communication_pending_v2',
);
expect(
  /play_session_conversation_projection_v2/i.test(communicationTriggerSql) &&
    /state = 'pending'/i.test(communicationTriggerSql),
  'Session membership changes must invalidate the communication projection immediately.',
);
expect(
  /create trigger play_session_members_v2_mark_communication_pending[\s\S]*after insert or update of state, role/i.test(
    sessionCommandMigration,
  ),
  'Communication invalidation must be attached to authoritative membership writes.',
);

const manualSessionSql = functionSql(
  sessionCommandMigration,
  'public.create_play_session_v2',
);
expect(
  /source_kind[\s\S]*'manual'/i.test(manualSessionSql) &&
    /insert into public\.play_session_members_v2/i.test(manualSessionSql),
  'Manual Session creation must use the manual source and create owner membership.',
);
expect(
  /communicationProvisioningRequired',\s*false/i.test(manualSessionSql),
  'One-member manual Session must not provision a conversation prematurely.',
);

for (const functionName of [
  'public.leave_session_v2',
  'public.remove_session_member_v2',
]) {
  const sql = functionSql(sessionCommandMigration, functionName);
  expect(
    /membership_version = membership_version \+ 1/i.test(sql) &&
      /play_session_membership_snapshot_v2/i.test(sql),
    `${functionName} must advance membershipVersion and publish the full active snapshot.`,
  );
  expect(
    /cancel_open_ready_check_for_membership_v2/i.test(sql),
    `${functionName} must invalidate an open ready check.`,
  );
  expect(
    /'session\.member_left\.v2'/i.test(sql),
    `${functionName} must publish session.member_left.v2.`,
  );
}
expect(
  /owner_transfer_required/i.test(
    functionSql(sessionCommandMigration, 'public.leave_session_v2'),
  ),
  'Session owner cannot leave without terminating the aggregate.',
);
expect(
  /p_member_player_id\s*=\s*session_row\.owner_player_id/i.test(
    functionSql(sessionCommandMigration, 'public.remove_session_member_v2'),
  ),
  'Session owner cannot remove themselves.',
);

const roleSql = functionSql(
  sessionCommandMigration,
  'public.assign_session_role_v2',
);
expect(
  /play_session_role_assignments_v2/i.test(roleSql) &&
    /active = false/i.test(roleSql) &&
    /'session\.role_assigned\.v2'/i.test(roleSql),
  'Role assignment must revoke the prior assignment and emit the canonical fact.',
);
expect(
  !/membership_version = membership_version/i.test(roleSql),
  'Game-role assignment must not advance membershipVersion.',
);

const scheduleSql = functionSql(
  sessionCommandMigration,
  'public.schedule_session_v2',
);
expect(
  /cardinality\(active_player_ids\) < 2/i.test(scheduleSql) &&
    /'session\.scheduled\.v2'/i.test(scheduleSql),
  'Scheduling requires at least two active members and publishes the schedule fact.',
);
expect(
  !/membership_version = membership_version/i.test(scheduleSql),
  'Scheduling must not advance membershipVersion.',
);

const alignedCreateSessionSql = functionSql(
  transportAlignmentMigration,
  'public.create_play_session_v2',
);
expect(
  /p_initial_invitee_player_ids\s+uuid\[\]/i.test(alignedCreateSessionSql),
  'Manual Session create must accept the contract initialInviteePlayerIds field.',
);
expect(
  /drop function if exists public\.create_play_session_v2/i.test(
    transportAlignmentMigration,
  ),
  'Manual Session create must remove the obsolete PostgREST overload.',
);
expect(
  /cardinality\(normalized_invitee_player_ids\)\s*>\s*p_capacity\s*-\s*1/i.test(
    alignedCreateSessionSql,
  ) &&
    /actor_player_id\s*=\s*any\(normalized_invitee_player_ids\)/i.test(
      alignedCreateSessionSql,
    ),
  'Manual Session create must validate initial invite capacity and self-invites.',
);
expect(
  /foreach target_player_id in array normalized_invitee_player_ids/i.test(
    alignedCreateSessionSql,
  ) &&
    /private\.assert_session_invite_eligible_v2/i.test(alignedCreateSessionSql),
  'Manual Session create must re-check lifecycle/privacy for every initial invitee.',
);
expect(
  /session\.created\.v2/i.test(alignedCreateSessionSql) &&
    /session\.invite_created\.v2/i.test(alignedCreateSessionSql) &&
    /created_event_id/i.test(alignedCreateSessionSql),
  'Manual Session create must publish created plus causally linked invite events.',
);
expect(
  /grant execute on function public\.create_play_session_v2[\s\S]*to authenticated, service_role/i.test(
    transportAlignmentMigration,
  ),
  'Aligned manual Session create RPC must remain authenticated/service callable.',
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
