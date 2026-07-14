-- Core V2 Match Set command authority: create/update/close/reopen plus
-- invitation and join-request supply. Membership acceptance is isolated in the
-- next migration so its capacity race can be reviewed independently.

create or replace function private.match_set_command_receipt_v2(
  p_command_name text,
  p_result_code text,
  p_set_id uuid,
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
    'aggregateId', sets.id,
    'aggregateType', 'match_set',
    'aggregateVersion', sets.version,
    'commandName', p_command_name,
    'correlationId', p_correlation_id,
    'eventIds', to_jsonb(coalesce(p_event_ids, '{}'::uuid[])),
    'occurredAt', now(),
    'repeated', p_repeated,
    'resultCode', p_result_code,
    'set', private.match_set_snapshot_v2(sets.id)
  )
  from public.match_sets_v2 sets
  where sets.id = p_set_id;
$$;

create or replace function private.match_set_active_player_ids_v2(p_set_id uuid)
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
  from public.match_set_members_v2 members
  where members.set_id = p_set_id
    and members.state = 'active';
$$;

create or replace function public.create_match_set_v2(
  p_title text,
  p_intent_kind text,
  p_capacity integer,
  p_expires_at timestamptz,
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
  command_name constant text := 'create_match_set_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_id_value uuid;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_expected_version <> 0
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
    or coalesce(p_intent_kind, '') !~ '^[a-z][a-z0-9_]{0,31}$'
    or p_capacity not between 2 and 5
    or (p_expires_at is not null and p_expires_at <= now()) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Create Match Set input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'title', btrim(p_title),
      'intentKind', p_intent_kind,
      'capacity', p_capacity,
      'expiresAt', p_expires_at,
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

  insert into public.match_sets_v2 (
    owner_player_id,
    title,
    intent_kind,
    capacity,
    state,
    version,
    expires_at
  ) values (
    actor_player_id,
    btrim(p_title),
    p_intent_kind,
    p_capacity,
    'open',
    1,
    p_expires_at
  ) returning id into set_id_value;

  insert into public.match_set_members_v2 (
    set_id,
    player_id,
    role,
    state
  ) values (
    set_id_value,
    actor_player_id,
    'owner',
    'active'
  );

  event_id_value := private.enqueue_contract_event_v2(
    'set.created.v2',
    'match_set',
    set_id_value,
    1,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object('set', private.match_set_snapshot_v2(set_id_value)),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.match_set_command_receipt_v2(
    command_name,
    'created',
    set_id_value,
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

create or replace function public.update_match_set_v2(
  p_set_id uuid,
  p_title text,
  p_intent_kind text,
  p_capacity integer,
  p_expires_at timestamptz,
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
  command_name constant text := 'update_match_set_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  active_count integer;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null
    or p_expected_version <= 0
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
    or coalesce(p_intent_kind, '') !~ '^[a-z][a-z0-9_]{0,31}$'
    or p_capacity not between 2 and 5
    or (p_expires_at is not null and p_expires_at <= now()) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Update Match Set input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'setId', p_set_id,
      'title', btrim(p_title),
      'intentKind', p_intent_kind,
      'capacity', p_capacity,
      'expiresAt', p_expires_at,
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

  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row
  from public.match_sets_v2 sets
  where sets.id = p_set_id
  for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Match Set was not found.');
  end if;
  if set_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Match Set version changed.',
      false,
      jsonb_build_object(
        'actualVersion', set_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if set_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'forbidden',
      'Only the active Match Set owner can update it.'
    );
  end if;
  if set_row.state not in ('open', 'full') then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Only a recruiting Match Set can be updated.'
    );
  end if;

  select count(*) into active_count
  from public.match_set_members_v2 members
  where members.set_id = p_set_id
    and members.state = 'active';
  if p_capacity < active_count then
    perform private.raise_core_error_v1(
      'capacity_exceeded',
      'Capacity cannot be lower than active membership.'
    );
  end if;

  update public.match_sets_v2
  set title = btrim(p_title),
      intent_kind = p_intent_kind,
      capacity = p_capacity,
      expires_at = p_expires_at,
      state = case when active_count >= p_capacity then 'full' else 'open' end,
      version = version + 1
  where id = p_set_id
  returning * into set_row;

  event_id_value := private.enqueue_contract_event_v2(
    'set.updated.v2',
    'match_set',
    p_set_id,
    set_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'changeType', 'details_updated',
      'recordId', null,
      'set', private.match_set_snapshot_v2(p_set_id),
      'subjectPlayerId', null
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.match_set_command_receipt_v2(
    command_name,
    'updated',
    p_set_id,
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

create or replace function public.close_match_set_v2(
  p_set_id uuid,
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
  command_name constant text := 'close_match_set_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null
    or p_expected_version <= 0
    or p_reason not in ('owner_closed', 'moderation') then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Close Match Set input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'setId', p_set_id,
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

  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row
  from public.match_sets_v2 sets
  where sets.id = p_set_id
  for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Match Set was not found.');
  end if;
  if set_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Match Set version changed.',
      false,
      jsonb_build_object(
        'actualVersion', set_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if set_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'forbidden',
      'Only the active Match Set owner can close it.'
    );
  end if;
  if set_row.state not in ('open', 'full') then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Only a recruiting Match Set can be closed.'
    );
  end if;

  update public.match_sets_v2
  set state = 'closed',
      close_reason = p_reason::public.match_set_close_reason_v2,
      closed_at = now(),
      version = version + 1
  where id = p_set_id
  returning * into set_row;

  update public.match_set_invites_v2
  set state = 'cancelled',
      version = version + 1,
      responded_at = now()
  where set_id = p_set_id
    and state = 'pending';
  update public.match_set_join_requests_v2
  set state = 'cancelled',
      version = version + 1,
      responded_at = now()
  where set_id = p_set_id
    and state = 'pending';

  event_id_value := private.enqueue_contract_event_v2(
    'set.closed.v2',
    'match_set',
    p_set_id,
    set_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'closedAt', set_row.closed_at,
      'reasonCode', set_row.close_reason,
      'setId', p_set_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.match_set_command_receipt_v2(
    command_name,
    'closed',
    p_set_id,
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

create or replace function public.reopen_match_set_v2(
  p_set_id uuid,
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
  command_name constant text := 'reopen_match_set_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  active_count integer;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Reopen Match Set input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'setId', p_set_id,
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

  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row
  from public.match_sets_v2 sets
  where sets.id = p_set_id
  for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Match Set was not found.');
  end if;
  if set_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Match Set version changed.',
      false,
      jsonb_build_object(
        'actualVersion', set_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if set_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'forbidden',
      'Only the active Match Set owner can reopen it.'
    );
  end if;
  if set_row.state <> 'closed' or set_row.close_reason <> 'owner_closed' then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Only an owner-closed Match Set can be reopened.'
    );
  end if;
  if set_row.expires_at is not null and set_row.expires_at <= now() then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'An expired Match Set cannot be reopened.'
    );
  end if;

  select count(*) into active_count
  from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.state = 'active';
  update public.match_sets_v2
  set state = case when active_count >= capacity then 'full' else 'open' end,
      close_reason = null,
      closed_at = null,
      version = version + 1
  where id = p_set_id
  returning * into set_row;

  event_id_value := private.enqueue_contract_event_v2(
    'set.updated.v2',
    'match_set',
    p_set_id,
    set_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'changeType', 'reopened',
      'recordId', null,
      'set', private.match_set_snapshot_v2(p_set_id),
      'subjectPlayerId', null
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.match_set_command_receipt_v2(
    command_name,
    'reopened',
    p_set_id,
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

create or replace function public.invite_to_set_v2(
  p_set_id uuid,
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
  command_name constant text := 'invite_to_set_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  active_count integer;
  invite_id_value uuid;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_target_player_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Match Set invite input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'setId', p_set_id,
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
    command_name,
    actor_account_id,
    p_idempotency_key,
    actor_player_id,
    p_correlation_id,
    p_expected_version,
    p_audit
  );

  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row
  from public.match_sets_v2 sets
  where sets.id = p_set_id
  for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Match Set was not found.');
  end if;
  if set_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Match Set version changed.',
      false,
      jsonb_build_object(
        'actualVersion', set_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if set_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'forbidden',
      'Only the active Match Set owner can invite members.'
    );
  end if;
  if set_row.state <> 'open' then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Invitations require an open Match Set.'
    );
  end if;
  select count(*) into active_count
  from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.state = 'active';
  if active_count >= set_row.capacity then
    perform private.raise_core_error_v1(
      'capacity_exceeded',
      'Match Set capacity has been reached.'
    );
  end if;
  if exists (
    select 1 from public.match_set_members_v2 members
    where members.set_id = p_set_id and members.player_id = p_target_player_id
  ) or exists (
    select 1 from public.match_set_invites_v2 invites
    where invites.set_id = p_set_id
      and invites.target_player_id = p_target_player_id
      and invites.state = 'pending'
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The target already has membership history or a pending invite.'
    );
  end if;

  perform private.assert_session_invite_eligible_v2(
    actor_player_id,
    p_target_player_id
  );

  insert into public.match_set_invites_v2 (
    set_id,
    inviter_player_id,
    target_player_id,
    state
  ) values (
    p_set_id,
    actor_player_id,
    p_target_player_id,
    'pending'
  ) returning id into invite_id_value;

  update public.match_sets_v2
  set version = version + 1
  where id = p_set_id
  returning * into set_row;

  event_id_value := private.enqueue_contract_event_v2(
    'set.invite_created.v2',
    'match_set',
    p_set_id,
    set_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'inviteId', invite_id_value,
      'inviterPlayerId', actor_player_id,
      'setId', p_set_id,
      'targetPlayerId', p_target_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.match_set_command_receipt_v2(
    command_name,
    'invite_pending',
    p_set_id,
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

create or replace function public.request_set_join_v2(
  p_set_id uuid,
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
  command_name constant text := 'request_set_join_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  active_count integer;
  request_id_value uuid;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Join-request input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object(
      'setId', p_set_id,
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

  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row
  from public.match_sets_v2 sets
  where sets.id = p_set_id
  for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'The Match Set was not found.');
  end if;
  if set_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'version_conflict',
      'The Match Set version changed.',
      false,
      jsonb_build_object(
        'actualVersion', set_row.version,
        'expectedVersion', p_expected_version
      )
    );
  end if;
  if set_row.state <> 'open' then
    perform private.raise_core_error_v1(
      'invalid_transition',
      'Join requests require an open Match Set.'
    );
  end if;
  select count(*) into active_count
  from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.state = 'active';
  if active_count >= set_row.capacity then
    perform private.raise_core_error_v1(
      'capacity_exceeded',
      'Match Set capacity has been reached.'
    );
  end if;
  if exists (
    select 1 from public.match_set_members_v2 members
    where members.set_id = p_set_id and members.player_id = actor_player_id
  ) or exists (
    select 1 from public.match_set_join_requests_v2 requests
    where requests.set_id = p_set_id
      and requests.requester_player_id = actor_player_id
      and requests.state = 'pending'
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The actor already has membership history or a pending request.'
    );
  end if;
  if private.are_players_blocked_v2(actor_player_id, set_row.owner_player_id) then
    perform private.raise_core_error_v1(
      'relationship_blocked',
      'Relationship authority denied this join request.'
    );
  end if;

  insert into public.match_set_join_requests_v2 (
    set_id,
    requester_player_id,
    state
  ) values (
    p_set_id,
    actor_player_id,
    'pending'
  ) returning id into request_id_value;

  update public.match_sets_v2
  set version = version + 1
  where id = p_set_id
  returning * into set_row;

  event_id_value := private.enqueue_contract_event_v2(
    'set.join_requested.v2',
    'match_set',
    p_set_id,
    set_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'joinRequestId', request_id_value,
      'requesterPlayerId', actor_player_id,
      'setId', p_set_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.match_set_command_receipt_v2(
    command_name,
    'join_requested',
    p_set_id,
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

revoke execute on function private.match_set_command_receipt_v2(
  text, text, uuid, uuid, uuid[], boolean
) from public, anon, authenticated;
revoke execute on function private.match_set_active_player_ids_v2(uuid)
  from public, anon, authenticated;
grant execute on function private.match_set_command_receipt_v2(
  text, text, uuid, uuid, uuid[], boolean
) to service_role;
grant execute on function private.match_set_active_player_ids_v2(uuid)
  to service_role;

revoke execute on function public.create_match_set_v2(
  text, text, integer, timestamptz, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.update_match_set_v2(
  uuid, text, text, integer, timestamptz, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.close_match_set_v2(
  uuid, text, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.reopen_match_set_v2(
  uuid, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.invite_to_set_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.request_set_join_v2(
  uuid, text, uuid, bigint, jsonb
) from public, anon;

grant execute on function public.create_match_set_v2(
  text, text, integer, timestamptz, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.update_match_set_v2(
  uuid, text, text, integer, timestamptz, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.close_match_set_v2(
  uuid, text, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.reopen_match_set_v2(
  uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.invite_to_set_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.request_set_join_v2(
  uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;
