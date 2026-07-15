-- Party/Session wall-clock action timestamp correction
--
-- PostgreSQL now() is transaction-scoped. Server-side composition and rollback-only
-- runtime tests can start and complete a Session in one transaction, so the original
-- functions could emit completedAt = startedAt and violate the Trust consumer contract.
-- Use wall-clock time and enforce a minimum one-microsecond completion ordering.

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
      started_at = clock_timestamp(),
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
          completed_at = greatest(
            clock_timestamp(),
            session_row.started_at + interval '1 microsecond'
          ),
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
