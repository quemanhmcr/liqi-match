-- Core V2 Match Set membership, ownership and Set-to-Session conversion.
-- All capacity-sensitive transitions serialize the Set aggregate before
-- checking cross-row invariants.

create or replace function private.assert_match_set_pairwise_eligible_v2(
  p_set_id uuid,
  p_candidate_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_player_id uuid;
begin
  perform private.assert_party_session_player_active_v2(
    p_candidate_player_id,
    false
  );

  for member_player_id in
    select members.player_id
    from public.match_set_members_v2 members
    where members.set_id = p_set_id
      and members.state = 'active'
  loop
    if private.are_players_blocked_v2(
      member_player_id,
      p_candidate_player_id
    ) then
      perform private.raise_core_error_v1(
        'relationship_blocked',
        'A Match Set member has an authoritative block with the candidate.'
      );
    end if;
  end loop;
end;
$$;

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
  set state = case when active_count >= capacity then 'full' else 'open' end,
      version = version + 1
  where id = p_set_id
  returning * into set_row;

  return set_row;
end;
$$;

create or replace function public.accept_set_invite_v2(
  p_set_id uuid,
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
  command_name constant text := 'accept_set_invite_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  invite_row public.match_set_invites_v2%rowtype;
  active_count integer;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_invite_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1('validation_failed', 'Accept Set invite input is invalid.');
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id,
    'inviteId', p_invite_id,
    'expectedVersion', p_expected_version,
    'correlationId', p_correlation_id,
    'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;

  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
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
      'version_conflict', 'The Match Set version changed.', false,
      jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version)
    );
  end if;
  if set_row.state <> 'open' then
    perform private.raise_core_error_v1('invalid_transition', 'The Match Set is not accepting members.');
  end if;

  select invites.* into invite_row
  from public.match_set_invites_v2 invites
  where invites.id = p_invite_id and invites.set_id = p_set_id
  for update;
  if invite_row.id is null or invite_row.target_player_id <> actor_player_id then
    perform private.raise_core_error_v1('not_found', 'The Set invite was not found.');
  end if;
  if invite_row.state <> 'pending' then
    perform private.raise_core_error_v1('invalid_transition', 'The Set invite is no longer pending.');
  end if;
  if invite_row.expires_at is not null and invite_row.expires_at <= now() then
    perform private.raise_core_error_v1('invalid_transition', 'The Set invite has expired.');
  end if;

  select count(*) into active_count
  from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.state = 'active';
  if active_count >= set_row.capacity then
    perform private.raise_core_error_v1('capacity_exceeded', 'Match Set capacity has been reached.');
  end if;
  if exists (
    select 1 from public.match_set_members_v2 members
    where members.set_id = p_set_id and members.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'The actor already has Set membership history.');
  end if;

  perform private.assert_session_invite_eligible_v2(invite_row.inviter_player_id, actor_player_id);
  perform private.assert_match_set_pairwise_eligible_v2(p_set_id, actor_player_id);

  insert into public.match_set_members_v2 (set_id, player_id, role, state)
  values (p_set_id, actor_player_id, 'member', 'active');
  update public.match_set_invites_v2
  set state = 'accepted', version = version + 1, responded_at = now()
  where id = p_invite_id;

  set_row := private.advance_match_set_after_join_v2(p_set_id);
  event_id_value := private.enqueue_contract_event_v2(
    'set.member_joined.v2', 'match_set', p_set_id, set_row.version,
    actor_player_id, p_correlation_id, null,
    jsonb_build_object(
      'memberPlayerId', actor_player_id,
      'set', private.match_set_snapshot_v2(p_set_id)
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(
    command_name, 'invite_accepted', p_set_id, p_correlation_id,
    array[event_id_value], false
  );
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.decline_set_invite_v2(
  p_set_id uuid,
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
  command_name constant text := 'decline_set_invite_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  invite_row public.match_set_invites_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_invite_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1('validation_failed', 'Decline Set invite input is invalid.');
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'inviteId', p_invite_id,
    'expectedVersion', p_expected_version, 'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
  );
  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then
    perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false,
      jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version));
  end if;
  select invites.* into invite_row from public.match_set_invites_v2 invites
  where invites.id = p_invite_id and invites.set_id = p_set_id for update;
  if invite_row.id is null or invite_row.target_player_id <> actor_player_id then
    perform private.raise_core_error_v1('not_found', 'The Set invite was not found.');
  end if;
  if invite_row.state <> 'pending' then perform private.raise_core_error_v1('invalid_transition', 'The Set invite is no longer pending.'); end if;

  update public.match_set_invites_v2
  set state = 'declined', version = version + 1, responded_at = now()
  where id = p_invite_id;
  update public.match_sets_v2 set version = version + 1 where id = p_set_id returning * into set_row;
  event_id_value := private.enqueue_contract_event_v2(
    'set.updated.v2', 'match_set', p_set_id, set_row.version,
    actor_player_id, p_correlation_id, null,
    jsonb_build_object(
      'changeType', 'invite_declined', 'recordId', p_invite_id,
      'set', private.match_set_snapshot_v2(p_set_id), 'subjectPlayerId', actor_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(
    command_name, 'invite_declined', p_set_id, p_correlation_id, array[event_id_value], false
  );
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.cancel_set_invite_v2(
  p_set_id uuid,
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
  command_name constant text := 'cancel_set_invite_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  invite_row public.match_set_invites_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_invite_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1('validation_failed', 'Cancel Set invite input is invalid.');
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'inviteId', p_invite_id,
    'expectedVersion', p_expected_version, 'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
  );
  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then
    perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false,
      jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version));
  end if;
  select invites.* into invite_row from public.match_set_invites_v2 invites
  where invites.id = p_invite_id and invites.set_id = p_set_id for update;
  if invite_row.id is null then perform private.raise_core_error_v1('not_found', 'The Set invite was not found.'); end if;
  if invite_row.state <> 'pending' then perform private.raise_core_error_v1('invalid_transition', 'The Set invite is no longer pending.'); end if;
  if actor_player_id <> set_row.owner_player_id and actor_player_id <> invite_row.inviter_player_id then
    perform private.raise_core_error_v1('forbidden', 'Only the owner or inviter can cancel this Set invite.');
  end if;

  update public.match_set_invites_v2
  set state = 'cancelled', version = version + 1, responded_at = now()
  where id = p_invite_id;
  update public.match_sets_v2 set version = version + 1 where id = p_set_id returning * into set_row;
  event_id_value := private.enqueue_contract_event_v2(
    'set.updated.v2', 'match_set', p_set_id, set_row.version,
    actor_player_id, p_correlation_id, null,
    jsonb_build_object(
      'changeType', 'invite_cancelled', 'recordId', p_invite_id,
      'set', private.match_set_snapshot_v2(p_set_id), 'subjectPlayerId', invite_row.target_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(
    command_name, 'invite_cancelled', p_set_id, p_correlation_id, array[event_id_value], false
  );
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.accept_set_join_request_v2(
  p_set_id uuid,
  p_join_request_id uuid,
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
  command_name constant text := 'accept_set_join_request_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  request_row public.match_set_join_requests_v2%rowtype;
  active_count integer;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_join_request_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1('validation_failed', 'Accept join request input is invalid.');
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'joinRequestId', p_join_request_id,
    'expectedVersion', p_expected_version, 'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(
    command_name, actor_account_id, p_idempotency_key, actor_player_id,
    p_correlation_id, p_expected_version, p_audit
  );
  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then
    perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false,
      jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version));
  end if;
  if set_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1('forbidden', 'Only the active owner can accept join requests.');
  end if;
  if set_row.state <> 'open' then perform private.raise_core_error_v1('invalid_transition', 'The Match Set is not accepting members.'); end if;
  select requests.* into request_row from public.match_set_join_requests_v2 requests
  where requests.id = p_join_request_id and requests.set_id = p_set_id for update;
  if request_row.id is null or request_row.state <> 'pending' then
    perform private.raise_core_error_v1('not_found', 'The pending join request was not found.');
  end if;
  if request_row.expires_at is not null and request_row.expires_at <= now() then
    perform private.raise_core_error_v1('invalid_transition', 'The join request has expired.');
  end if;
  select count(*) into active_count from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.state = 'active';
  if active_count >= set_row.capacity then perform private.raise_core_error_v1('capacity_exceeded', 'Match Set capacity has been reached.'); end if;
  if exists (select 1 from public.match_set_members_v2 members where members.set_id = p_set_id and members.player_id = request_row.requester_player_id) then
    perform private.raise_core_error_v1('validation_failed', 'The requester already has Set membership history.');
  end if;

  perform private.assert_match_set_pairwise_eligible_v2(p_set_id, request_row.requester_player_id);
  insert into public.match_set_members_v2 (set_id, player_id, role, state)
  values (p_set_id, request_row.requester_player_id, 'member', 'active');
  update public.match_set_join_requests_v2
  set state = 'accepted', version = version + 1, responded_at = now()
  where id = p_join_request_id;
  set_row := private.advance_match_set_after_join_v2(p_set_id);
  event_id_value := private.enqueue_contract_event_v2(
    'set.member_joined.v2', 'match_set', p_set_id, set_row.version,
    actor_player_id, p_correlation_id, null,
    jsonb_build_object(
      'memberPlayerId', request_row.requester_player_id,
      'set', private.match_set_snapshot_v2(p_set_id)
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(
    command_name, 'join_request_accepted', p_set_id, p_correlation_id, array[event_id_value], false
  );
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.reject_set_join_request_v2(
  p_set_id uuid,
  p_join_request_id uuid,
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
  command_name constant text := 'reject_set_join_request_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  request_row public.match_set_join_requests_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_join_request_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1('validation_failed', 'Reject join request input is invalid.');
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'joinRequestId', p_join_request_id,
    'expectedVersion', p_expected_version, 'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(command_name, actor_account_id, p_idempotency_key, actor_player_id, p_correlation_id, p_expected_version, p_audit);
  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false, jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version)); end if;
  if set_row.owner_player_id <> actor_player_id then perform private.raise_core_error_v1('forbidden', 'Only the active owner can reject join requests.'); end if;
  select requests.* into request_row from public.match_set_join_requests_v2 requests where requests.id = p_join_request_id and requests.set_id = p_set_id for update;
  if request_row.id is null or request_row.state <> 'pending' then perform private.raise_core_error_v1('not_found', 'The pending join request was not found.'); end if;
  update public.match_set_join_requests_v2 set state = 'rejected', version = version + 1, responded_at = now() where id = p_join_request_id;
  update public.match_sets_v2 set version = version + 1 where id = p_set_id returning * into set_row;
  event_id_value := private.enqueue_contract_event_v2(
    'set.updated.v2', 'match_set', p_set_id, set_row.version, actor_player_id,
    p_correlation_id, null,
    jsonb_build_object(
      'changeType', 'join_request_rejected', 'recordId', p_join_request_id,
      'set', private.match_set_snapshot_v2(p_set_id),
      'subjectPlayerId', request_row.requester_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(command_name, 'join_request_rejected', p_set_id, p_correlation_id, array[event_id_value], false);
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.cancel_set_join_request_v2(
  p_set_id uuid,
  p_join_request_id uuid,
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
  command_name constant text := 'cancel_set_join_request_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  request_row public.match_set_join_requests_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_join_request_id is null or p_expected_version <= 0 then perform private.raise_core_error_v1('validation_failed', 'Cancel join request input is invalid.'); end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'joinRequestId', p_join_request_id,
    'expectedVersion', p_expected_version, 'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(command_name, actor_account_id, p_idempotency_key, actor_player_id, p_correlation_id, p_expected_version, p_audit);
  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false, jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version)); end if;
  select requests.* into request_row from public.match_set_join_requests_v2 requests where requests.id = p_join_request_id and requests.set_id = p_set_id for update;
  if request_row.id is null or request_row.requester_player_id <> actor_player_id then perform private.raise_core_error_v1('not_found', 'The join request was not found.'); end if;
  if request_row.state <> 'pending' then perform private.raise_core_error_v1('invalid_transition', 'The join request is no longer pending.'); end if;
  update public.match_set_join_requests_v2 set state = 'cancelled', version = version + 1, responded_at = now() where id = p_join_request_id;
  update public.match_sets_v2 set version = version + 1 where id = p_set_id returning * into set_row;
  event_id_value := private.enqueue_contract_event_v2(
    'set.updated.v2', 'match_set', p_set_id, set_row.version, actor_player_id,
    p_correlation_id, null,
    jsonb_build_object(
      'changeType', 'join_request_cancelled', 'recordId', p_join_request_id,
      'set', private.match_set_snapshot_v2(p_set_id), 'subjectPlayerId', actor_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(command_name, 'join_request_cancelled', p_set_id, p_correlation_id, array[event_id_value], false);
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.leave_set_v2(
  p_set_id uuid,
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
  command_name constant text := 'leave_set_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  member_row public.match_set_members_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_expected_version <= 0
    or char_length(btrim(coalesce(p_reason_code, ''))) not between 1 and 64 then
    perform private.raise_core_error_v1('validation_failed', 'Leave Set input is invalid.');
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'reasonCode', btrim(p_reason_code),
    'expectedVersion', p_expected_version, 'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state
  from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(command_name, actor_account_id, p_idempotency_key, actor_player_id, p_correlation_id, p_expected_version, p_audit);
  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false, jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version)); end if;
  if set_row.state not in ('open', 'full') then perform private.raise_core_error_v1('invalid_transition', 'Membership can change only while recruiting.'); end if;
  if set_row.owner_player_id = actor_player_id then perform private.raise_core_error_v1('owner_transfer_required', 'The owner must transfer ownership or close the Set before leaving.'); end if;
  select members.* into member_row from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.player_id = actor_player_id for update;
  if member_row.player_id is null or member_row.state <> 'active' then perform private.raise_core_error_v1('membership_required', 'Active Set membership is required.'); end if;

  update public.match_set_members_v2
  set state = 'left', left_at = now(), reason_code = btrim(p_reason_code)
  where set_id = p_set_id and player_id = actor_player_id;
  update public.match_sets_v2
  set state = 'open', version = version + 1
  where id = p_set_id returning * into set_row;
  event_id_value := private.enqueue_contract_event_v2(
    'set.member_removed.v2', 'match_set', p_set_id, set_row.version,
    actor_player_id, p_correlation_id, null,
    jsonb_build_object(
      'memberPlayerId', actor_player_id,
      'reasonCode', btrim(p_reason_code),
      'set', private.match_set_snapshot_v2(p_set_id)
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(command_name, 'member_left', p_set_id, p_correlation_id, array[event_id_value], false);
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.remove_set_member_v2(
  p_set_id uuid,
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
  command_name constant text := 'remove_set_member_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  member_row public.match_set_members_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_member_player_id is null or p_expected_version <= 0
    or char_length(btrim(coalesce(p_reason_code, ''))) not between 1 and 64 then
    perform private.raise_core_error_v1('validation_failed', 'Remove Set member input is invalid.');
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'memberPlayerId', p_member_player_id,
    'reasonCode', btrim(p_reason_code), 'expectedVersion', p_expected_version,
    'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(command_name, actor_account_id, p_idempotency_key, actor_player_id, p_correlation_id, p_expected_version, p_audit);
  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false, jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version)); end if;
  if set_row.owner_player_id <> actor_player_id then perform private.raise_core_error_v1('forbidden', 'Only the owner can remove a Set member.'); end if;
  if set_row.state not in ('open', 'full') then perform private.raise_core_error_v1('invalid_transition', 'Membership can change only while recruiting.'); end if;
  if p_member_player_id = set_row.owner_player_id then perform private.raise_core_error_v1('owner_transfer_required', 'The owner cannot remove themselves.'); end if;
  select members.* into member_row from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.player_id = p_member_player_id for update;
  if member_row.player_id is null or member_row.state <> 'active' then perform private.raise_core_error_v1('membership_required', 'The target is not an active Set member.'); end if;

  update public.match_set_members_v2
  set state = 'removed', left_at = now(), reason_code = btrim(p_reason_code)
  where set_id = p_set_id and player_id = p_member_player_id;
  update public.match_sets_v2 set state = 'open', version = version + 1
  where id = p_set_id returning * into set_row;
  event_id_value := private.enqueue_contract_event_v2(
    'set.member_removed.v2', 'match_set', p_set_id, set_row.version,
    actor_player_id, p_correlation_id, null,
    jsonb_build_object(
      'memberPlayerId', p_member_player_id,
      'reasonCode', btrim(p_reason_code),
      'set', private.match_set_snapshot_v2(p_set_id)
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(command_name, 'member_removed', p_set_id, p_correlation_id, array[event_id_value], false);
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.transfer_set_ownership_v2(
  p_set_id uuid,
  p_new_owner_player_id uuid,
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
  command_name constant text := 'transfer_set_ownership_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  target_member public.match_set_members_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_new_owner_player_id is null or p_expected_version <= 0 then perform private.raise_core_error_v1('validation_failed', 'Transfer Set ownership input is invalid.'); end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'newOwnerPlayerId', p_new_owner_player_id,
    'expectedVersion', p_expected_version, 'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('mutate');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(command_name, actor_account_id, p_idempotency_key, actor_player_id, p_correlation_id, p_expected_version, p_audit);
  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false, jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version)); end if;
  if set_row.owner_player_id <> actor_player_id then perform private.raise_core_error_v1('forbidden', 'Only the active owner can transfer ownership.'); end if;
  if p_new_owner_player_id = actor_player_id then perform private.raise_core_error_v1('validation_failed', 'The target is already the Set owner.'); end if;
  if set_row.state not in ('open', 'full') then perform private.raise_core_error_v1('invalid_transition', 'Ownership can transfer only while recruiting.'); end if;
  select members.* into target_member from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.player_id = p_new_owner_player_id for update;
  if target_member.player_id is null or target_member.state <> 'active' then perform private.raise_core_error_v1('membership_required', 'The new owner must be an active Set member.'); end if;
  perform private.assert_party_session_player_active_v2(p_new_owner_player_id, false);

  update public.match_set_members_v2 set role = 'member'
  where set_id = p_set_id and player_id = actor_player_id and state = 'active';
  update public.match_set_members_v2 set role = 'owner'
  where set_id = p_set_id and player_id = p_new_owner_player_id and state = 'active';
  update public.match_sets_v2
  set owner_player_id = p_new_owner_player_id, version = version + 1
  where id = p_set_id returning * into set_row;
  event_id_value := private.enqueue_contract_event_v2(
    'set.updated.v2', 'match_set', p_set_id, set_row.version,
    actor_player_id, p_correlation_id, null,
    jsonb_build_object(
      'changeType', 'owner_transferred', 'recordId', null,
      'set', private.match_set_snapshot_v2(p_set_id),
      'subjectPlayerId', p_new_owner_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );
  response_value := private.match_set_command_receipt_v2(command_name, 'owner_transferred', p_set_id, p_correlation_id, array[event_id_value], false);
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.create_session_from_set_v2(
  p_set_id uuid,
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
  command_name constant text := 'create_session_from_set_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  set_row public.match_sets_v2%rowtype;
  member_row public.match_set_members_v2%rowtype;
  active_count integer;
  session_id_value uuid;
  set_closed_event_id uuid;
  session_created_event_id uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null or p_expected_version <= 0
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
    or char_length(coalesce(p_timezone, '')) not between 1 and 64
    or (p_scheduled_for is not null and p_scheduled_for <= now()) then
    perform private.raise_core_error_v1('validation_failed', 'Create Session from Set input is invalid.');
  end if;
  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id, 'title', btrim(p_title),
    'scheduledFor', p_scheduled_for, 'timezone', p_timezone,
    'expectedVersion', p_expected_version, 'correlationId', p_correlation_id, 'audit', p_audit
  ));
  select state.repeated, state.response into command_state from private.begin_command_v1(command_name, actor_account_id, p_idempotency_key, request_hash) state;
  if command_state.repeated then return command_state.response; end if;
  perform private.assert_party_session_feature_v2('create');
  actor_mapping := private.resolve_party_session_actor_v2(true, true);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  perform private.record_core_v2_command_audit(command_name, actor_account_id, p_idempotency_key, actor_player_id, p_correlation_id, p_expected_version, p_audit);

  perform pg_advisory_xact_lock(hashtextextended('match-set:' || p_set_id::text, 0));
  select sets.* into set_row from public.match_sets_v2 sets where sets.id = p_set_id for update;
  if set_row.id is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if set_row.version <> p_expected_version then perform private.raise_core_error_v1('version_conflict', 'The Match Set version changed.', false, jsonb_build_object('actualVersion', set_row.version, 'expectedVersion', p_expected_version)); end if;
  if set_row.owner_player_id <> actor_player_id then perform private.raise_core_error_v1('forbidden', 'Only the active Set owner can create its Session.'); end if;
  if set_row.state not in ('open', 'full') then perform private.raise_core_error_v1('invalid_transition', 'Only a recruiting Set can create a Session.'); end if;
  if exists (select 1 from public.play_sessions_v2 sessions where sessions.source_set_id = p_set_id) then perform private.raise_core_error_v1('invalid_transition', 'The Match Set already has a Play Session.'); end if;
  select count(*) into active_count from public.match_set_members_v2 members where members.set_id = p_set_id and members.state = 'active';
  if active_count not between 2 and set_row.capacity then perform private.raise_core_error_v1('ready_policy_not_satisfied', 'Set-to-Session conversion requires two or more active members within capacity.'); end if;

  for member_row in
    select members.* from public.match_set_members_v2 members
    where members.set_id = p_set_id and members.state = 'active'
    order by case when members.role = 'owner' then 0 else 1 end, members.joined_at, members.player_id
  loop
    perform private.assert_party_session_player_active_v2(member_row.player_id, false);
  end loop;

  insert into public.play_sessions_v2 (
    owner_player_id, source_kind, source_set_id, title, capacity,
    state, version, membership_version, timezone, scheduled_for
  ) values (
    set_row.owner_player_id, 'set', p_set_id, btrim(p_title), set_row.capacity,
    'recruiting', 1, 1, p_timezone, p_scheduled_for
  ) returning id into session_id_value;

  insert into public.play_session_members_v2 (session_id, player_id, role, state, joined_at)
  select session_id_value, members.player_id, members.role, 'active', now()
  from public.match_set_members_v2 members
  where members.set_id = p_set_id and members.state = 'active';
  insert into private.play_session_conversation_projection_v2 (session_id)
  values (session_id_value);

  update public.match_set_invites_v2
  set state = 'cancelled', version = version + 1, responded_at = now()
  where set_id = p_set_id and state = 'pending';
  update public.match_set_join_requests_v2
  set state = 'cancelled', version = version + 1, responded_at = now()
  where set_id = p_set_id and state = 'pending';
  update public.match_sets_v2
  set state = 'closed', close_reason = 'converted_to_session',
      closed_at = now(), version = version + 1
  where id = p_set_id returning * into set_row;

  set_closed_event_id := private.enqueue_contract_event_v2(
    'set.closed.v2', 'match_set', p_set_id, set_row.version,
    actor_player_id, p_correlation_id, null,
    jsonb_build_object(
      'closedAt', set_row.closed_at,
      'reasonCode', 'converted_to_session',
      'setId', p_set_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':set-closed'
  );
  session_created_event_id := private.enqueue_contract_event_v2(
    'session.created.v2', 'play_session', session_id_value, 1,
    actor_player_id, p_correlation_id, set_closed_event_id,
    jsonb_build_object(
      'communicationProvisioningRequired', true,
      'membership', private.play_session_membership_snapshot_v2(session_id_value),
      'session', private.play_session_snapshot_v2(session_id_value)
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key || ':session-created'
  );
  response_value := private.play_session_command_receipt_v2(
    command_name, 'created', session_id_value, p_correlation_id,
    array[set_closed_event_id, session_created_event_id], false
  );
  perform private.finish_command_v1(command_name, actor_account_id, p_idempotency_key, response_value);
  return response_value;
end;
$$;

create or replace function public.get_match_set_v2(p_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
  set_snapshot jsonb;
begin
  perform private.assert_party_session_feature_v2('read');
  actor_mapping := private.resolve_party_session_actor_v2(true, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  if p_set_id is null then perform private.raise_core_error_v1('validation_failed', 'MatchSetId is required.'); end if;
  set_snapshot := private.match_set_snapshot_v2(p_set_id);
  if set_snapshot is null then perform private.raise_core_error_v1('not_found', 'The Match Set was not found.'); end if;
  if not exists (
    select 1 from public.match_set_members_v2 members
    where members.set_id = p_set_id and members.player_id = actor_player_id
  ) and ((set_snapshot ->> 'state') not in ('open', 'full')) then
    perform private.raise_core_error_v1('forbidden', 'Historical Match Set visibility requires membership history.');
  end if;
  return set_snapshot;
end;
$$;

create or replace function public.list_recruiting_match_sets_v2(p_limit integer default 20)
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
  if p_limit is null or p_limit not between 1 and 50 then perform private.raise_core_error_v1('validation_failed', 'Set list limit must be between 1 and 50.'); end if;
  return coalesce((
    select jsonb_agg(items.snapshot order by items.updated_at desc, items.set_id)
    from (
      select sets.id as set_id, sets.updated_at,
             private.match_set_snapshot_v2(sets.id) as snapshot
      from public.match_sets_v2 sets
      where sets.state = 'open'
        and (sets.expires_at is null or sets.expires_at > now())
        and not exists (
          select 1 from public.match_set_members_v2 members
          where members.set_id = sets.id and members.player_id = actor_player_id
        )
        and not private.are_players_blocked_v2(actor_player_id, sets.owner_player_id)
      order by sets.updated_at desc, sets.id
      limit p_limit
    ) items
  ), '[]'::jsonb);
end;
$$;

revoke execute on function private.assert_match_set_pairwise_eligible_v2(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.advance_match_set_after_join_v2(uuid) from public, anon, authenticated;
grant execute on function private.assert_match_set_pairwise_eligible_v2(uuid, uuid) to service_role;
grant execute on function private.advance_match_set_after_join_v2(uuid) to service_role;

revoke execute on function public.accept_set_invite_v2(uuid, uuid, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.decline_set_invite_v2(uuid, uuid, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.cancel_set_invite_v2(uuid, uuid, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.accept_set_join_request_v2(uuid, uuid, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.reject_set_join_request_v2(uuid, uuid, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.cancel_set_join_request_v2(uuid, uuid, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.leave_set_v2(uuid, text, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.remove_set_member_v2(uuid, uuid, text, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.transfer_set_ownership_v2(uuid, uuid, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.create_session_from_set_v2(uuid, text, timestamptz, text, text, uuid, bigint, jsonb) from public, anon;
revoke execute on function public.get_match_set_v2(uuid) from public, anon;
revoke execute on function public.list_recruiting_match_sets_v2(integer) from public, anon;

grant execute on function public.accept_set_invite_v2(uuid, uuid, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.decline_set_invite_v2(uuid, uuid, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.cancel_set_invite_v2(uuid, uuid, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.accept_set_join_request_v2(uuid, uuid, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.reject_set_join_request_v2(uuid, uuid, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.cancel_set_join_request_v2(uuid, uuid, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.leave_set_v2(uuid, text, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.remove_set_member_v2(uuid, uuid, text, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.transfer_set_ownership_v2(uuid, uuid, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.create_session_from_set_v2(uuid, text, timestamptz, text, text, uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.get_match_set_v2(uuid) to authenticated, service_role;
grant execute on function public.list_recruiting_match_sets_v2(integer) to authenticated, service_role;
