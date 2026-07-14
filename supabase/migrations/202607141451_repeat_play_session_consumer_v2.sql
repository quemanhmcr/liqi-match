-- Consume repeat_play.requested.v2 into the canonical Play Session aggregate.
-- This is a service-role outbox consumer: it never trusts mobile capabilities,
-- and it rechecks lifecycle plus Senior 1 relationship/privacy authority.

alter table public.play_sessions_v2
  add column source_repeat_request_id uuid
    references public.repeat_play_requests_v2(id) on delete restrict;

alter table public.play_sessions_v2
  drop constraint play_sessions_v2_source_consistency;
alter table public.play_sessions_v2
  add constraint play_sessions_v2_source_consistency check (
    (
      source_kind = 'manual'
      and source_match_id is null
      and source_set_id is null
      and source_repeat_request_id is null
    )
    or (
      source_kind = 'match'
      and source_match_id is not null
      and source_set_id is null
      and source_repeat_request_id is null
    )
    or (
      source_kind = 'set'
      and source_match_id is null
      and source_set_id is not null
      and source_repeat_request_id is null
    )
    or (
      source_kind = 'repeat_play'
      and source_match_id is null
      and source_set_id is null
      and source_repeat_request_id is not null
    )
  );

create unique index play_sessions_v2_source_repeat_request_idx
  on public.play_sessions_v2 (source_repeat_request_id)
  where source_repeat_request_id is not null;

create table private.repeat_play_session_consumptions_v2 (
  event_id uuid primary key,
  request_id uuid not null unique
    references public.repeat_play_requests_v2(id) on delete restrict,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  session_id uuid not null unique
    references public.play_sessions_v2(id) on delete restrict,
  result jsonb not null,
  processed_at timestamptz not null default now()
);

revoke all on private.repeat_play_session_consumptions_v2
  from public, anon, authenticated;
grant all on private.repeat_play_session_consumptions_v2 to service_role;

create or replace function private.play_session_snapshot_v2(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sessionId', sessions.id,
    'ownerPlayerId', sessions.owner_player_id,
    'source', case sessions.source_kind
      when 'match' then jsonb_build_object('kind', 'match', 'matchId', sessions.source_match_id)
      when 'set' then jsonb_build_object('kind', 'set', 'setId', sessions.source_set_id)
      when 'repeat_play' then jsonb_build_object(
        'kind', 'repeat_play',
        'requestId', sessions.source_repeat_request_id
      )
      else jsonb_build_object('kind', 'manual')
    end,
    'title', sessions.title,
    'capacity', sessions.capacity,
    'state', sessions.state,
    'version', sessions.version,
    'membershipVersion', sessions.membership_version,
    'timezone', sessions.timezone,
    'scheduledFor', sessions.scheduled_for,
    'startedAt', sessions.started_at,
    'completedAt', sessions.completed_at,
    'cancellationReason', sessions.cancellation_reason,
    'cancelledAt', sessions.cancelled_at,
    'createdAt', sessions.created_at,
    'updatedAt', sessions.updated_at,
    'communication', jsonb_build_object(
      'conversationId', conversation.conversation_id,
      'membershipVersion', coalesce(conversation.membership_version, 0),
      'status', coalesce(conversation.state::text, 'pending')
    ),
    'members', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'playerId', members.player_id,
            'role', members.role,
            'state', members.state,
            'joinedAt', members.joined_at,
            'leftAt', members.left_at
          ) order by members.joined_at, members.player_id
        )
        from public.play_session_members_v2 members
        where members.session_id = sessions.id
      ),
      '[]'::jsonb
    ),
    'roleAssignments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assignmentId', assignments.id,
            'playerId', assignments.player_id,
            'roleSlug', assignments.role_slug,
            'assignedAt', assignments.assigned_at
          ) order by assignments.assigned_at, assignments.id
        )
        from public.play_session_role_assignments_v2 assignments
        where assignments.session_id = sessions.id
          and assignments.active
      ),
      '[]'::jsonb
    ),
    'readyCheck', (
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
      where checks.session_id = sessions.id
      order by checks.opened_at desc, checks.id desc
      limit 1
    ),
    'completionClaims', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'claimId', claims.id,
            'playerId', claims.player_id,
            'kind', claims.kind,
            'reasonCode', claims.reason_code,
            'claimedAt', claims.claimed_at
          ) order by claims.claimed_at, claims.id
        )
        from public.play_session_completion_claims_v2 claims
        where claims.session_id = sessions.id
      ),
      '[]'::jsonb
    )
  )
  from public.play_sessions_v2 sessions
  left join private.play_session_conversation_projection_v2 conversation
    on conversation.session_id = sessions.id
  where sessions.id = p_session_id;
$$;

create or replace function private.consume_repeat_play_session_event_v2(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row private.outbox_events%rowtype;
  envelope jsonb;
  payload_value jsonb;
  event_id_value uuid;
  request_id_value uuid;
  requester_player_id_value uuid;
  teammate_player_ids_value uuid[];
  participant_player_ids_value uuid[];
  correlation_id_value uuid;
  event_aggregate_version bigint;
  payload_hash_value text;
  existing_consumption private.repeat_play_session_consumptions_v2%rowtype;
  request_row public.repeat_play_requests_v2%rowtype;
  session_id_value uuid;
  created_event_id_value uuid;
  invite_event_id_value uuid;
  event_ids_value uuid[] := '{}'::uuid[];
  participant_left_index integer;
  participant_right_index integer;
  teammate_player_id_value uuid;
  invite_id_value uuid;
  receipt_value jsonb;
begin
  select events.* into event_row
  from private.outbox_events events
  where events.id = p_event_id
  for update;

  if event_row.id is null
    or event_row.event_type <> 'repeat_play.requested.v2'
    or event_row.contract_version <> 2 then
    perform private.raise_core_error_v1(
      'unsupported_event_version',
      'Only repeat_play.requested.v2 contract version two is supported.'
    );
  end if;

  envelope := event_row.payload;
  payload_value := envelope -> 'payload';
  begin
    event_id_value := (envelope ->> 'eventId')::uuid;
    request_id_value := (payload_value ->> 'requestId')::uuid;
    requester_player_id_value := (payload_value ->> 'requesterPlayerId')::uuid;
    correlation_id_value := (envelope ->> 'correlationId')::uuid;
    event_aggregate_version := (envelope ->> 'aggregateVersion')::bigint;
    select array_agg(value::uuid order by ordinality)
    into teammate_player_ids_value
    from jsonb_array_elements_text(payload_value -> 'teammatePlayerIds')
      with ordinality teammates(value, ordinality);
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Repeat-play event envelope contains invalid typed identifiers.'
    );
  end;

  if event_id_value <> event_row.id
    or envelope ->> 'eventType' <> 'repeat_play.requested.v2'
    or (envelope ->> 'eventVersion')::integer <> 2
    or envelope ->> 'aggregateType' <> 'repeat_play_request'
    or (envelope ->> 'aggregateId')::uuid <> request_id_value
    or (envelope ->> 'actorPlayerId')::uuid <> requester_player_id_value
    or teammate_player_ids_value is null
    or cardinality(teammate_player_ids_value) not between 1 and 4
    or not private.is_unique_uuid_array_v2(teammate_player_ids_value)
    or requester_player_id_value = any(teammate_player_ids_value) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Repeat-play event envelope does not match its authoritative payload.'
    );
  end if;

  payload_hash_value := private.command_request_hash_v1(envelope);
  select consumptions.* into existing_consumption
  from private.repeat_play_session_consumptions_v2 consumptions
  where consumptions.event_id = event_id_value
  for update;
  if existing_consumption.event_id is not null then
    if existing_consumption.payload_hash <> payload_hash_value then
      perform private.raise_core_error_v1(
        'event_replay_conflict',
        'Repeat-play eventId was replayed with different content.'
      );
    end if;
    return jsonb_set(existing_consumption.result, '{repeated}', 'true'::jsonb, true);
  end if;
  if exists (
    select 1
    from private.repeat_play_session_consumptions_v2 consumptions
    where consumptions.request_id = request_id_value
  ) then
    perform private.raise_core_error_v1(
      'event_replay_conflict',
      'Repeat-play request aggregate was emitted with a different eventId.'
    );
  end if;

  select requests.* into request_row
  from public.repeat_play_requests_v2 requests
  where requests.id = request_id_value
  for update;
  if request_row.id is null
    or request_row.version <> event_aggregate_version
    or request_row.requester_player_id <> requester_player_id_value
    or request_row.teammate_player_ids <> teammate_player_ids_value
    or request_row.status <> 'requested' then
    perform private.raise_core_error_v1(
      'aggregate_version_conflict',
      'Repeat-play source aggregate changed before Session creation.'
    );
  end if;

  participant_player_ids_value :=
    array_prepend(requester_player_id_value, teammate_player_ids_value);
  for participant_left_index in 1..cardinality(participant_player_ids_value)
  loop
    perform private.assert_party_session_player_active_v2(
      participant_player_ids_value[participant_left_index],
      true
    );
    for participant_right_index in participant_left_index + 1..
      cardinality(participant_player_ids_value)
    loop
      if participant_right_index <= cardinality(participant_player_ids_value) then
        perform private.assert_session_invite_eligible_v2(
          participant_player_ids_value[participant_left_index],
          participant_player_ids_value[participant_right_index]
        );
        perform private.assert_session_invite_eligible_v2(
          participant_player_ids_value[participant_right_index],
          participant_player_ids_value[participant_left_index]
        );
      end if;
    end loop;
  end loop;

  insert into public.play_sessions_v2 (
    owner_player_id,
    source_kind,
    source_repeat_request_id,
    title,
    capacity,
    state,
    version,
    membership_version,
    timezone
  ) values (
    requester_player_id_value,
    'repeat_play',
    request_id_value,
    'Chơi lại cùng đồng đội',
    cardinality(participant_player_ids_value),
    'recruiting',
    1,
    1,
    'UTC'
  ) returning id into session_id_value;

  insert into public.play_session_members_v2 (
    session_id,
    player_id,
    role,
    state
  ) values (
    session_id_value,
    requester_player_id_value,
    'owner',
    'active'
  );
  insert into private.play_session_conversation_projection_v2 (session_id)
  values (session_id_value);

  created_event_id_value := private.enqueue_contract_event_v2(
    'session.created.v2',
    'play_session',
    session_id_value,
    1,
    requester_player_id_value,
    correlation_id_value,
    event_id_value,
    jsonb_build_object(
      'communicationProvisioningRequired', false,
      'membership', private.play_session_membership_snapshot_v2(session_id_value),
      'session', private.play_session_snapshot_v2(session_id_value)
    ),
    format('repeat-session-created:%s', request_id_value)
  );
  event_ids_value := array_append(event_ids_value, created_event_id_value);

  foreach teammate_player_id_value in array teammate_player_ids_value
  loop
    insert into public.play_session_invites_v2 (
      session_id,
      inviter_player_id,
      target_player_id,
      state
    ) values (
      session_id_value,
      requester_player_id_value,
      teammate_player_id_value,
      'pending'
    ) returning id into invite_id_value;

    invite_event_id_value := private.enqueue_contract_event_v2(
      'session.invite_created.v2',
      'play_session',
      session_id_value,
      1,
      requester_player_id_value,
      correlation_id_value,
      created_event_id_value,
      jsonb_build_object(
        'actorPlayerId', requester_player_id_value,
        'inviteId', invite_id_value,
        'sessionId', session_id_value,
        'targetPlayerId', teammate_player_id_value
      ),
      format(
        'repeat-session-invite:%s:%s',
        request_id_value,
        teammate_player_id_value
      )
    );
    event_ids_value := array_append(event_ids_value, invite_event_id_value);
  end loop;

  receipt_value := private.play_session_command_receipt_v2(
    'create_session_from_repeat_play_v2',
    'created',
    session_id_value,
    correlation_id_value,
    event_ids_value,
    false
  );
  insert into private.repeat_play_session_consumptions_v2 (
    event_id,
    request_id,
    payload_hash,
    session_id,
    result
  ) values (
    event_id_value,
    request_id_value,
    payload_hash_value,
    session_id_value,
    receipt_value
  );

  update private.outbox_events
  set status = 'processed',
      processed_at = now(),
      last_error = null
  where id = event_id_value;
  return receipt_value;
end;
$$;

create or replace function public.consume_repeat_play_session_event_v2(
  p_event_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.consume_repeat_play_session_event_v2(p_event_id)
$$;

create or replace function public.process_pending_repeat_play_session_events_v2(
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record record;
  result_value jsonb;
  results_value jsonb := '[]'::jsonb;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  for event_record in
    select events.id
    from private.outbox_events events
    where events.event_type = 'repeat_play.requested.v2'
      and events.contract_version = 2
      and events.status in ('pending', 'failed')
      and events.available_at <= now()
    order by events.created_at, events.id
    limit safe_limit
    for update skip locked
  loop
    begin
      update private.outbox_events
      set status = 'processing',
          attempt_count = attempt_count + 1,
          last_error = null
      where id = event_record.id;

      result_value := private.consume_repeat_play_session_event_v2(
        event_record.id
      );
      results_value := results_value || jsonb_build_array(
        jsonb_build_object(
          'eventId', event_record.id,
          'processed', true,
          'receipt', result_value
        )
      );
    exception when others then
      update private.outbox_events
      set status = 'failed',
          last_error = left(sqlerrm, 2000),
          available_at = now() + make_interval(
            secs => least(3600, greatest(5, attempt_count * attempt_count * 5))
          )
      where id = event_record.id;
      results_value := results_value || jsonb_build_array(
        jsonb_build_object(
          'eventId', event_record.id,
          'error', sqlerrm,
          'processed', false
        )
      );
    end;
  end loop;
  return results_value;
end;
$$;

revoke execute on function private.consume_repeat_play_session_event_v2(uuid)
  from public, anon, authenticated;
revoke execute on function public.consume_repeat_play_session_event_v2(uuid)
  from public, anon, authenticated;
revoke execute on function public.process_pending_repeat_play_session_events_v2(integer)
  from public, anon, authenticated;
grant execute on function public.consume_repeat_play_session_event_v2(uuid)
  to service_role;
grant execute on function public.process_pending_repeat_play_session_events_v2(integer)
  to service_role;
