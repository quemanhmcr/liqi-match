-- Core V2 Play Session walking skeleton.
-- User mutations use durable receipts, expected versions, aggregate row locks,
-- Core V2 outbox events and canonical Player lifecycle/relationship authority.

create or replace function private.play_session_command_receipt_v2(
  p_command_name text,
  p_result_code text,
  p_session_id uuid,
  p_correlation_id uuid,
  p_event_ids uuid[],
  p_repeated boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'aggregateId', sessions.id,
    'aggregateType', 'play_session',
    'aggregateVersion', sessions.version,
    'commandName', p_command_name,
    'correlationId', p_correlation_id,
    'eventIds', to_jsonb(coalesce(p_event_ids, '{}'::uuid[])),
    'occurredAt', now(),
    'repeated', p_repeated,
    'resultCode', p_result_code,
    'session', private.play_session_snapshot_v2(sessions.id)
  )
  from public.play_sessions_v2 sessions
  where sessions.id = p_session_id;
$$;

create or replace function private.play_session_ready_check_snapshot_v2(
  p_ready_check_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'checkId', checks.id,
    'state', checks.state,
    'version', checks.version,
    'requiredPlayerIds', to_jsonb(checks.required_player_ids),
    'openedAt', checks.opened_at,
    'deadlineAt', checks.deadline_at,
    'responses', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'playerId', responses.player_id,
            'response', responses.response,
            'respondedAt', responses.responded_at
          ) order by responses.responded_at, responses.player_id
        )
        from public.play_session_ready_responses_v2 responses
        where responses.ready_check_id = checks.id
      ),
      '[]'::jsonb
    )
  )
  from public.play_session_ready_checks_v2 checks
  where checks.id = p_ready_check_id;
$$;

create or replace function private.play_session_active_player_ids_v2(
  p_session_id uuid
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(
      members.player_id
      order by
        case when members.role = 'owner' then 0 else 1 end,
        members.joined_at,
        members.player_id
    ),
    '{}'::uuid[]
  )
  from public.play_session_members_v2 members
  where members.session_id = p_session_id
    and members.state = 'active';
$$;

create or replace function public.create_session_from_match_v2(
  p_match_id uuid,
  p_title text,
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
  command_name constant text := 'create_session_from_match_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  target_player_id uuid;
  request_hash text;
  command_state record;
  match_row public.matches%rowtype;
  session_id_value uuid;
  invite_id_value uuid;
  created_event_id uuid;
  invite_event_id uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_match_id is null
    or p_expected_version <> 0
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
    or char_length(coalesce(p_timezone, '')) not between 1 and 64
    or (p_scheduled_for is not null and p_scheduled_for <= now()) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Create-from-Match Session input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'matchId', p_match_id,
      'title', btrim(p_title),
      'scheduledFor', p_scheduled_for,
      'timezone', p_timezone,
      'expectedVersion', p_expected_version,
      'correlationId', p_correlation_id,
      'audit', p_audit
    )
  );

  select state.repeated, state.response
  into command_state
  from private.begin_command_v1(
    command_name,
    actor_account_id,
    p_idempotency_key,
    request_hash
  ) state;

  if command_state.repeated then
    return command_state.response;
  end if;

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

  perform pg_advisory_xact_lock(
    hashtextextended('play-session-match:' || p_match_id::text, 0)
  );

  select matches.* into match_row
  from public.matches matches
  where matches.id = p_match_id
  for update;

  if match_row.id is null or match_row.unmatched_at is not null then
    perform private.raise_core_error_v1(
      'not_found',
      'The active Match was not found.'
    );
  end if;
  if match_row.player_low_id is null or match_row.player_high_id is null then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'The Match canonical Player projection is incomplete.',
      true
    );
  end if;
  if actor_player_id = match_row.player_low_id then
    target_player_id := match_row.player_high_id;
  elsif actor_player_id = match_row.player_high_id then
    target_player_id := match_row.player_low_id;
  else
    perform private.raise_core_error_v1(
      'forbidden',
      'Only a canonical Match participant can create its Session.'
    );
  end if;

  if exists (
    select 1
    from public.play_sessions_v2 sessions
    where sessions.source_match_id = p_match_id
  ) then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'The Match already has a Play Session.'
    );
  end if;

  perform private.assert_session_invite_eligible_v2(
    actor_player_id,
    target_player_id
  );

  insert into public.play_sessions_v2 (
    owner_player_id,
    source_kind,
    source_match_id,
    title,
    capacity,
    state,
    version,
    membership_version,
    timezone,
    scheduled_for
  ) values (
    actor_player_id,
    'match',
    p_match_id,
    btrim(p_title),
    2,
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

  insert into public.play_session_invites_v2 (
    session_id,
    inviter_player_id,
    target_player_id,
    state
  ) values (
    session_id_value,
    actor_player_id,
    target_player_id,
    'pending'
  ) returning id into invite_id_value;

  insert into private.play_session_conversation_projection_v2 (session_id)
  values (session_id_value);

  created_event_id := private.enqueue_contract_event_v2(
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
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':created'
  );

  invite_event_id := private.enqueue_contract_event_v2(
    'session.invite_created.v2',
    'play_session',
    session_id_value,
    1,
    actor_player_id,
    p_correlation_id,
    created_event_id,
    jsonb_build_object(
      'actorPlayerId', actor_player_id,
      'inviteId', invite_id_value,
      'sessionId', session_id_value,
      'targetPlayerId', target_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':invite'
  );

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'created',
    session_id_value,
    p_correlation_id,
    array[created_event_id, invite_event_id],
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

create or replace function public.invite_to_session_v2(
  p_session_id uuid,
  p_target_player_id uuid,
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
  command_name constant text := 'invite_to_session_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  invite_id_value uuid;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_session_id is null
    or p_target_player_id is null
    or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session invite input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'sessionId', p_session_id,
      'targetPlayerId', p_target_player_id,
      'expectedVersion', p_expected_version,
      'correlationId', p_correlation_id,
      'audit', p_audit
    )
  );
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
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
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
      'Only the active Session owner can invite a member.'
    );
  end if;
  if session_row.state <> 'recruiting' then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Session invitations are allowed only while recruiting.'
    );
  end if;
  if exists (
    select 1
    from public.play_session_members_v2 members
    where members.session_id = p_session_id
      and members.player_id = p_target_player_id
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The target already has Session membership history.'
    );
  end if;
  if exists (
    select 1
    from public.play_session_invites_v2 invites
    where invites.session_id = p_session_id
      and invites.target_player_id = p_target_player_id
      and invites.state = 'pending'
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'A pending Session invite already exists for this player.'
    );
  end if;

  perform private.assert_session_invite_eligible_v2(
    actor_player_id,
    p_target_player_id
  );

  insert into public.play_session_invites_v2 (
    session_id,
    inviter_player_id,
    target_player_id,
    state
  ) values (
    p_session_id,
    actor_player_id,
    p_target_player_id,
    'pending'
  ) returning id into invite_id_value;

  update public.play_sessions_v2
  set version = version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.invite_created.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'actorPlayerId', actor_player_id,
      'inviteId', invite_id_value,
      'sessionId', p_session_id,
      'targetPlayerId', p_target_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'invite_pending',
    p_session_id,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name, actor_account_id, p_idempotency_key, response_value
  );
  return response_value;
end;
$$;

create or replace function public.accept_session_invite_v2(
  p_session_id uuid,
  p_invite_id uuid,
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
  command_name constant text := 'accept_session_invite_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  invite_row public.play_session_invites_v2%rowtype;
  active_count integer;
  member_player_id uuid;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null or p_invite_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Accept Session invite input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'sessionId', p_session_id,
      'inviteId', p_invite_id,
      'expectedVersion', p_expected_version,
      'correlationId', p_correlation_id,
      'audit', p_audit
    )
  );
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name, actor_account_id, p_idempotency_key, request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
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
  if session_row.state <> 'recruiting' then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Session membership can change only while recruiting.'
    );
  end if;

  select invites.* into invite_row
  from public.play_session_invites_v2 invites
  where invites.id = p_invite_id
    and invites.session_id = p_session_id
  for update;

  if invite_row.id is null or invite_row.target_player_id <> actor_player_id then
    perform private.raise_core_error_v1('not_found', 'The Session invite was not found.');
  end if;
  if invite_row.state <> 'pending' then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'The Session invite is no longer pending.'
    );
  end if;
  if invite_row.expires_at is not null and invite_row.expires_at <= now() then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'The Session invite has expired.'
    );
  end if;

  select count(*) into active_count
  from public.play_session_members_v2 members
  where members.session_id = p_session_id
    and members.state = 'active';
  if active_count >= session_row.capacity then
    perform private.raise_core_error_v1(
      'capacity_exceeded',
      'Play Session capacity has been reached.'
    );
  end if;
  if exists (
    select 1 from public.play_session_members_v2 members
    where members.session_id = p_session_id
      and members.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The actor already has Session membership history.'
    );
  end if;

  perform private.assert_session_invite_eligible_v2(
    invite_row.inviter_player_id,
    actor_player_id
  );
  for member_player_id in
    select members.player_id
    from public.play_session_members_v2 members
    where members.session_id = p_session_id
      and members.state = 'active'
  loop
    if private.are_players_blocked_v2(member_player_id, actor_player_id) then
      perform private.raise_core_error_v1(
        'relationship_blocked',
        'A Session member has an authoritative block with the invitee.'
      );
    end if;
  end loop;

  insert into public.play_session_members_v2 (
    session_id,
    player_id,
    role,
    state
  ) values (
    p_session_id,
    actor_player_id,
    'member',
    'active'
  );

  update public.play_session_invites_v2
  set state = 'accepted',
      version = version + 1,
      responded_at = now()
  where id = p_invite_id;

  update public.play_sessions_v2
  set version = version + 1,
      membership_version = membership_version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.member_joined.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'communicationProvisioningRequired', true,
      'memberPlayerId', actor_player_id,
      'membership', private.play_session_membership_snapshot_v2(p_session_id),
      'sessionId', p_session_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'invite_accepted',
    p_session_id,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name, actor_account_id, p_idempotency_key, response_value
  );
  return response_value;
end;
$$;

create or replace function public.record_session_conversation_projection_v2(
  p_session_id uuid,
  p_conversation_id uuid,
  p_source_aggregate_version bigint,
  p_membership_version bigint,
  p_accepted_membership jsonb,
  p_state text,
  p_last_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.play_sessions_v2%rowtype;
  current_membership jsonb;
  existing_projection private.play_session_conversation_projection_v2%rowtype;
begin
  perform private.assert_party_session_feature_v2('reconcile');
  if p_session_id is null
    or p_source_aggregate_version <= 0
    or p_membership_version <= 0
    or p_state not in ('pending', 'ready', 'degraded')
    or jsonb_typeof(p_accepted_membership) is distinct from 'object'
    or not (
      p_accepted_membership ? 'sessionId'
      and p_accepted_membership ? 'membershipVersion'
      and p_accepted_membership ? 'members'
    )
    or jsonb_typeof(p_accepted_membership -> 'members') is distinct from 'array'
    or (p_accepted_membership ->> 'sessionId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_accepted_membership ->> 'membershipVersion') !~ '^[1-9][0-9]*$'
    or (p_state = 'ready' and p_conversation_id is null) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation projection receipt is invalid.'
    );
  end if;

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

  current_membership := private.play_session_membership_snapshot_v2(p_session_id);
  if p_membership_version <> session_row.membership_version
    or (p_accepted_membership ->> 'membershipVersion')::bigint
      <> session_row.membership_version
    or (p_accepted_membership ->> 'sessionId')::uuid <> p_session_id
    or p_accepted_membership is distinct from current_membership then
    perform private.raise_core_error_v1(
      'version_conflict',
      'Conversation receipt does not match current Session membership.',
      false,
      jsonb_build_object(
        'actualMembershipVersion', session_row.membership_version,
        'receiptMembershipVersion', p_membership_version
      )
    );
  end if;
  if p_source_aggregate_version > session_row.version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'Conversation receipt references a future Session version.'
    );
  end if;

  select projections.* into existing_projection
  from private.play_session_conversation_projection_v2 projections
  where projections.session_id = p_session_id
  for update;

  if existing_projection.conversation_id is not null
    and p_conversation_id is distinct from existing_projection.conversation_id then
    perform private.raise_core_error_v1(
      'version_conflict',
      'A Session cannot switch to a different conversation authority.'
    );
  end if;
  if existing_projection.membership_version > p_membership_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'A stale conversation membership receipt was rejected.'
    );
  end if;

  insert into private.play_session_conversation_projection_v2 (
    session_id,
    conversation_id,
    source_aggregate_version,
    membership_version,
    accepted_membership,
    state,
    last_error_code
  ) values (
    p_session_id,
    p_conversation_id,
    p_source_aggregate_version,
    p_membership_version,
    p_accepted_membership,
    p_state::private.play_session_conversation_sync_state_v2,
    nullif(p_last_error_code, '')
  )
  on conflict (session_id) do update
  set conversation_id = coalesce(
        private.play_session_conversation_projection_v2.conversation_id,
        excluded.conversation_id
      ),
      source_aggregate_version = greatest(
        private.play_session_conversation_projection_v2.source_aggregate_version,
        excluded.source_aggregate_version
      ),
      membership_version = excluded.membership_version,
      accepted_membership = excluded.accepted_membership,
      state = excluded.state,
      last_error_code = excluded.last_error_code;

  return private.play_session_snapshot_v2(p_session_id);
end;
$$;

create or replace function public.open_ready_check_v2(
  p_session_id uuid,
  p_deadline_at timestamptz,
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
  command_name constant text := 'open_ready_check_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  conversation_row private.play_session_conversation_projection_v2%rowtype;
  required_player_ids uuid[];
  ready_check_id_value uuid;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null
    or p_expected_version <= 0
    or p_deadline_at is null
    or p_deadline_at <= now() then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Ready-check input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'sessionId', p_session_id,
      'deadlineAt', p_deadline_at,
      'expectedVersion', p_expected_version,
      'correlationId', p_correlation_id,
      'audit', p_audit
    )
  );
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name, actor_account_id, p_idempotency_key, request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
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
      'Only the active Session owner can open a ready check.'
    );
  end if;
  if session_row.state not in ('recruiting', 'scheduled') then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Ready check can open only while recruiting or scheduled.'
    );
  end if;

  required_player_ids := private.play_session_active_player_ids_v2(p_session_id);
  if cardinality(required_player_ids) not between 2 and session_row.capacity then
    perform private.raise_core_error_v1(
      'ready_policy_not_satisfied',
      'At least two active members within capacity are required.'
    );
  end if;
  if exists (
    select 1 from public.play_session_ready_checks_v2 checks
    where checks.session_id = p_session_id and checks.state = 'open'
  ) then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'A ready check is already open.'
    );
  end if;

  select projections.* into conversation_row
  from private.play_session_conversation_projection_v2 projections
  where projections.session_id = p_session_id
  for update;
  if conversation_row.state is distinct from 'ready'
    or conversation_row.conversation_id is null
    or conversation_row.membership_version <> session_row.membership_version
    or conversation_row.accepted_membership is distinct from
      private.play_session_membership_snapshot_v2(p_session_id) then
    perform private.raise_core_error_v1(
      'conversation_pending',
      'The Session conversation is not synchronized with current membership.'
    );
  end if;

  insert into public.play_session_ready_checks_v2 (
    session_id,
    state,
    version,
    required_membership_version,
    required_player_ids,
    opened_by_player_id,
    deadline_at
  ) values (
    p_session_id,
    'open',
    1,
    session_row.membership_version,
    required_player_ids,
    actor_player_id,
    p_deadline_at
  ) returning id into ready_check_id_value;

  update public.play_sessions_v2
  set state = 'ready_check',
      version = version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.ready_check_opened.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'readyCheck', private.play_session_ready_check_snapshot_v2(ready_check_id_value),
      'sessionId', p_session_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'ready_check_opened',
    p_session_id,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name, actor_account_id, p_idempotency_key, response_value
  );
  return response_value;
end;
$$;

create or replace function public.respond_ready_check_v2(
  p_session_id uuid,
  p_ready_check_id uuid,
  p_response text,
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
  command_name constant text := 'respond_ready_check_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  ready_check_row public.play_session_ready_checks_v2%rowtype;
  all_ready boolean;
  response_event_id uuid;
  passed_event_id uuid;
  scheduled_event_id uuid;
  event_ids uuid[] := '{}'::uuid[];
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null
    or p_ready_check_id is null
    or p_response not in ('ready', 'not_ready')
    or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Ready response input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'sessionId', p_session_id,
      'checkId', p_ready_check_id,
      'response', p_response,
      'expectedVersion', p_expected_version,
      'correlationId', p_correlation_id,
      'audit', p_audit
    )
  );
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name, actor_account_id, p_idempotency_key, request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
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
  if session_row.state <> 'ready_check' then
    perform private.raise_core_error_v1(
      'ready_check_not_open',
      'The Session is not in ready-check state.'
    );
  end if;
  if not exists (
    select 1 from public.play_session_members_v2 members
    where members.session_id = p_session_id
      and members.player_id = actor_player_id
      and members.state = 'active'
  ) then
    perform private.raise_core_error_v1(
      'membership_required',
      'Active Session membership is required.'
    );
  end if;

  select checks.* into ready_check_row
  from public.play_session_ready_checks_v2 checks
  where checks.id = p_ready_check_id
    and checks.session_id = p_session_id
  for update;
  if ready_check_row.id is null or ready_check_row.state <> 'open' then
    perform private.raise_core_error_v1(
      'ready_check_not_open',
      'The requested ready check is not open.'
    );
  end if;
  if ready_check_row.deadline_at <= now() then
    perform private.raise_core_error_v1(
      'ready_check_expired',
      'The ready-check deadline has passed.'
    );
  end if;
  if not (actor_player_id = any(ready_check_row.required_player_ids)) then
    perform private.raise_core_error_v1(
      'membership_required',
      'The actor is not in the ready-check membership snapshot.'
    );
  end if;
  if ready_check_row.required_membership_version <> session_row.membership_version
    or ready_check_row.required_player_ids <>
      private.play_session_active_player_ids_v2(p_session_id) then
    perform private.raise_core_error_v1(
      'ready_policy_not_satisfied',
      'Session membership changed after the ready check opened.'
    );
  end if;

  insert into public.play_session_ready_responses_v2 (
    ready_check_id,
    player_id,
    response,
    version,
    responded_at
  ) values (
    p_ready_check_id,
    actor_player_id,
    p_response::public.play_session_ready_response_v2,
    1,
    now()
  )
  on conflict (ready_check_id, player_id) do update
  set response = excluded.response,
      version = public.play_session_ready_responses_v2.version + 1,
      responded_at = excluded.responded_at;

  update public.play_session_ready_checks_v2
  set version = version + 1
  where id = p_ready_check_id
  returning * into ready_check_row;

  select count(*) = cardinality(ready_check_row.required_player_ids)
  into all_ready
  from public.play_session_ready_responses_v2 responses
  where responses.ready_check_id = p_ready_check_id
    and responses.response = 'ready'
    and responses.player_id = any(ready_check_row.required_player_ids);

  if all_ready then
    update public.play_session_ready_checks_v2
    set state = 'passed',
        passed_at = now(),
        closed_at = now()
    where id = p_ready_check_id
    returning * into ready_check_row;

    update public.play_sessions_v2
    set state = 'scheduled',
        scheduled_for = coalesce(scheduled_for, now()),
        version = version + 1
    where id = p_session_id
    returning * into session_row;
  else
    update public.play_sessions_v2
    set version = version + 1
    where id = p_session_id
    returning * into session_row;
  end if;

  response_event_id := private.enqueue_contract_event_v2(
    case when p_response = 'ready'
      then 'session.member_ready.v2'
      else 'session.member_not_ready.v2'
    end,
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'checkId', p_ready_check_id,
      'memberPlayerId', actor_player_id,
      'response', p_response,
      'sessionId', p_session_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':response'
  );
  event_ids := array_append(event_ids, response_event_id);

  if all_ready then
    passed_event_id := private.enqueue_contract_event_v2(
      'session.ready_check_passed.v2',
      'play_session',
      p_session_id,
      session_row.version,
      actor_player_id,
      p_correlation_id,
      response_event_id,
      jsonb_build_object(
        'checkId', p_ready_check_id,
        'participantPlayerIds', to_jsonb(ready_check_row.required_player_ids),
        'passedAt', ready_check_row.passed_at,
        'sessionId', p_session_id
      ),
      command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':passed'
    );
    event_ids := array_append(event_ids, passed_event_id);

    scheduled_event_id := private.enqueue_contract_event_v2(
      'session.scheduled.v2',
      'play_session',
      p_session_id,
      session_row.version,
      actor_player_id,
      p_correlation_id,
      passed_event_id,
      jsonb_build_object(
        'scheduledFor', session_row.scheduled_for,
        'sessionId', p_session_id,
        'timezone', session_row.timezone
      ),
      command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':scheduled'
    );
    event_ids := array_append(event_ids, scheduled_event_id);
  end if;

  response_value := private.play_session_command_receipt_v2(
    command_name,
    case when all_ready then 'ready_check_passed' else 'ready_recorded' end,
    p_session_id,
    p_correlation_id,
    event_ids,
    false
  );
  perform private.finish_command_v1(
    command_name, actor_account_id, p_idempotency_key, response_value
  );
  return response_value;
end;
$$;

create or replace function public.start_session_v2(
  p_session_id uuid,
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
  command_name constant text := 'start_session_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  ready_check_row public.play_session_ready_checks_v2%rowtype;
  conversation_row private.play_session_conversation_projection_v2%rowtype;
  active_player_ids uuid[];
  member_player_id uuid;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Start Session input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'sessionId', p_session_id,
      'expectedVersion', p_expected_version,
      'correlationId', p_correlation_id,
      'audit', p_audit
    )
  );
  select state.repeated, state.response into command_state
  from private.begin_command_v1(
    command_name, actor_account_id, p_idempotency_key, request_hash
  ) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
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
      'Only the active Session owner can start the Session.'
    );
  end if;
  if session_row.state <> 'scheduled' then
    perform private.raise_core_error_v1(
      'ready_policy_not_satisfied',
      'A scheduled Session is required before start.'
    );
  end if;

  select checks.* into ready_check_row
  from public.play_session_ready_checks_v2 checks
  where checks.session_id = p_session_id
    and checks.state = 'passed'
  order by checks.passed_at desc, checks.id desc
  limit 1
  for update;
  active_player_ids := private.play_session_active_player_ids_v2(p_session_id);
  if ready_check_row.id is null
    or ready_check_row.required_membership_version <> session_row.membership_version
    or ready_check_row.required_player_ids <> active_player_ids then
    perform private.raise_core_error_v1(
      'ready_policy_not_satisfied',
      'A passed ready check for current membership is required.'
    );
  end if;

  select projections.* into conversation_row
  from private.play_session_conversation_projection_v2 projections
  where projections.session_id = p_session_id
  for update;
  if conversation_row.state is distinct from 'ready'
    or conversation_row.membership_version <> session_row.membership_version
    or conversation_row.accepted_membership is distinct from
      private.play_session_membership_snapshot_v2(p_session_id) then
    perform private.raise_core_error_v1(
      'conversation_pending',
      'Conversation membership must be synchronized before start.'
    );
  end if;

  foreach member_player_id in array active_player_ids loop
    perform private.assert_party_session_player_active_v2(member_player_id, false);
  end loop;

  update public.play_sessions_v2
  set state = 'in_progress',
      started_at = now(),
      version = version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.started.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'participantPlayerIds', to_jsonb(active_player_ids),
      'sessionId', p_session_id,
      'startedAt', session_row.started_at
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'started',
    p_session_id,
    p_correlation_id,
    array[event_id_value],
    false
  );
  perform private.finish_command_v1(
    command_name, actor_account_id, p_idempotency_key, response_value
  );
  return response_value;
end;
$$;

create or replace function public.propose_session_completion_v2(
  p_session_id uuid,
  p_claim text,
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
  command_name constant text := 'propose_session_completion_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  active_player_ids uuid[];
  claim_id_value uuid;
  claim_snapshot jsonb;
  completed_claim_count integer;
  participant_count integer;
  proposed_event_id uuid;
  terminal_event_id uuid;
  event_ids uuid[] := '{}'::uuid[];
  role_assignments jsonb;
  source_snapshot jsonb;
  result_code text;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_session_id is null
    or p_expected_version <= 0
    or p_claim not in ('completed', 'disputed', 'no_show')
    or (
      p_claim = 'completed'
      and nullif(btrim(coalesce(p_reason_code, '')), '') is not null
    )
    or (
      p_claim <> 'completed'
      and char_length(btrim(coalesce(p_reason_code, ''))) not between 1 and 64
    ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Completion claim input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'sessionId', p_session_id,
      'claim', p_claim,
      'reasonCode', nullif(btrim(coalesce(p_reason_code, '')), ''),
      'expectedVersion', p_expected_version,
      'correlationId', p_correlation_id,
      'audit', p_audit
    )
  );
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
  if session_row.state not in ('in_progress', 'completion_pending') then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Completion can be proposed only after the Session starts.'
    );
  end if;
  if session_row.started_at is null then
    perform private.raise_core_error_v1(
      'internal_error',
      'The started Session has no authoritative start time.'
    );
  end if;
  if not exists (
    select 1
    from public.play_session_members_v2 members
    where members.session_id = p_session_id
      and members.player_id = actor_player_id
      and members.state = 'active'
  ) then
    perform private.raise_core_error_v1(
      'membership_required',
      'Active Session membership is required.'
    );
  end if;
  if exists (
    select 1
    from public.play_session_completion_claims_v2 claims
    where claims.session_id = p_session_id
      and claims.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The participant already submitted a completion claim.'
    );
  end if;

  active_player_ids := private.play_session_active_player_ids_v2(p_session_id);
  if cardinality(active_player_ids) < 2 then
    perform private.raise_core_error_v1(
      'completion_policy_not_satisfied',
      'At least two active participants are required for completion.'
    );
  end if;

  insert into public.play_session_completion_claims_v2 (
    session_id,
    player_id,
    kind,
    reason_code
  ) values (
    p_session_id,
    actor_player_id,
    p_claim::public.play_session_completion_claim_kind_v2,
    case when p_claim = 'completed' then null else btrim(p_reason_code) end
  ) returning id into claim_id_value;

  claim_snapshot := jsonb_build_object(
    'claimId', claim_id_value,
    'playerId', actor_player_id,
    'kind', p_claim,
    'reasonCode', case when p_claim = 'completed' then null else btrim(p_reason_code) end,
    'claimedAt', now()
  );

  if p_claim <> 'completed' then
    update public.play_sessions_v2
    set state = 'disputed',
        version = version + 1
    where id = p_session_id
    returning * into session_row;
    result_code := 'disputed';
  else
    select count(*) into completed_claim_count
    from public.play_session_completion_claims_v2 claims
    where claims.session_id = p_session_id
      and claims.kind = 'completed'
      and claims.player_id = any(active_player_ids);
    participant_count := cardinality(active_player_ids);

    if completed_claim_count = participant_count then
      update public.play_sessions_v2
      set state = 'completed',
          completed_at = now(),
          version = version + 1
      where id = p_session_id
      returning * into session_row;
      result_code := 'completed';
    else
      update public.play_sessions_v2
      set state = 'completion_pending',
          version = version + 1
      where id = p_session_id
      returning * into session_row;
      result_code := 'completion_pending';
    end if;
  end if;

  proposed_event_id := private.enqueue_contract_event_v2(
    'session.completion_proposed.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'claim', claim_snapshot,
      'participantPlayerIds', to_jsonb(active_player_ids),
      'sessionId', p_session_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':proposed'
  );
  event_ids := array_append(event_ids, proposed_event_id);

  if result_code = 'disputed' then
    terminal_event_id := private.enqueue_contract_event_v2(
      'session.disputed.v2',
      'play_session',
      p_session_id,
      session_row.version,
      actor_player_id,
      p_correlation_id,
      proposed_event_id,
      jsonb_build_object(
        'claim', claim_snapshot,
        'disputeWindowClosesAt', now() + interval '24 hours',
        'sessionId', p_session_id
      ),
      command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':disputed'
    );
    event_ids := array_append(event_ids, terminal_event_id);
  elsif result_code = 'completed' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'assignmentId', assignments.id,
          'playerId', assignments.player_id,
          'roleSlug', assignments.role_slug,
          'assignedAt', assignments.assigned_at
        ) order by assignments.assigned_at, assignments.id
      ),
      '[]'::jsonb
    ) into role_assignments
    from public.play_session_role_assignments_v2 assignments
    where assignments.session_id = p_session_id
      and assignments.active;

    source_snapshot := case session_row.source_kind
      when 'match' then jsonb_build_object(
        'kind', 'match',
        'matchId', session_row.source_match_id
      )
      when 'set' then jsonb_build_object(
        'kind', 'set',
        'setId', session_row.source_set_id
      )
      else jsonb_build_object('kind', 'manual')
    end;

    terminal_event_id := private.enqueue_contract_event_v2(
      'session.completed.v2',
      'play_session',
      p_session_id,
      session_row.version,
      actor_player_id,
      p_correlation_id,
      proposed_event_id,
      jsonb_build_object(
        'completedAt', session_row.completed_at,
        'participantPlayerIds', to_jsonb(active_player_ids),
        'roleAssignments', role_assignments,
        'scheduledFor', session_row.scheduled_for,
        'sessionId', p_session_id,
        'source', source_snapshot,
        'startedAt', session_row.started_at,
        'verification', 'participant_quorum'
      ),
      command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':completed'
    );
    event_ids := array_append(event_ids, terminal_event_id);
  end if;

  response_value := private.play_session_command_receipt_v2(
    command_name,
    result_code,
    p_session_id,
    p_correlation_id,
    event_ids,
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

create or replace function public.cancel_session_v2(
  p_session_id uuid,
  p_reason text,
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
  command_name constant text := 'cancel_session_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_session_id is null
    or p_expected_version <= 0
    or p_reason not in (
      'owner_cancelled',
      'member_unavailable',
      'ready_check_failed',
      'schedule_conflict',
      'safety_block',
      'moderation',
      'other'
    ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Cancellation input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'sessionId', p_session_id,
      'reason', p_reason,
      'expectedVersion', p_expected_version,
      'correlationId', p_correlation_id,
      'audit', p_audit
    )
  );
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
      'Only the active Session owner can cancel the Session.'
    );
  end if;
  if session_row.state in (
    'completed', 'cancelled', 'expired', 'abandoned', 'disputed'
  ) then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'A terminal Session cannot be cancelled.'
    );
  end if;

  update public.play_session_ready_checks_v2
  set state = 'cancelled',
      version = version + 1,
      closed_at = now()
  where session_id = p_session_id
    and state = 'open';

  update public.play_sessions_v2
  set state = 'cancelled',
      cancellation_reason = p_reason::public.play_session_cancellation_reason_v2,
      cancelled_at = now(),
      version = version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.cancelled.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'cancelledAt', session_row.cancelled_at,
      'reasonCode', session_row.cancellation_reason,
      'sessionId', p_session_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'cancelled',
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

create or replace function public.get_play_session_v2(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
  session_snapshot jsonb;
begin
  perform private.assert_party_session_feature_v2('read');
  actor_mapping := private.resolve_party_session_actor_v2(true, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_session_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'PlaySessionId is required.'
    );
  end if;
  if not exists (
    select 1
    from public.play_session_members_v2 members
    where members.session_id = p_session_id
      and members.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1(
      'forbidden',
      'Session membership history is required.'
    );
  end if;

  session_snapshot := private.play_session_snapshot_v2(p_session_id);
  if session_snapshot is null then
    perform private.raise_core_error_v1('not_found', 'The Play Session was not found.');
  end if;
  return session_snapshot;
end;
$$;

create or replace function public.list_current_play_sessions_v2(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
begin
  perform private.assert_party_session_feature_v2('read');
  actor_mapping := private.resolve_party_session_actor_v2(true, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_limit is null or p_limit not between 1 and 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session list limit must be between 1 and 50.'
    );
  end if;

  return coalesce(
    (
      select jsonb_agg(items.session order by items.updated_at desc, items.session_id)
      from (
        select
          sessions.id as session_id,
          sessions.updated_at,
          private.play_session_snapshot_v2(sessions.id) as session
        from public.play_sessions_v2 sessions
        join public.play_session_members_v2 members
          on members.session_id = sessions.id
        where members.player_id = actor_player_id
          and members.state = 'active'
        order by sessions.updated_at desc, sessions.id
        limit p_limit
      ) items
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.list_my_session_invites_v2(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
begin
  perform private.assert_party_session_feature_v2('read');
  actor_mapping := private.resolve_party_session_actor_v2(true, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_limit is null or p_limit not between 1 and 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session invite list limit must be between 1 and 50.'
    );
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'inviteId', items.invite_id,
          'sessionId', items.session_id,
          'inviterPlayerId', items.inviter_player_id,
          'targetPlayerId', actor_player_id,
          'state', items.invite_state,
          'version', items.invite_version,
          'expiresAt', items.expires_at,
          'createdAt', items.created_at,
          'session', items.session
        ) order by items.created_at desc, items.invite_id
      )
      from (
        select
          invites.id as invite_id,
          invites.session_id,
          invites.inviter_player_id,
          invites.state as invite_state,
          invites.version as invite_version,
          invites.expires_at,
          invites.created_at,
          private.play_session_snapshot_v2(invites.session_id) as session
        from public.play_session_invites_v2 invites
        join public.play_sessions_v2 sessions on sessions.id = invites.session_id
        where invites.target_player_id = actor_player_id
          and invites.state = 'pending'
          and (invites.expires_at is null or invites.expires_at > now())
          and sessions.state = 'recruiting'
        order by invites.created_at desc, invites.id
        limit p_limit
      ) items
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.expire_play_session_ready_checks_v2(
  p_limit integer default 50,
  p_correlation_id uuid default extensions.gen_random_uuid()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ready_check_row public.play_session_ready_checks_v2%rowtype;
  session_row public.play_sessions_v2%rowtype;
  event_id_value uuid;
  expired_count integer := 0;
begin
  perform private.assert_party_session_feature_v2('reconcile');
  if p_limit is null or p_limit not between 1 and 200 or p_correlation_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Ready-check expiration input is invalid.'
    );
  end if;

  for ready_check_row in
    select checks.*
    from public.play_session_ready_checks_v2 checks
    where checks.state = 'open'
      and checks.deadline_at <= now()
    order by checks.deadline_at, checks.id
    limit p_limit
    for update skip locked
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('play-session:' || ready_check_row.session_id::text, 0)
    );

    select sessions.* into session_row
    from public.play_sessions_v2 sessions
    where sessions.id = ready_check_row.session_id
    for update;
    if session_row.id is null then
      continue;
    end if;

    update public.play_session_ready_checks_v2
    set state = 'expired',
        version = version + 1,
        closed_at = now()
    where id = ready_check_row.id
      and state = 'open';
    if not found then
      continue;
    end if;

    update public.play_sessions_v2
    set state = case when state = 'ready_check' then 'recruiting' else state end,
        version = version + 1
    where id = ready_check_row.session_id
    returning * into session_row;

    event_id_value := private.enqueue_contract_event_v2(
      'session.ready_check_expired.v2',
      'play_session',
      session_row.id,
      session_row.version,
      null,
      p_correlation_id,
      null,
      jsonb_build_object(
        'checkId', ready_check_row.id,
        'expiredAt', now(),
        'sessionId', session_row.id
      ),
      'expire_play_session_ready_checks_v2:' || ready_check_row.id::text || ':' ||
        (ready_check_row.version + 1)::text
    );
    if event_id_value is not null then
      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$$;

revoke execute on function private.play_session_command_receipt_v2(
  text, text, uuid, uuid, uuid[], boolean
) from public, anon, authenticated;
revoke execute on function private.play_session_ready_check_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.play_session_active_player_ids_v2(uuid)
  from public, anon, authenticated;

grant execute on function private.play_session_command_receipt_v2(
  text, text, uuid, uuid, uuid[], boolean
) to service_role;
grant execute on function private.play_session_ready_check_snapshot_v2(uuid)
  to service_role;
grant execute on function private.play_session_active_player_ids_v2(uuid)
  to service_role;

revoke execute on function public.create_session_from_match_v2(
  uuid, text, timestamptz, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.invite_to_session_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.accept_session_invite_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.open_ready_check_v2(
  uuid, timestamptz, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.respond_ready_check_v2(
  uuid, uuid, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.start_session_v2(
  uuid, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.propose_session_completion_v2(
  uuid, text, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.cancel_session_v2(
  uuid, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.get_play_session_v2(uuid)
  from public, anon;
revoke execute on function public.list_current_play_sessions_v2(integer)
  from public, anon;
revoke execute on function public.list_my_session_invites_v2(integer)
  from public, anon;

revoke execute on function public.record_session_conversation_projection_v2(
  uuid, uuid, bigint, bigint, jsonb, text, text
) from public, anon, authenticated;
revoke execute on function public.expire_play_session_ready_checks_v2(integer, uuid)
  from public, anon, authenticated;

grant execute on function public.create_session_from_match_v2(
  uuid, text, timestamptz, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.invite_to_session_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.accept_session_invite_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.open_ready_check_v2(
  uuid, timestamptz, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.respond_ready_check_v2(
  uuid, uuid, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.start_session_v2(
  uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.propose_session_completion_v2(
  uuid, text, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.cancel_session_v2(
  uuid, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.get_play_session_v2(uuid)
  to authenticated, service_role;
grant execute on function public.list_current_play_sessions_v2(integer)
  to authenticated, service_role;
grant execute on function public.list_my_session_invites_v2(integer)
  to authenticated, service_role;

grant execute on function public.record_session_conversation_projection_v2(
  uuid, uuid, bigint, bigint, jsonb, text, text
) to service_role;
grant execute on function public.expire_play_session_ready_checks_v2(integer, uuid)
  to service_role;
