-- Forward-port canonical Match Set receipt facts without rewriting migration 020.
-- Existing durable receipt payloads are enriched from authoritative rows on replay.

create or replace function public.create_set_invite_v1(
  p_set_id uuid,
  p_target_player_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_set_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_player_id uuid;
  low_player_id uuid;
  high_player_id uuid;
  low_lifecycle jsonb;
  high_lifecycle jsonb;
  actor_lifecycle jsonb;
  target_lifecycle jsonb;
  actor_profile public.player_profiles_v1%rowtype;
  target_profile public.player_profiles_v1%rowtype;
  set_row public.match_sets_v1%rowtype;
  invite public.match_set_invites_v1%rowtype;
  request_hash text;
  command_state record;
  response_payload jsonb;
  event_id uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;
  if p_set_id is null or p_target_player_id is null or p_correlation_id is null
    or p_expected_set_version is null
  then
    perform private.raise_core_error_v1('validation_failed', 'Set invite command is incomplete.');
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id,
    'targetPlayerId', p_target_player_id,
    'correlationId', p_correlation_id,
    'expectedSetVersion', p_expected_set_version
  ));
  select * into command_state
  from private.begin_command_v1(
    'create_set_invite_v1', actor_account_id, p_idempotency_key, request_hash
  );
  if command_state.repeated then
    if command_state.response ? 'inviteId' then
      select * into invite
      from public.match_set_invites_v1
      where id = (command_state.response ->> 'inviteId')::uuid;
      if invite.id is not null then
        return command_state.response || jsonb_build_object(
          'createdAt', invite.created_at,
          'setId', invite.set_id,
          'targetPlayerId', invite.target_player_id
        );
      end if;
    end if;
    return command_state.response;
  end if;
  if not private.match_decision_writes_enabled_v1() then
    perform private.raise_core_error_v1('service_unavailable', 'Set writes are disabled.', true);
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1('player_not_found', 'Actor identity was not found.');
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;
  if actor_player_id = p_target_player_id then
    perform private.raise_core_error_v1('validation_failed', 'Cannot invite yourself.');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match_set:' || p_set_id::text, 0)
  );
  select * into set_row from public.match_sets_v1 where id = p_set_id for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'Match Set was not found.');
  end if;
  if set_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1('validation_failed', 'Only the Set owner can invite.');
  end if;
  if set_row.version <> p_expected_set_version then
    perform private.raise_core_error_v1('validation_failed', 'Match Set version changed.');
  end if;
  perform private.assert_match_set_open_v1(set_row);

  low_player_id := least(actor_player_id, p_target_player_id);
  high_player_id := greatest(actor_player_id, p_target_player_id);
  low_lifecycle := public.get_player_lifecycle_snapshot_v1(low_player_id, true);
  high_lifecycle := public.get_player_lifecycle_snapshot_v1(high_player_id, true);
  if actor_player_id = low_player_id then
    actor_lifecycle := low_lifecycle; target_lifecycle := high_lifecycle;
  else
    actor_lifecycle := high_lifecycle; target_lifecycle := low_lifecycle;
  end if;
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  perform private.assert_discovery_eligible_v1(target_lifecycle);
  perform private.assert_active_match_intent_v1(actor_player_id);

  if exists (
    select 1 from public.match_set_members_v1 members
    where members.set_id = p_set_id and members.player_id = p_target_player_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Target is already a Set member.');
  end if;

  select * into actor_profile from public.player_profiles_v1
  where id = (actor_lifecycle ->> 'profileId')::uuid;
  select * into target_profile from public.player_profiles_v1
  where id = (target_lifecycle ->> 'profileId')::uuid;
  if private.are_profiles_blocked(
    actor_profile.legacy_profile_id, target_profile.legacy_profile_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Relationship is blocked.');
  end if;

  select * into invite
  from public.match_set_invites_v1 invites
  where invites.set_id = p_set_id
    and invites.target_player_id = p_target_player_id
    and invites.state = 'pending'
  for update;
  if invite.id is not null then
    response_payload := jsonb_build_object(
      'createdAt', invite.created_at,
      'inviteId', invite.id,
      'repeated', true,
      'setId', invite.set_id,
      'state', 'pending',
      'targetPlayerId', invite.target_player_id
    );
    perform private.finish_command_v1(
      'create_set_invite_v1', actor_account_id, p_idempotency_key, response_payload
    );
    return response_payload;
  end if;

  insert into public.match_set_invites_v1 (
    set_id, actor_player_id, target_player_id, correlation_id
  ) values (
    p_set_id, actor_player_id, p_target_player_id, p_correlation_id
  ) returning * into invite;

  event_id := private.enqueue_contract_event_v1(
    'set.invite_created.v1', 'set_invite', invite.id, p_correlation_id, null,
    jsonb_build_object(
      'actorPlayerId', actor_player_id,
      'inviteId', invite.id,
      'setId', p_set_id,
      'targetPlayerId', p_target_player_id
    ),
    format('set.invite_created.v1:%s', invite.id)
  );
  perform private.enqueue_contract_event_v1(
    'notification.requested.v1', 'player', p_target_player_id,
    p_correlation_id, event_id,
    jsonb_build_object(
      'recipientPlayerId', p_target_player_id,
      'reasonCode', 'set_invite_created',
      'target', jsonb_build_object(
        'kind', 'set_invite', 'setId', p_set_id, 'inviteId', invite.id
      )
    ),
    format('notification.requested.v1:set_invite:%s', invite.id)
  );

  response_payload := jsonb_build_object(
    'createdAt', invite.created_at,
    'inviteId', invite.id,
    'repeated', false,
    'setId', invite.set_id,
    'state', 'pending',
    'targetPlayerId', invite.target_player_id
  );
  perform private.finish_command_v1(
    'create_set_invite_v1', actor_account_id, p_idempotency_key, response_payload
  );
  return response_payload;
end;
$$;

create or replace function public.request_set_join_v1(
  p_set_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_set_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_lifecycle jsonb;
  actor_player_id uuid;
  actor_profile public.player_profiles_v1%rowtype;
  owner_profile public.player_profiles_v1%rowtype;
  set_row public.match_sets_v1%rowtype;
  join_request public.match_set_join_requests_v1%rowtype;
  request_hash text;
  command_state record;
  response_payload jsonb;
  event_id uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;
  if p_set_id is null or p_correlation_id is null or p_expected_set_version is null then
    perform private.raise_core_error_v1('validation_failed', 'Set join command is incomplete.');
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id,
    'correlationId', p_correlation_id,
    'expectedSetVersion', p_expected_set_version
  ));
  select * into command_state
  from private.begin_command_v1(
    'request_set_join_v1', actor_account_id, p_idempotency_key, request_hash
  );
  if command_state.repeated then
    if command_state.response ? 'joinRequestId' then
      select * into join_request
      from public.match_set_join_requests_v1
      where id = (command_state.response ->> 'joinRequestId')::uuid;
      if join_request.id is not null then
        return command_state.response || jsonb_build_object(
          'createdAt', join_request.created_at,
          'setId', join_request.set_id
        );
      end if;
    end if;
    return command_state.response;
  end if;
  if not private.match_decision_writes_enabled_v1() then
    perform private.raise_core_error_v1('service_unavailable', 'Set writes are disabled.', true);
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1('player_not_found', 'Actor identity was not found.');
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match_set:' || p_set_id::text, 0)
  );
  select * into set_row from public.match_sets_v1 where id = p_set_id for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'Match Set was not found.');
  end if;
  if set_row.version <> p_expected_set_version then
    perform private.raise_core_error_v1('validation_failed', 'Match Set version changed.');
  end if;
  perform private.assert_match_set_open_v1(set_row);

  actor_lifecycle := public.get_player_lifecycle_snapshot_v1(actor_player_id, true);
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  perform private.assert_active_match_intent_v1(actor_player_id);
  if exists (
    select 1 from public.match_set_members_v1 members
    where members.set_id = p_set_id and members.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Player is already a Set member.');
  end if;

  select * into actor_profile from public.player_profiles_v1
  where id = (actor_lifecycle ->> 'profileId')::uuid;
  select * into owner_profile from public.player_profiles_v1
  where player_id = set_row.owner_player_id;
  if private.are_profiles_blocked(
    actor_profile.legacy_profile_id, owner_profile.legacy_profile_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Relationship is blocked.');
  end if;

  select * into join_request
  from public.match_set_join_requests_v1 requests
  where requests.set_id = p_set_id
    and requests.requester_player_id = actor_player_id
    and requests.state = 'pending'
  for update;
  if join_request.id is not null then
    response_payload := jsonb_build_object(
      'createdAt', join_request.created_at,
      'joinRequestId', join_request.id,
      'repeated', true,
      'setId', join_request.set_id,
      'state', 'pending'
    );
    perform private.finish_command_v1(
      'request_set_join_v1', actor_account_id, p_idempotency_key, response_payload
    );
    return response_payload;
  end if;

  insert into public.match_set_join_requests_v1 (
    set_id, requester_player_id, correlation_id
  ) values (
    p_set_id, actor_player_id, p_correlation_id
  ) returning * into join_request;

  event_id := private.enqueue_contract_event_v1(
    'set.join_requested.v1', 'set_join_request', join_request.id,
    p_correlation_id, null,
    jsonb_build_object(
      'joinRequestId', join_request.id,
      'requesterPlayerId', actor_player_id,
      'setId', p_set_id
    ),
    format('set.join_requested.v1:%s', join_request.id)
  );
  perform private.enqueue_contract_event_v1(
    'notification.requested.v1', 'player', set_row.owner_player_id,
    p_correlation_id, event_id,
    jsonb_build_object(
      'recipientPlayerId', set_row.owner_player_id,
      'reasonCode', 'set_join_requested',
      'target', jsonb_build_object(
        'kind', 'set_join_request',
        'setId', p_set_id,
        'joinRequestId', join_request.id
      )
    ),
    format('notification.requested.v1:set_join:%s', join_request.id)
  );

  response_payload := jsonb_build_object(
    'createdAt', join_request.created_at,
    'joinRequestId', join_request.id,
    'repeated', false,
    'setId', join_request.set_id,
    'state', 'pending'
  );
  perform private.finish_command_v1(
    'request_set_join_v1', actor_account_id, p_idempotency_key, response_payload
  );
  return response_payload;
end;
$$;


revoke execute on function public.create_set_invite_v1(uuid, uuid, text, uuid, bigint)
  from public, anon;
revoke execute on function public.request_set_join_v1(uuid, text, uuid, bigint)
  from public, anon;
grant execute on function public.create_set_invite_v1(uuid, uuid, text, uuid, bigint)
  to authenticated;
grant execute on function public.request_set_join_v1(uuid, text, uuid, bigint)
  to authenticated;
