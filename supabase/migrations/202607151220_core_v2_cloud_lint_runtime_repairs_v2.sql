-- Final Core V2 cloud lint runtime repairs discovered on the dedicated Supabase
-- PostgreSQL 17 E2E project. Keep public signatures and authority semantics
-- unchanged while making enum assignments and PL/pgSQL variable resolution
-- explicit for the deployed database engine.

create or replace function private.advance_match_set_after_join_v2(
  p_set_id uuid
)
returns public.match_sets_v2
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_row public.match_sets_v2%rowtype;
  active_count integer;
begin
  select count(*) into active_count
  from public.match_set_members_v2 members
  where members.set_id = p_set_id
    and members.state = 'active';

  update public.match_sets_v2
  set state = case
        when active_count >= capacity then 'full'::public.match_set_state_v2
        else 'open'::public.match_set_state_v2
      end,
      version = version + 1
  where id = p_set_id
  returning * into set_row;

  return set_row;
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
      state = case
        when active_count >= p_capacity then 'full'::public.match_set_state_v2
        else 'open'::public.match_set_state_v2
      end,
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
  set state = case
        when active_count >= capacity then 'full'::public.match_set_state_v2
        else 'open'::public.match_set_state_v2
      end,
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

create or replace function public.provision_direct_conversation_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'provision_direct_conversation_v2';
  context jsonb;
  source jsonb;
  participants jsonb;
  source_type_value public.conversation_source_type_v2;
  source_id_value uuid;
  source_aggregate_version_value bigint;
  player_one uuid;
  player_two uuid;
  player_low uuid;
  player_high uuid;
  existing_pair private.conversation_direct_pairs_v2%rowtype;
  existing_source public.conversation_sources_v2%rowtype;
  source_already_bound boolean := false;
  conversation public.conversations_v2%rowtype;
  event_id uuid;
  response jsonb;
begin
  context := private.begin_conversation_service_command_v2(command_name, command);
  if (context ->> 'repeated')::boolean then return context -> 'response'; end if;

  source := command -> 'source';
  participants := command -> 'participantPlayerIds';
  if jsonb_typeof(source) is distinct from 'object'
    or source ->> 'sourceType' not in ('direct_match', 'friendship')
    or jsonb_typeof(participants) is distinct from 'array'
    or jsonb_array_length(participants) <> 2
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Direct conversation requires a direct_match/friendship source and two participants.'
    );
  end if;
  begin
    source_type_value := (source ->> 'sourceType')::public.conversation_source_type_v2;
    source_id_value := (source ->> 'sourceId')::uuid;
    source_aggregate_version_value := (source ->> 'sourceAggregateVersion')::bigint;
    player_one := (participants ->> 0)::uuid;
    player_two := (participants ->> 1)::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Direct conversation source or participant identifiers are invalid.'
    );
  end;
  if player_one = player_two or source_aggregate_version_value <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Direct conversation participants must be distinct and source version positive.'
    );
  end if;
  perform private.assert_social_target_v2(player_one, true, false);
  perform private.assert_social_target_v2(player_two, true, false);
  player_low := least(player_one, player_two);
  player_high := greatest(player_one, player_two);
  perform pg_advisory_xact_lock(hashtextextended('conversation-direct:' || player_low || ':' || player_high, 0));

  select * into existing_pair
  from private.conversation_direct_pairs_v2 pairs
  where pairs.player_low_id = player_low and pairs.player_high_id = player_high
  for update;
  if existing_pair.conversation_id is not null then
    select * into conversation
    from public.conversations_v2
    where id = existing_pair.conversation_id
    for update;
    select * into existing_source
    from public.conversation_sources_v2 sources
    where sources.source_type = source_type_value
      and sources.source_id = source_id_value
    for update;
    source_already_bound := coalesce(
      existing_source.conversation_id = conversation.id
      and existing_source.source_aggregate_version = source_aggregate_version_value,
      false
    );
    if not source_already_bound then
      perform private.bind_conversation_source_v2(
        conversation.id,
        source_type_value,
        source_id_value,
        source_aggregate_version_value
      );
      update public.conversations_v2
      set version = version + 1,
          updated_at = now()
      where id = conversation.id
      returning * into conversation;
    end if;
  else
    insert into public.conversations_v2 (kind, state, version, last_sequence)
    values ('direct', 'open', 1, 0)
    returning * into conversation;

    insert into private.conversation_direct_pairs_v2 (
      player_low_id,
      player_high_id,
      conversation_id
    ) values (player_low, player_high, conversation.id);
    perform private.bind_conversation_source_v2(
      conversation.id,
      source_type_value,
      source_id_value,
      source_aggregate_version_value
    );
    insert into public.conversation_members_v2 (
      conversation_id,
      player_id,
      role,
      state,
      can_message,
      can_view_conversation,
      membership_version,
      version
    ) values
      (conversation.id, player_low, 'member', 'active', true, true, source_aggregate_version_value, 1),
      (conversation.id, player_high, 'member', 'active', true, true, source_aggregate_version_value, 1);
    insert into public.conversation_read_cursors_v2 (conversation_id, player_id)
    values (conversation.id, player_low), (conversation.id, player_high);
  end if;

  event_id := private.enqueue_contract_event_v2(
    'conversation.provisioned.v2',
    'conversation',
    conversation.id,
    conversation.version,
    null,
    (context #>> '{metadata,correlationId}')::uuid,
    nullif(context #>> '{metadata,causationId}', '')::uuid,
    jsonb_build_object('conversation', private.conversation_snapshot_v2(conversation.id)),
    'conversation-provisioned:' || source_type_value || ':' || source_id_value || ':' || source_aggregate_version_value
  );
  response := private.conversation_service_receipt_v2(
    command_name,
    context,
    conversation,
    event_id,
    null,
    source_already_bound,
    source_aggregate_version_value,
    null
  );
  return private.finish_conversation_service_command_v2(command_name, context, response);
end;
$$;
