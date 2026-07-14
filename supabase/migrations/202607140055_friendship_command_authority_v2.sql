-- Core V2 friendship command authority.
-- Every mutation resolves the canonical actor PlayerId through Core V1,
-- validates lifecycle and authorization at write time, uses durable command
-- receipts, emits an exact V2 event envelope, and records server audit metadata.

create or replace function private.begin_social_command_v2(
  p_command_name text,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config_row private.social_authority_config_v2;
  actor_context jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  idempotency_key_value text;
  correlation_id_value uuid;
  expected_relationship_version_value bigint;
  audit_value jsonb;
  client_created_at_value timestamptz;
  request_hash_value text;
  command_state record;
begin
  if jsonb_typeof(p_command) is distinct from 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Core V2 social command must be a JSON object.'
    );
  end if;

  select config.* into config_row
  from private.social_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.writes_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 social mutations are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_social_actor_v2(true, true);
  actor_account_id := (actor_context ->> 'accountId')::uuid;
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  idempotency_key_value := nullif(p_command ->> 'idempotencyKey', '');

  begin
    correlation_id_value := (p_command ->> 'correlationId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'correlationId must be a valid UUID.'
    );
  end;

  begin
    expected_relationship_version_value :=
      (p_command ->> 'expectedRelationshipVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedRelationshipVersion must be a non-negative integer.'
    );
  end;
  if expected_relationship_version_value is null
    or expected_relationship_version_value < 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedRelationshipVersion must be a non-negative integer.'
    );
  end if;

  audit_value := p_command -> 'audit';
  if jsonb_typeof(audit_value) is distinct from 'object'
    or nullif(audit_value ->> 'requestId', '') is null
    or char_length(audit_value ->> 'requestId') > 128
    or audit_value ->> 'clientPlatform' not in ('ios', 'android', 'web', 'service')
    or nullif(audit_value ->> 'clientVersion', '') is null
    or char_length(audit_value ->> 'clientVersion') > 64 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit metadata is incomplete or invalid.'
    );
  end if;
  begin
    client_created_at_value := (audit_value ->> 'clientCreatedAt')::timestamptz;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit.clientCreatedAt must be an ISO timestamp.'
    );
  end;
  if client_created_at_value is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit.clientCreatedAt is required.'
    );
  end if;

  request_hash_value := private.command_request_hash_v1(p_command);
  select * into command_state
  from private.begin_command_v1(
    p_command_name,
    actor_account_id,
    idempotency_key_value,
    request_hash_value
  );

  return jsonb_build_object(
    'actorAccountId', actor_account_id,
    'actorPlayerId', actor_player_id,
    'audit', audit_value,
    'correlationId', correlation_id_value,
    'expectedRelationshipVersion', expected_relationship_version_value,
    'idempotencyKey', idempotency_key_value,
    'repeated', command_state.repeated,
    'response', command_state.response
  );
end;
$$;

create or replace function private.assert_social_relationship_version_v2(
  p_relationship public.social_relationships_v2,
  p_expected_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_relationship.version is distinct from p_expected_version then
    perform private.raise_core_error_v1(
      'relationship_version_conflict',
      'The social relationship has changed. Reload before retrying.',
      false,
      jsonb_build_object(
        'actualVersion', p_relationship.version,
        'expectedVersion', p_expected_version,
        'relationshipId', p_relationship.id
      )
    );
  end if;
end;
$$;

create or replace function private.write_social_command_audit_v2(
  p_context jsonb,
  p_action text,
  p_relationship_id uuid,
  p_target_player_id uuid,
  p_event_ids jsonb,
  p_extra jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    (p_context ->> 'actorAccountId')::uuid,
    p_action,
    'social_relationship',
    p_relationship_id,
    coalesce(p_context -> 'audit', '{}'::jsonb)
      || jsonb_build_object(
        'actorPlayerId', p_context ->> 'actorPlayerId',
        'correlationId', p_context ->> 'correlationId',
        'eventIds', coalesce(p_event_ids, '[]'::jsonb),
        'relationshipId', p_relationship_id,
        'targetPlayerId', p_target_player_id
      )
      || coalesce(p_extra, '{}'::jsonb)
  );
$$;

create or replace function public.request_friendship_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'request_friendship_v2';
  command_context jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  target_player_id_value uuid;
  expected_relationship_version_value bigint;
  relationship_row public.social_relationships_v2;
  request_row public.friendship_requests_v2;
  privacy_row public.player_privacy_settings_v2;
  active_match boolean := false;
  event_id_value uuid;
  event_type_value text;
  event_payload jsonb;
  response_payload jsonb;
begin
  command_context := private.begin_social_command_v2(command_name, command);
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  actor_account_id := (command_context ->> 'actorAccountId')::uuid;
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  expected_relationship_version_value :=
    (command_context ->> 'expectedRelationshipVersion')::bigint;
  begin
    target_player_id_value := (command ->> 'targetPlayerId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'targetPlayerId must be a valid canonical PlayerId.'
    );
  end;

  perform private.assert_social_target_v2(target_player_id_value, true, true);
  relationship_row := private.ensure_social_relationship_v2(
    actor_player_id,
    target_player_id_value
  );
  perform private.assert_social_relationship_version_v2(
    relationship_row,
    expected_relationship_version_value
  );

  if private.are_players_blocked_v2(actor_player_id, target_player_id_value) then
    perform private.raise_core_error_v1(
      'relationship_blocked',
      'Friendship is unavailable while either player has an active block.'
    );
  end if;
  if relationship_row.friendship_state = 'accepted' then
    perform private.raise_core_error_v1(
      'friendship_already_exists',
      'The players are already friends.'
    );
  end if;

  select requests.* into request_row
  from public.friendship_requests_v2 requests
  where requests.relationship_id = relationship_row.id
    and requests.state = 'pending'
  order by requests.created_at, requests.id
  limit 1
  for update;

  if request_row.id is not null then
    if request_row.requester_player_id = actor_player_id then
      perform private.raise_core_error_v1(
        'friendship_request_forbidden',
        'An outgoing friendship request is already pending.',
        false,
        jsonb_build_object(
          'friendshipRequestId', request_row.id,
          'requestVersion', request_row.version
        )
      );
    end if;

    update public.friendship_requests_v2 requests
    set state = 'accepted',
        version = requests.version + 1,
        responded_at = now()
    where requests.id = request_row.id
    returning requests.* into request_row;

    update public.social_relationships_v2 relationships
    set friendship_state = 'accepted',
        accepted_at = now(),
        removed_at = null,
        version = relationships.version + 1
    where relationships.id = relationship_row.id
    returning relationships.* into relationship_row;

    event_type_value := 'friendship.accepted.v2';
    event_payload := jsonb_build_object(
      'friendshipLabel', 'friend',
      'friendshipRequestId', request_row.id,
      'recipientPlayerId', request_row.recipient_player_id,
      'requestState', 'accepted',
      'requesterPlayerId', request_row.requester_player_id
    );
  else
    select privacy.* into privacy_row
    from public.player_privacy_settings_v2 privacy
    where privacy.player_id = target_player_id_value;

    if coalesce(privacy_row.friendship_requests::text, 'everyone') = 'nobody' then
      perform private.raise_core_error_v1(
        'friendship_request_forbidden',
        'The target player does not accept friendship requests.'
      );
    end if;
    if coalesce(privacy_row.friendship_requests::text, 'everyone') = 'matched_only' then
      select exists (
        select 1
        from public.matches matches
        where matches.unmatched_at is null
          and matches.player_low_id = least(actor_player_id, target_player_id_value)
          and matches.player_high_id = greatest(actor_player_id, target_player_id_value)
      ) into active_match;
      if not active_match then
        perform private.raise_core_error_v1(
          'friendship_request_forbidden',
          'The target player accepts requests only from matched players.'
        );
      end if;
    end if;

    insert into public.friendship_requests_v2 (
      relationship_id,
      requester_player_id,
      recipient_player_id,
      state,
      version,
      expires_at
    ) values (
      relationship_row.id,
      actor_player_id,
      target_player_id_value,
      'pending',
      1,
      now() + interval '30 days'
    ) returning * into request_row;

    update public.social_relationships_v2 relationships
    set friendship_state = 'pending',
        accepted_at = null,
        removed_at = null,
        version = relationships.version + 1
    where relationships.id = relationship_row.id
    returning relationships.* into relationship_row;

    event_type_value := 'friendship.requested.v2';
    event_payload := jsonb_build_object(
      'expiresAt', request_row.expires_at,
      'friendshipLabel', 'pending_outgoing',
      'friendshipRequestId', request_row.id,
      'recipientPlayerId', request_row.recipient_player_id,
      'requestState', 'pending',
      'requesterPlayerId', request_row.requester_player_id
    );
  end if;

  event_id_value := private.enqueue_contract_event_v2(
    event_type_value,
    'social_relationship',
    relationship_row.id,
    relationship_row.version,
    actor_player_id,
    (command_context ->> 'correlationId')::uuid,
    null,
    event_payload,
    format('%s:%s:%s', event_type_value, relationship_row.id, relationship_row.version)
  );

  response_payload := jsonb_build_object(
    'correlationId', command_context ->> 'correlationId',
    'eventIds', jsonb_build_array(event_id_value),
    'relationship', private.social_relationship_snapshot_v2(
      actor_player_id,
      target_player_id_value
    ),
    'repeated', false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    command_context ->> 'idempotencyKey',
    response_payload
  );
  perform private.write_social_command_audit_v2(
    command_context,
    event_type_value,
    relationship_row.id,
    target_player_id_value,
    jsonb_build_array(event_id_value),
    jsonb_build_object(
      'friendshipRequestId', request_row.id,
      'relationshipVersion', relationship_row.version,
      'requestVersion', request_row.version
    )
  );
  return response_payload;
end;
$$;

create or replace function private.execute_friendship_request_transition_v2(
  p_command_name text,
  p_transition public.friendship_request_state_v2,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_context jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  other_player_id uuid;
  friendship_request_id_value uuid;
  expected_relationship_version_value bigint;
  expected_request_version_value bigint;
  relationship_row public.social_relationships_v2;
  request_row public.friendship_requests_v2;
  event_id_value uuid;
  event_type_value text;
  friendship_label_value text;
  response_payload jsonb;
begin
  if p_transition not in ('accepted', 'declined', 'cancelled') then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Unsupported friendship request transition.'
    );
  end if;

  command_context := private.begin_social_command_v2(p_command_name, p_command);
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  actor_account_id := (command_context ->> 'actorAccountId')::uuid;
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  expected_relationship_version_value :=
    (command_context ->> 'expectedRelationshipVersion')::bigint;
  begin
    friendship_request_id_value := (p_command ->> 'friendshipRequestId')::uuid;
    expected_request_version_value :=
      (p_command ->> 'expectedRequestVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'friendshipRequestId and expectedRequestVersion are invalid.'
    );
  end;
  if expected_request_version_value is null or expected_request_version_value < 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedRequestVersion must be a non-negative integer.'
    );
  end if;

  select requests.* into request_row
  from public.friendship_requests_v2 requests
  where requests.id = friendship_request_id_value
  for update;
  if request_row.id is null then
    perform private.raise_core_error_v1(
      'friendship_request_not_found',
      'The friendship request does not exist.'
    );
  end if;
  if request_row.state <> 'pending' then
    perform private.raise_core_error_v1(
      'friendship_request_not_pending',
      'The friendship request is no longer pending.',
      false,
      jsonb_build_object(
        'actualState', request_row.state,
        'requestVersion', request_row.version
      )
    );
  end if;
  if request_row.version <> expected_request_version_value then
    perform private.raise_core_error_v1(
      'relationship_version_conflict',
      'The friendship request has changed. Reload before retrying.',
      false,
      jsonb_build_object(
        'actualRequestVersion', request_row.version,
        'expectedRequestVersion', expected_request_version_value
      )
    );
  end if;

  if p_transition in ('accepted', 'declined')
    and request_row.recipient_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'friendship_request_forbidden',
      'Only the request recipient can accept or decline.'
    );
  end if;
  if p_transition = 'cancelled'
    and request_row.requester_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'friendship_request_forbidden',
      'Only the request sender can cancel.'
    );
  end if;

  other_player_id := case
    when request_row.requester_player_id = actor_player_id
      then request_row.recipient_player_id
    else request_row.requester_player_id
  end;
  perform private.assert_social_target_v2(
    other_player_id,
    p_transition = 'accepted',
    true
  );

  select relationships.* into relationship_row
  from public.social_relationships_v2 relationships
  where relationships.id = request_row.relationship_id
  for update;
  if relationship_row.id is null then
    perform private.raise_core_error_v1(
      'friendship_request_not_found',
      'The request relationship aggregate is missing.'
    );
  end if;
  perform private.assert_social_relationship_version_v2(
    relationship_row,
    expected_relationship_version_value
  );
  if private.are_players_blocked_v2(actor_player_id, other_player_id) then
    perform private.raise_core_error_v1(
      'relationship_blocked',
      'Friendship request mutation is unavailable while blocked.'
    );
  end if;

  update public.friendship_requests_v2 requests
  set state = p_transition,
      version = requests.version + 1,
      responded_at = now()
  where requests.id = request_row.id
  returning requests.* into request_row;

  update public.social_relationships_v2 relationships
  set friendship_state = case
        when p_transition = 'accepted' then 'accepted'::public.friendship_state_v2
        else 'none'::public.friendship_state_v2
      end,
      accepted_at = case when p_transition = 'accepted' then now() else null end,
      removed_at = null,
      version = relationships.version + 1
  where relationships.id = relationship_row.id
  returning relationships.* into relationship_row;

  event_type_value := case p_transition
    when 'accepted' then 'friendship.accepted.v2'
    when 'declined' then 'friendship.declined.v2'
    when 'cancelled' then 'friendship.cancelled.v2'
  end;
  friendship_label_value := case
    when p_transition = 'accepted' then 'friend'
    else 'none'
  end;
  event_id_value := private.enqueue_contract_event_v2(
    event_type_value,
    'social_relationship',
    relationship_row.id,
    relationship_row.version,
    actor_player_id,
    (command_context ->> 'correlationId')::uuid,
    null,
    jsonb_build_object(
      'friendshipLabel', friendship_label_value,
      'friendshipRequestId', request_row.id,
      'recipientPlayerId', request_row.recipient_player_id,
      'requestState', request_row.state,
      'requesterPlayerId', request_row.requester_player_id
    ),
    format('%s:%s:%s', event_type_value, relationship_row.id, relationship_row.version)
  );

  response_payload := jsonb_build_object(
    'correlationId', command_context ->> 'correlationId',
    'eventIds', jsonb_build_array(event_id_value),
    'relationship', private.social_relationship_snapshot_v2(
      actor_player_id,
      other_player_id
    ),
    'repeated', false
  );
  perform private.finish_command_v1(
    p_command_name,
    actor_account_id,
    command_context ->> 'idempotencyKey',
    response_payload
  );
  perform private.write_social_command_audit_v2(
    command_context,
    event_type_value,
    relationship_row.id,
    other_player_id,
    jsonb_build_array(event_id_value),
    jsonb_build_object(
      'friendshipRequestId', request_row.id,
      'relationshipVersion', relationship_row.version,
      'requestVersion', request_row.version
    )
  );
  return response_payload;
end;
$$;

create or replace function public.accept_friendship_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.execute_friendship_request_transition_v2(
    'accept_friendship_v2',
    'accepted',
    command
  );
$$;

create or replace function public.decline_friendship_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.execute_friendship_request_transition_v2(
    'decline_friendship_v2',
    'declined',
    command
  );
$$;

create or replace function public.cancel_friendship_request_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.execute_friendship_request_transition_v2(
    'cancel_friendship_request_v2',
    'cancelled',
    command
  );
$$;

create or replace function public.remove_friendship_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'remove_friendship_v2';
  command_context jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  target_player_id_value uuid;
  expected_relationship_version_value bigint;
  relationship_row public.social_relationships_v2;
  event_id_value uuid;
  response_payload jsonb;
begin
  command_context := private.begin_social_command_v2(command_name, command);
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  actor_account_id := (command_context ->> 'actorAccountId')::uuid;
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  expected_relationship_version_value :=
    (command_context ->> 'expectedRelationshipVersion')::bigint;
  begin
    target_player_id_value := (command ->> 'targetPlayerId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'targetPlayerId must be a valid canonical PlayerId.'
    );
  end;
  perform private.assert_social_target_v2(target_player_id_value, false, true);

  select relationships.* into relationship_row
  from public.social_relationships_v2 relationships
  where relationships.player_low_id = least(actor_player_id, target_player_id_value)
    and relationships.player_high_id = greatest(actor_player_id, target_player_id_value)
  for update;
  if relationship_row.id is null or relationship_row.friendship_state <> 'accepted' then
    perform private.raise_core_error_v1(
      'friendship_not_found',
      'No accepted friendship exists between the players.'
    );
  end if;
  perform private.assert_social_relationship_version_v2(
    relationship_row,
    expected_relationship_version_value
  );

  update public.social_relationships_v2 relationships
  set friendship_state = 'removed',
      removed_at = now(),
      version = relationships.version + 1
  where relationships.id = relationship_row.id
  returning relationships.* into relationship_row;

  event_id_value := private.enqueue_contract_event_v2(
    'friendship.removed.v2',
    'social_relationship',
    relationship_row.id,
    relationship_row.version,
    actor_player_id,
    (command_context ->> 'correlationId')::uuid,
    null,
    jsonb_build_object(
      'playerHighId', relationship_row.player_high_id,
      'playerLowId', relationship_row.player_low_id,
      'removedByPlayerId', actor_player_id
    ),
    format(
      'friendship.removed.v2:%s:%s',
      relationship_row.id,
      relationship_row.version
    )
  );

  response_payload := jsonb_build_object(
    'correlationId', command_context ->> 'correlationId',
    'eventIds', jsonb_build_array(event_id_value),
    'relationship', private.social_relationship_snapshot_v2(
      actor_player_id,
      target_player_id_value
    ),
    'repeated', false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    command_context ->> 'idempotencyKey',
    response_payload
  );
  perform private.write_social_command_audit_v2(
    command_context,
    'friendship.removed.v2',
    relationship_row.id,
    target_player_id_value,
    jsonb_build_array(event_id_value),
    jsonb_build_object('relationshipVersion', relationship_row.version)
  );
  return response_payload;
end;
$$;

revoke execute on function private.begin_social_command_v2(text, jsonb)
  from public, anon, authenticated;
revoke execute on function private.assert_social_relationship_version_v2(
  public.social_relationships_v2,
  bigint
) from public, anon, authenticated;
revoke execute on function private.write_social_command_audit_v2(
  jsonb,
  text,
  uuid,
  uuid,
  jsonb,
  jsonb
) from public, anon, authenticated;
revoke execute on function private.execute_friendship_request_transition_v2(
  text,
  public.friendship_request_state_v2,
  jsonb
) from public, anon, authenticated;
revoke execute on function public.request_friendship_v2(jsonb)
  from public, anon;
revoke execute on function public.accept_friendship_v2(jsonb)
  from public, anon;
revoke execute on function public.decline_friendship_v2(jsonb)
  from public, anon;
revoke execute on function public.cancel_friendship_request_v2(jsonb)
  from public, anon;
revoke execute on function public.remove_friendship_v2(jsonb)
  from public, anon;

grant execute on function public.request_friendship_v2(jsonb)
  to authenticated;
grant execute on function public.accept_friendship_v2(jsonb)
  to authenticated;
grant execute on function public.decline_friendship_v2(jsonb)
  to authenticated;
grant execute on function public.cancel_friendship_request_v2(jsonb)
  to authenticated;
grant execute on function public.remove_friendship_v2(jsonb)
  to authenticated;
