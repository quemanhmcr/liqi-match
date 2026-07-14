-- Align the public Play Session RPC surface with the executable Core V2 command
-- contract. This migration is additive in behavior and intentionally removes
-- the old overload so PostgREST has one unambiguous create_play_session_v2.

drop function if exists public.create_play_session_v2(
  text,
  integer,
  timestamptz,
  text,
  text,
  uuid,
  bigint,
  jsonb
);

create or replace function public.create_play_session_v2(
  p_title text,
  p_capacity integer,
  p_initial_invitee_player_ids uuid[],
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
  normalized_invitee_player_ids uuid[] := '{}'::uuid[];
  target_player_id uuid;
  session_id_value uuid;
  invite_id_value uuid;
  created_event_id uuid;
  invite_event_id uuid;
  event_ids uuid[] := '{}'::uuid[];
  response_value jsonb;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_account_id := (actor_mapping ->> 'accountId')::uuid;
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  select coalesce(array_agg(invitee.player_id order by invitee.player_id), '{}'::uuid[])
  into normalized_invitee_player_ids
  from (
    select distinct value as player_id
    from unnest(coalesce(p_initial_invitee_player_ids, '{}'::uuid[])) value
    where value is not null
  ) invitee;

  if p_expected_version <> 0
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
    or p_capacity not between 2 and 5
    or char_length(coalesce(p_timezone, '')) not between 1 and 64
    or (p_scheduled_for is not null and p_scheduled_for <= now())
    or exists (
      select 1
      from unnest(coalesce(p_initial_invitee_player_ids, '{}'::uuid[])) value
      where value is null
    )
    or cardinality(normalized_invitee_player_ids) <>
      cardinality(coalesce(p_initial_invitee_player_ids, '{}'::uuid[]))
    or cardinality(normalized_invitee_player_ids) > p_capacity - 1
    or actor_player_id = any(normalized_invitee_player_ids)
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Create Play Session input is invalid.'
    );
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'title', btrim(p_title),
    'capacity', p_capacity,
    'initialInviteePlayerIds', to_jsonb(normalized_invitee_player_ids),
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

  foreach target_player_id in array normalized_invitee_player_ids loop
    perform private.assert_session_invite_eligible_v2(
      actor_player_id,
      target_player_id
    );
  end loop;

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
    command_name || ':' || actor_account_id::text || ':' ||
      p_idempotency_key || ':created'
  );
  event_ids := array_append(event_ids, created_event_id);

  foreach target_player_id in array normalized_invitee_player_ids loop
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
      command_name || ':' || actor_account_id::text || ':' ||
        p_idempotency_key || ':invite:' || target_player_id::text
    );
    event_ids := array_append(event_ids, invite_event_id);
  end loop;

  response_value := private.play_session_command_receipt_v2(
    command_name,
    'created',
    session_id_value,
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

revoke execute on function public.create_play_session_v2(
  text,
  integer,
  uuid[],
  timestamptz,
  text,
  text,
  uuid,
  bigint,
  jsonb
) from public, anon;
grant execute on function public.create_play_session_v2(
  text,
  integer,
  uuid[],
  timestamptz,
  text,
  text,
  uuid,
  bigint,
  jsonb
) to authenticated, service_role;
