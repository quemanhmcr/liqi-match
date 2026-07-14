-- Complete the Core V2 Play Session command surface beyond the two-player
-- walking skeleton: manual creation, membership exit/removal, game-role
-- assignment and explicit scheduling.

create or replace function private.mark_play_session_communication_pending_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.play_session_conversation_projection_v2
  set state = 'pending',
      last_error_code = null
  where session_id = coalesce(new.session_id, old.session_id);
  return new;
end;
$$;

create trigger play_session_members_v2_mark_communication_pending
  after insert or update of state, role on public.play_session_members_v2
  for each row execute function private.mark_play_session_communication_pending_v2();

create or replace function private.cancel_open_ready_check_for_membership_v2(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.play_session_ready_checks_v2
  set state = 'cancelled',
      version = version + 1,
      closed_at = now()
  where session_id = p_session_id
    and state = 'open';
end;
$$;

create or replace function public.create_play_session_v2(
  p_title text,
  p_capacity integer,
  p_scheduled_for timestamptz,
  p_timezone text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'create_play_session_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_id_value uuid;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_expected_version <> 0
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
    or p_capacity not between 2 and 5
    or char_length(coalesce(p_timezone, '')) not between 1 and 64
    or (p_scheduled_for is not null and p_scheduled_for <= now()) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Create Play Session input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'title', btrim(p_title),
    'capacity', p_capacity,
    'scheduledFor', p_scheduled_for,
    'timezone', p_timezone,
    'expectedVersion', p_expected_version,
    'correlationId', p_correlation_id,
    'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('create');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name,
    actor_account_id,
    p_idempotency_key,
    actor_player_id,
    p_correlation_id,
    p_expected_version,
    p_audit
  );

  insert into public.play_sessions_v2 (
    owner_player_id,
    source_kind,
    title,
    capacity,
    state,
    version,
    membership_version,
    timezone,
    scheduled_for
  ) values (
    actor_player_id,
    'manual',
    btrim(p_title),
    p_capacity,
    'recruiting',
    1,
    1,
    p_timezone,
    p_scheduled_for
  ) returning id into session_id_value;

  insert into public.play_session_members_v2 (
    session_id,
    player_id,
    role,
    state
  ) values (
    session_id_value,
    actor_player_id,
    'owner',
    'active'
  );
  insert into private.play_session_conversation_projection_v2 (session_id)
  values (session_id_value);

  event_id_value := private.enqueue_contract_event_v2(
    'session.created.v2',
    'play_session',
    session_id_value,
    1,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'communicationProvisioningRequired', false,
      'membership', private.play_session_membership_snapshot_v2(session_id_value),
      'session', private.play_session_snapshot_v2(session_id_value)
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'created',
    session_id_value,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    response_value
  );
  return response_value;
end;
$$;

create or replace function public.leave_session_v2(
  p_session_id uuid,
  p_reason_code text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'leave_session_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  member_row public.play_session_members_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null
    or p_expected_version <= 0
    or char_length(btrim(coalesce(p_reason_code, ''))) not between 1 and 64 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Leave Session input is invalid.'
    );
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'sessionId', p_session_id,
    'reasonCode', btrim(p_reason_code),
    'expectedVersion', p_expected_version,
    'correlationId', p_correlation_id,
    'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name,
    actor_account_id,
    p_idempotency_key,
    actor_player_id,
    p_correlation_id,
    p_expected_version,
    p_audit
  );

  perform pg_advisory_xact_lock(
    hashtextextended('play-session:' || p_session_id::text, 0)
  );
  select sessions.* into session_row
  from public.play_sessions_v2 sessions
  where sessions.id = p_session_id
  for update;
  if session_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Play Session was not found.');
  end if;
  if session_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Play Session version changed.',
      false,
      jsonb_build_object(
        'actualVersion', session_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if session_row.state not in ('draft', 'recruiting', 'scheduled', 'ready_check') then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Session membership cannot change after play starts.'
    );
  end if;
  if session_row.owner_player_id = actor_player_id then
    perform private.raise_core_error_v1(
      'owner_transfer_required',
      'The Session owner must cancel instead of leaving.'
    );
  end if;
  select members.* into member_row
  from public.play_session_members_v2 members
  where members.session_id = p_session_id
    and members.player_id = actor_player_id
  for update;
  if member_row.player_id is null or member_row.state <> 'active' then
    perform private.raise_core_error_v1(
      'membership_required',
      'Active Session membership is required.'
    );
  end if;

  perform private.cancel_open_ready_check_for_membership_v2(p_session_id);
  update public.play_session_members_v2
  set state = 'left',
      left_at = now(),
      reason_code = btrim(p_reason_code)
  where session_id = p_session_id
    and player_id = actor_player_id;
  update public.play_sessions_v2
  set state = 'recruiting',
      version = version + 1,
      membership_version = membership_version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.member_left.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'memberPlayerId', actor_player_id,
      'membership', private.play_session_membership_snapshot_v2(p_session_id),
      'reasonCode', btrim(p_reason_code),
      'sessionId', p_session_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.play_session_command_receipt_v2(
    command_name,
    'member_left',
    p_session_id,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    response_value
  );
  return response_value;
end;
$$;

create or replace function public.remove_session_member_v2(
  p_session_id uuid,
  p_member_player_id uuid,
  p_reason_code text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'remove_session_member_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  member_row public.play_session_members_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null
    or p_member_player_id is null
    or p_expected_version <= 0
    or char_length(btrim(coalesce(p_reason_code, ''))) not between 1 and 64 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Remove Session member input is invalid.'
    );
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'sessionId', p_session_id,
    'memberPlayerId', p_member_player_id,
    'reasonCode', btrim(p_reason_code),
    'expectedVersion', p_expected_version,
    'correlationId', p_correlation_id,
    'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name,
    actor_account_id,
    p_idempotency_key,
    actor_player_id,
    p_correlation_id,
    p_expected_version,
    p_audit
  );
  perform pg_advisory_xact_lock(
    hashtextextended('play-session:' || p_session_id::text, 0)
  );
  select sessions.* into session_row
  from public.play_sessions_v2 sessions
  where sessions.id = p_session_id
  for update;
  if session_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Play Session was not found.');
  end if;
  if session_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Play Session version changed.',
      false,
      jsonb_build_object(
        'actualVersion', session_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if session_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'forbidden',
      'Only the active Session owner can remove a member.'
    );
  end if;
  if session_row.state not in ('draft', 'recruiting', 'scheduled', 'ready_check') then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Session membership cannot change after play starts.'
    );
  end if;
  if p_member_player_id = session_row.owner_player_id then
    perform private.raise_core_error_v1(
      'owner_transfer_required',
      'The Session owner cannot remove themselves.'
    );
  end if;
  select members.* into member_row
  from public.play_session_members_v2 members
  where members.session_id = p_session_id
    and members.player_id = p_member_player_id
  for update;
  if member_row.player_id is null or member_row.state <> 'active' then
    perform private.raise_core_error_v1(
      'membership_required',
      'The target is not an active Session member.'
    );
  end if;

  perform private.cancel_open_ready_check_for_membership_v2(p_session_id);
  update public.play_session_members_v2
  set state = 'removed',
      left_at = now(),
      reason_code = btrim(p_reason_code)
  where session_id = p_session_id
    and player_id = p_member_player_id;
  update public.play_sessions_v2
  set state = 'recruiting',
      version = version + 1,
      membership_version = membership_version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.member_left.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'memberPlayerId', p_member_player_id,
      'membership', private.play_session_membership_snapshot_v2(p_session_id),
      'reasonCode', btrim(p_reason_code),
      'sessionId', p_session_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.play_session_command_receipt_v2(
    command_name,
    'member_removed',
    p_session_id,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    response_value
  );
  return response_value;
end;
$$;

create or replace function public.assign_session_role_v2(
  p_session_id uuid,
  p_member_player_id uuid,
  p_role_slug text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'assign_session_role_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  assignment_id_value uuid;
  assigned_at_value timestamptz;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null
    or p_member_player_id is null
    or p_expected_version <= 0
    or coalesce(p_role_slug, '') !~ '^[a-z0-9_]{1,32}$' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Assign Session role input is invalid.'
    );
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'sessionId', p_session_id,
    'memberPlayerId', p_member_player_id,
    'roleSlug', p_role_slug,
    'expectedVersion', p_expected_version,
    'correlationId', p_correlation_id,
    'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name,
    actor_account_id,
    p_idempotency_key,
    actor_player_id,
    p_correlation_id,
    p_expected_version,
    p_audit
  );
  perform pg_advisory_xact_lock(
    hashtextextended('play-session:' || p_session_id::text, 0)
  );
  select sessions.* into session_row
  from public.play_sessions_v2 sessions
  where sessions.id = p_session_id
  for update;
  if session_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Play Session was not found.');
  end if;
  if session_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Play Session version changed.',
      false,
      jsonb_build_object(
        'actualVersion', session_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if session_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'forbidden',
      'Only the active Session owner can assign game roles.'
    );
  end if;
  if session_row.state in ('completed', 'cancelled', 'expired', 'abandoned', 'disputed') then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'A terminal Session cannot change role assignments.'
    );
  end if;
  if not exists (
    select 1
    from public.play_session_members_v2 members
    where members.session_id = p_session_id
      and members.player_id = p_member_player_id
      and members.state = 'active'
  ) then
    perform private.raise_core_error_v1(
      'membership_required',
      'The role target must be an active Session member.'
    );
  end if;

  update public.play_session_role_assignments_v2
  set active = false,
      revoked_at = now(),
      version = version + 1
  where session_id = p_session_id
    and player_id = p_member_player_id
    and active;
  insert into public.play_session_role_assignments_v2 (
    session_id,
    player_id,
    role_slug,
    assigned_by_player_id,
    active,
    version
  ) values (
    p_session_id,
    p_member_player_id,
    p_role_slug,
    actor_player_id,
    true,
    1
  ) returning id, assigned_at
  into assignment_id_value, assigned_at_value;

  update public.play_sessions_v2
  set version = version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.role_assigned.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'assignment', jsonb_build_object(
        'assignmentId', assignment_id_value,
        'assignedAt', assigned_at_value,
        'playerId', p_member_player_id,
        'roleSlug', p_role_slug
      ),
      'sessionId', p_session_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.play_session_command_receipt_v2(
    command_name,
    'role_assigned',
    p_session_id,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    response_value
  );
  return response_value;
end;
$$;

create or replace function public.schedule_session_v2(
  p_session_id uuid,
  p_scheduled_for timestamptz,
  p_timezone text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'schedule_session_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  active_player_ids uuid[];
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null
    or p_scheduled_for is null
    or p_scheduled_for <= now()
    or char_length(coalesce(p_timezone, '')) not between 1 and 64
    or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Schedule Session input is invalid.'
    );
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'sessionId', p_session_id,
    'scheduledFor', p_scheduled_for,
    'timezone', p_timezone,
    'expectedVersion', p_expected_version,
    'correlationId', p_correlation_id,
    'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name,
    actor_account_id,
    p_idempotency_key,
    actor_player_id,
    p_correlation_id,
    p_expected_version,
    p_audit
  );
  perform pg_advisory_xact_lock(
    hashtextextended('play-session:' || p_session_id::text, 0)
  );
  select sessions.* into session_row
  from public.play_sessions_v2 sessions
  where sessions.id = p_session_id
  for update;
  if session_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Play Session was not found.');
  end if;
  if session_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Play Session version changed.',
      false,
      jsonb_build_object(
        'actualVersion', session_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if session_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'forbidden',
      'Only the active Session owner can schedule it.'
    );
  end if;
  if session_row.state not in ('recruiting', 'scheduled') then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Only a recruiting or scheduled Session can be scheduled.'
    );
  end if;
  active_player_ids := private.play_session_active_player_ids_v2(p_session_id);
  if cardinality(active_player_ids) < 2 then
    perform private.raise_core_error_v1(
      'ready_policy_not_satisfied',
      'At least two active members are required before scheduling.'
    );
  end if;
  if exists (
    select 1
    from public.play_session_ready_checks_v2 checks
    where checks.session_id = p_session_id
      and checks.state = 'open'
  ) then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'An open ready check must resolve before rescheduling.'
    );
  end if;

  update public.play_sessions_v2
  set state = 'scheduled',
      scheduled_for = p_scheduled_for,
      timezone = p_timezone,
      version = version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.scheduled.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'scheduledFor', session_row.scheduled_for,
      'sessionId', p_session_id,
      'timezone', session_row.timezone
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.play_session_command_receipt_v2(
    command_name,
    'scheduled',
    p_session_id,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    response_value
  );
  return response_value;
end;
$$;

revoke execute on function private.mark_play_session_communication_pending_v2()
  from public, anon, authenticated;
revoke execute on function private.cancel_open_ready_check_for_membership_v2(uuid)
  from public, anon, authenticated;
grant execute on function private.mark_play_session_communication_pending_v2()
  to service_role;
grant execute on function private.cancel_open_ready_check_for_membership_v2(uuid)
  to service_role;

revoke execute on function public.create_play_session_v2(
  text, integer, timestamptz, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.leave_session_v2(
  uuid, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.remove_session_member_v2(
  uuid, uuid, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.assign_session_role_v2(
  uuid, uuid, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.schedule_session_v2(
  uuid, timestamptz, text, text, uuid, bigint, jsonb
) from public, anon;

grant execute on function public.create_play_session_v2(
  text, integer, timestamptz, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.leave_session_v2(
  uuid, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.remove_session_member_v2(
  uuid, uuid, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.assign_session_role_v2(
  uuid, uuid, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.schedule_session_v2(
  uuid, timestamptz, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
