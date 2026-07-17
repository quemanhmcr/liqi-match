-- Product completion for the Play Session invite inbox.
-- Declining is an aggregate command: it consumes the pending invite and bumps
-- the Session version without changing membership_version.

create or replace function public.decline_session_invite_v2(
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
  command_name constant text := 'decline_session_invite_v2';
  actor_mapping jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  request_hash text;
  command_state record;
  session_row public.play_sessions_v2%rowtype;
  invite_row public.play_session_invites_v2%rowtype;
  event_id_value uuid;
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_session_id is null or p_invite_id is null or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Decline Session invite input is invalid.'
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
    perform private.raise_core_error_v1(
      'not_found',
      'The Play Session was not found.'
    );
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
      'Session invitations can be answered only while recruiting.'
    );
  end if;

  select invites.* into invite_row
  from public.play_session_invites_v2 invites
  where invites.id = p_invite_id
    and invites.session_id = p_session_id
  for update;

  if invite_row.id is null or invite_row.target_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'not_found',
      'The Session invite was not found.'
    );
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

  update public.play_session_invites_v2
  set state = 'declined',
      version = version + 1,
      responded_at = now()
  where id = p_invite_id;

  update public.play_sessions_v2
  set version = version + 1
  where id = p_session_id
  returning * into session_row;

  event_id_value := private.enqueue_contract_event_v2(
    'session.invite_declined.v2',
    'play_session',
    p_session_id,
    session_row.version,
    actor_player_id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'inviteId', p_invite_id,
      'sessionId', p_session_id,
      'targetPlayerId', actor_player_id
    ),
    command_name || ':' || actor_account_id::text || ':' || p_idempotency_key
  );

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'invite_declined',
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

comment on function public.decline_session_invite_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) is 'Declines a pending Play Session invite for the active target player.';

revoke execute on function public.decline_session_invite_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) from public, anon;
grant execute on function public.decline_session_invite_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;
