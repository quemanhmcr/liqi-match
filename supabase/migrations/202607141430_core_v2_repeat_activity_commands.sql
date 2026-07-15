-- Core V2 Mission 4: repeat teammate projection and repeat-session request authority.

create or replace function private.sort_uuid_array_v2(p_values uuid[])
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(values.value order by values.value), '{}'::uuid[])
  from unnest(coalesce(p_values, '{}'::uuid[])) as values(value);
$$;

create or replace function private.repeat_teammate_relationship_snapshot_v2(
  p_relationship_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'relationshipId', relationships.id,
    'playerLowId', relationships.player_low_id,
    'playerHighId', relationships.player_high_id,
    'completedSessionCount', relationships.completed_session_count,
    'firstCompletedAt', relationships.first_completed_at,
    'lastCompletedAt', relationships.last_completed_at,
    'version', relationships.version
  )
  from public.repeat_teammate_relationships_v2 relationships
  where relationships.id = p_relationship_id;
$$;

create or replace function private.repeat_play_request_snapshot_v2(
  p_request_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'requestId', requests.id,
    'requesterPlayerId', requests.requester_player_id,
    'teammatePlayerIds', requests.teammate_player_ids,
    'status', requests.status,
    'version', requests.version,
    'createdAt', requests.created_at,
    'updatedAt', requests.updated_at
  )
  from public.repeat_play_requests_v2 requests
  where requests.id = p_request_id;
$$;

create or replace function private.engagement_preferences_snapshot_for_update_v2(
  p_player_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.engagement_preferences_snapshot_v2(p_player_id);
$$;

create unique index if not exists repeat_play_requests_v2_active_unique
  on public.repeat_play_requests_v2 (
    requester_player_id,
    teammate_player_ids
  )
  where status = 'requested';

create or replace function private.derive_repeat_teammates_v2(
  p_outcome_id uuid,
  p_actor_player_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_outcome public.session_outcomes_v2;
  config_row private.trust_authority_config_v2;
  relationship_row public.repeat_teammate_relationships_v2;
  left_player record;
  right_player record;
  recommendation_player_id uuid;
  teammate_player_id uuid;
  player_low_id_value uuid;
  player_high_id_value uuid;
  confirmed_session_count_value bigint;
  first_completed_at_value timestamptz;
  last_completed_at_value timestamptz;
  formed_value boolean;
  changed_value boolean;
  social_snapshot_value jsonb;
  blocked_value boolean;
  can_invite_value boolean;
  preference_row public.engagement_preferences_v2;
  projection_value jsonb;
  progress_event_ids_value jsonb;
  activity_result_value jsonb;
  formed_event_id_value uuid;
  event_ids_value jsonb := '[]'::jsonb;
begin
  if p_outcome_id is null
    or p_correlation_id is null
    or p_causation_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'outcomeId, correlationId and causationId are required for repeat derivation.'
    );
  end if;

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.repeat_play_enabled, false) then
    return event_ids_value;
  end if;

  select outcomes.* into source_outcome
  from public.session_outcomes_v2 outcomes
  where outcomes.id = p_outcome_id;
  if source_outcome.id is null
    or source_outcome.state <> 'recorded'
    or not private.outcome_all_participation_confirmed_v2(source_outcome.id) then
    return event_ids_value;
  end if;

  for left_player in
    select participants.player_id, participants.position
    from unnest(source_outcome.participant_player_ids) with ordinality
      as participants(player_id, position)
  loop
    for right_player in
      select participants.player_id, participants.position
      from unnest(source_outcome.participant_player_ids) with ordinality
        as participants(player_id, position)
      where participants.position > left_player.position
    loop
      player_low_id_value := least(left_player.player_id, right_player.player_id);
      player_high_id_value := greatest(left_player.player_id, right_player.player_id);

      select count(*), min(candidate.completed_at), max(candidate.completed_at)
      into
        confirmed_session_count_value,
        first_completed_at_value,
        last_completed_at_value
      from public.session_outcomes_v2 candidate
      where candidate.state = 'recorded'
        and player_low_id_value = any(candidate.participant_player_ids)
        and player_high_id_value = any(candidate.participant_player_ids)
        and private.outcome_all_participation_confirmed_v2(candidate.id);

      if confirmed_session_count_value < 1 then
        continue;
      end if;

      relationship_row := null;
      formed_value := false;
      changed_value := true;
      if confirmed_session_count_value >= 2 then
        insert into public.repeat_teammate_relationships_v2 (
        player_low_id,
        player_high_id,
        completed_session_count,
        first_completed_at,
        last_completed_at
      ) values (
        player_low_id_value,
        player_high_id_value,
        confirmed_session_count_value,
        first_completed_at_value,
        last_completed_at_value
      )
      on conflict (player_low_id, player_high_id) do nothing
        returning * into relationship_row;
        formed_value := relationship_row.id is not null;

        if not formed_value then
        select relationships.* into relationship_row
        from public.repeat_teammate_relationships_v2 relationships
        where relationships.player_low_id = player_low_id_value
          and relationships.player_high_id = player_high_id_value
        for update;

        if relationship_row.completed_session_count
            is distinct from confirmed_session_count_value
          or relationship_row.first_completed_at
            is distinct from first_completed_at_value
          or relationship_row.last_completed_at
            is distinct from last_completed_at_value then
          update public.repeat_teammate_relationships_v2 relationships
          set completed_session_count = confirmed_session_count_value,
              first_completed_at = first_completed_at_value,
              last_completed_at = last_completed_at_value,
              version = relationships.version + 1,
              updated_at = now()
          where relationships.id = relationship_row.id
          returning * into relationship_row;
          changed_value := true;
          end if;
        end if;
      end if;

      if formed_value then
        formed_event_id_value := private.enqueue_contract_event_v2(
          'repeat_teammate.formed.v2',
          'repeat_teammate',
          relationship_row.id,
          relationship_row.version,
          p_actor_player_id,
          p_correlation_id,
          p_causation_id,
          jsonb_build_object(
            'relationshipId', relationship_row.id,
            'playerLowId', relationship_row.player_low_id,
            'playerHighId', relationship_row.player_high_id,
            'completedSessionCount', relationship_row.completed_session_count
          ),
          format('repeat-teammate-formed:%s', relationship_row.id)
        );
        event_ids_value := event_ids_value || jsonb_build_array(
          formed_event_id_value
        );

        foreach recommendation_player_id in array array[
          player_low_id_value,
          player_high_id_value
        ]::uuid[]
        loop
          perform private.append_reputation_ledger_entry_v2(
            recommendation_player_id,
            'repeat_teammate_count',
            1,
            'repeat_teammate',
            relationship_row.id,
            format(
              'repeat:%s:%s',
              relationship_row.id,
              recommendation_player_id
            ),
            jsonb_build_object(
              'relationshipId', relationship_row.id,
              'teammatePlayerId', case
                when recommendation_player_id = relationship_row.player_low_id
                  then relationship_row.player_high_id
                else relationship_row.player_low_id
              end
            )
          );
          projection_value := private.player_trust_projection_snapshot_v2(
            recommendation_player_id
          );
          progress_event_ids_value := private.emit_reputation_progress_v2(
            recommendation_player_id,
            source_outcome.session_id,
            projection_value,
            p_actor_player_id,
            p_correlation_id,
            formed_event_id_value,
            format(
              'reputation:repeat:%s:%s',
              relationship_row.id,
              recommendation_player_id
            )
          );
          event_ids_value := event_ids_value || progress_event_ids_value;
        end loop;
      end if;

      if changed_value then
        foreach recommendation_player_id in array array[
          player_low_id_value,
          player_high_id_value
        ]::uuid[]
        loop
          teammate_player_id := case
            when recommendation_player_id = player_low_id_value
              then player_high_id_value
            else player_low_id_value
          end;
          social_snapshot_value := null;
          begin
            social_snapshot_value := private.social_relationship_snapshot_v2(
              recommendation_player_id,
              teammate_player_id
            );
          exception when others then
            social_snapshot_value := null;
          end;
          blocked_value := coalesce(
            (social_snapshot_value #>> '{capabilities,blocked}')::boolean,
            true
          );
          can_invite_value := coalesce(
            (social_snapshot_value #>> '{capabilities,canInviteToSession}')::boolean,
            false
          );
          if blocked_value or not can_invite_value then
            continue;
          end if;

          select preferences.* into preference_row
          from public.engagement_preferences_v2 preferences
          where preferences.player_id = recommendation_player_id;
          if not coalesce(config_row.activity_enabled, false)
            or not coalesce(preference_row.activity_enabled, true)
            or not coalesce(preference_row.repeat_play_prompts_enabled, true) then
            continue;
          end if;

          update public.activity_items_v2 activity
          set dismissed_at = coalesce(activity.dismissed_at, now()),
              version = activity.version + 1,
              updated_at = now()
          where activity.player_id = recommendation_player_id
            and activity.kind = 'repeat_play_recommendation'
            and activity.dismissed_at is null
            and activity.payload -> 'teammatePlayerIds'
              = jsonb_build_array(teammate_player_id);

          activity_result_value := private.create_activity_item_with_events_v2(
            recommendation_player_id,
            'repeat_play_recommendation',
            jsonb_build_object(
              'relationshipId', relationship_row.id,
              'completedSessionCount', confirmed_session_count_value,
              'sourceSessionId', source_outcome.session_id,
              'teammatePlayerIds', jsonb_build_array(teammate_player_id)
            ),
            800,
            format(
              'repeat-candidate:%s:%s:%s:%s',
              player_low_id_value,
              player_high_id_value,
              recommendation_player_id,
              confirmed_session_count_value
            ),
            p_actor_player_id,
            p_correlation_id,
            coalesce(formed_event_id_value, p_causation_id)
          );
          if activity_result_value ->> 'activityEventId' is not null then
            event_ids_value := event_ids_value || jsonb_build_array(
              (activity_result_value ->> 'activityEventId')::uuid
            );
          end if;
          if activity_result_value ->> 'notificationRequestEventId' is not null then
            event_ids_value := event_ids_value || jsonb_build_array(
              (activity_result_value ->> 'notificationRequestEventId')::uuid
            );
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  return event_ids_value;
end;
$$;

create or replace function public.request_repeat_session_v2(
  p_teammate_player_ids uuid[],
  p_relationship_versions jsonb,
  p_expected_version bigint,
  p_audit jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name_value constant text := 'request_repeat_session_v2';
  command_time_value timestamptz := now();
  actor_context jsonb;
  actor_account_id_value uuid;
  actor_player_id_value uuid;
  audit_value jsonb;
  normalized_teammate_ids uuid[];
  relationship_version_player_ids uuid[];
  normalized_relationship_versions jsonb;
  relationship_version_value jsonb;
  expected_relationship_version_value bigint;
  request_hash_value text;
  command_state record;
  config_row private.trust_authority_config_v2;
  target_lifecycle jsonb;
  social_snapshot_value jsonb;
  blocked_value boolean;
  can_invite_value boolean;
  relationship_row public.repeat_teammate_relationships_v2;
  request_row public.repeat_play_requests_v2;
  request_event_id_value uuid;
  receipt_value jsonb;
  teammate_player_id_value uuid;
begin
  if p_expected_version is null
    or p_expected_version <> 0
    or p_teammate_player_ids is null
    or cardinality(p_teammate_player_ids) not between 1 and 4
    or not private.is_unique_uuid_array_v2(p_teammate_player_ids)
    or p_relationship_versions is null
    or jsonb_typeof(p_relationship_versions) <> 'array'
    or jsonb_array_length(p_relationship_versions)
      <> cardinality(p_teammate_player_ids)
    or p_idempotency_key is null
    or p_correlation_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Repeat request requires create expectedVersion zero, 1-4 unique teammates, exact relationshipVersions, idempotencyKey and correlationId.'
    );
  end if;

  normalized_teammate_ids := private.sort_uuid_array_v2(p_teammate_player_ids);
  relationship_version_player_ids := '{}'::uuid[];
  for relationship_version_value in
    select values.value
    from jsonb_array_elements(p_relationship_versions) as values(value)
  loop
    if jsonb_typeof(relationship_version_value) <> 'object'
      or not private.jsonb_has_exact_keys_v2(
        relationship_version_value,
        array['teammatePlayerId', 'version']
      )
      or coalesce(relationship_version_value ->> 'version', '') !~ '^(0|[1-9][0-9]*)$' then
      perform private.raise_core_error_v1(
        'validation_failed',
        'Each relationshipVersions item must contain exactly teammatePlayerId and a non-negative version.'
      );
    end if;
    teammate_player_id_value := private.require_contract_uuid_v2(
      relationship_version_value ->> 'teammatePlayerId',
      'relationshipVersions.teammatePlayerId'
    );
    relationship_version_player_ids := array_append(
      relationship_version_player_ids,
      teammate_player_id_value
    );
  end loop;
  relationship_version_player_ids := private.sort_uuid_array_v2(
    relationship_version_player_ids
  );
  if relationship_version_player_ids is distinct from normalized_teammate_ids
    or not private.is_unique_uuid_array_v2(relationship_version_player_ids) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'relationshipVersions must cover exactly the requested teammates.'
    );
  end if;
  select jsonb_agg(values.value order by values.value ->> 'teammatePlayerId')
  into normalized_relationship_versions
  from jsonb_array_elements(p_relationship_versions) as values(value);

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.writes_enabled, false)
    or not coalesce(config_row.repeat_play_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 repeat-play requests are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_trust_actor_v2(true, true);
  actor_account_id_value := (actor_context ->> 'accountId')::uuid;
  actor_player_id_value := (actor_context ->> 'playerId')::uuid;
  if actor_player_id_value = any(normalized_teammate_ids) then
    perform private.raise_core_error_v1(
      'self_repeat_forbidden',
      'The requester cannot be included as a repeat teammate.'
    );
  end if;
  audit_value := private.validate_command_audit_v2(p_audit);
  request_hash_value := private.command_request_hash_v1(jsonb_build_object(
    'teammatePlayerIds', normalized_teammate_ids,
    'relationshipVersions', normalized_relationship_versions,
    'expectedVersion', p_expected_version,
    'audit', audit_value,
    'idempotencyKey', p_idempotency_key,
    'correlationId', p_correlation_id
  ));
  select * into command_state
  from private.begin_command_v1(
    command_name_value,
    actor_account_id_value,
    p_idempotency_key,
    request_hash_value
  );
  if command_state.repeated then
    return jsonb_set(
      coalesce(command_state.response, '{}'::jsonb),
      '{repeated}',
      'true'::jsonb,
      true
    );
  end if;

  foreach teammate_player_id_value in array normalized_teammate_ids
  loop
    target_lifecycle := public.get_player_lifecycle_snapshot_v1(
      teammate_player_id_value,
      true
    );
    if target_lifecycle is null
      or target_lifecycle ->> 'state' <> 'active' then
      perform private.raise_core_error_v1(
        'repeat_target_not_active',
        'Every repeat teammate must have an active canonical lifecycle.'
      );
    end if;

    social_snapshot_value := private.social_relationship_snapshot_v2(
      actor_player_id_value,
      teammate_player_id_value
    );
    blocked_value := coalesce(
      (social_snapshot_value #>> '{capabilities,blocked}')::boolean,
      true
    );
    can_invite_value := coalesce(
      (social_snapshot_value #>> '{capabilities,canInviteToSession}')::boolean,
      false
    );
    if blocked_value then
      perform private.raise_core_error_v1(
        'repeat_play_blocked',
        'A blocked player cannot be included in repeat play.'
      );
    end if;
    if not can_invite_value then
      perform private.raise_core_error_v1(
        'repeat_play_not_allowed',
        'Social privacy does not allow a session invitation.'
      );
    end if;

    select (versions.value ->> 'version')::bigint
    into expected_relationship_version_value
    from jsonb_array_elements(normalized_relationship_versions) as versions(value)
    where versions.value ->> 'teammatePlayerId' = teammate_player_id_value::text;

    relationship_row := null;
    select relationships.* into relationship_row
    from public.repeat_teammate_relationships_v2 relationships
    where relationships.player_low_id = least(
        actor_player_id_value,
        teammate_player_id_value
      )
      and relationships.player_high_id = greatest(
        actor_player_id_value,
        teammate_player_id_value
      )
    for update;
    if relationship_row.id is null then
      if expected_relationship_version_value <> 0 then
        perform private.raise_core_error_v1(
          'aggregate_version_conflict',
          'No repeat-teammate aggregate exists at the requested version.',
          false,
          jsonb_build_object(
            'teammatePlayerId', teammate_player_id_value,
            'expectedVersion', expected_relationship_version_value,
            'actualVersion', 0
          )
        );
      end if;
      if not exists (
        select 1
        from public.session_outcomes_v2 outcomes
        where outcomes.state = 'recorded'
          and actor_player_id_value = any(outcomes.participant_player_ids)
          and teammate_player_id_value = any(outcomes.participant_player_ids)
          and private.outcome_all_participation_confirmed_v2(outcomes.id)
      ) then
        perform private.raise_core_error_v1(
          'repeat_play_history_required',
          'Repeat play requires at least one fully confirmed shared session.'
        );
      end if;
    elsif relationship_row.version <> expected_relationship_version_value then
      perform private.raise_core_error_v1(
        'aggregate_version_conflict',
        'The repeat-teammate relationship changed before request creation.',
        false,
        jsonb_build_object(
          'teammatePlayerId', teammate_player_id_value,
          'expectedVersion', expected_relationship_version_value,
          'actualVersion', relationship_row.version
        )
      );
    end if;
  end loop;

  if exists (
    select 1
    from public.repeat_play_requests_v2 requests
    where requests.requester_player_id = actor_player_id_value
      and requests.teammate_player_ids = normalized_teammate_ids
      and requests.status = 'requested'
  ) then
    perform private.raise_core_error_v1(
      'repeat_request_already_active',
      'An active repeat-session request already exists for this teammate set.'
    );
  end if;

  insert into public.repeat_play_requests_v2 (
    requester_player_id,
    teammate_player_ids,
    audit_metadata,
    created_at,
    updated_at
  ) values (
    actor_player_id_value,
    normalized_teammate_ids,
    audit_value || jsonb_build_object(
      'actorPlayerId', actor_player_id_value,
      'correlationId', p_correlation_id,
      'idempotencyKey', p_idempotency_key,
      'relationshipVersions', normalized_relationship_versions
    ),
    command_time_value,
    command_time_value
  )
  returning * into request_row;

  request_event_id_value := private.enqueue_contract_event_v2(
    'repeat_play.requested.v2',
    'repeat_play_request',
    request_row.id,
    request_row.version,
    actor_player_id_value,
    p_correlation_id,
    null,
    jsonb_build_object(
      'requestId', request_row.id,
      'requesterPlayerId', request_row.requester_player_id,
      'teammatePlayerIds', request_row.teammate_player_ids
    ),
    format('repeat-play-requested:%s:%s', request_row.id, request_row.version)
  );
  receipt_value := jsonb_build_object(
    'aggregateId', request_row.id,
    'aggregateType', 'repeat_play_request',
    'aggregateVersion', request_row.version,
    'commandName', command_name_value,
    'correlationId', p_correlation_id,
    'eventIds', jsonb_build_array(request_event_id_value),
    'occurredAt', command_time_value,
    'repeated', false,
    'resultCode', 'repeat_session_requested',
    'requestId', request_row.id,
    'teammatePlayerIds', request_row.teammate_player_ids
  );
  perform private.finish_command_v1(
    command_name_value,
    actor_account_id_value,
    p_idempotency_key,
    receipt_value
  );
  return receipt_value;
end;
$$;

-- Extend the confirmed-participation command with deterministic repeat derivation.
create or replace function public.confirm_session_participation_v2(
  p_session_id uuid,
  p_expected_version bigint,
  p_audit jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name_value constant text := 'confirm_session_participation_v2';
  command_time_value timestamptz := now();
  actor_context jsonb;
  actor_player_id_value uuid;
  receipt_account_id_value uuid;
  audit_value jsonb;
  request_hash_value text;
  command_state record;
  config_row private.trust_authority_config_v2;
  outcome_row public.session_outcomes_v2;
  confirmation_row public.session_participation_confirmations_v2;
  participant_confirmation_row public.session_participation_confirmations_v2;
  outcome_snapshot_value jsonb;
  confirmation_snapshot_value jsonb;
  participation_event_id_value uuid;
  projection_value jsonb;
  progress_event_ids_value jsonb;
  repeat_event_ids_value jsonb;
  event_ids_value jsonb := '[]'::jsonb;
  receipt_value jsonb;
  participant_player_id_value uuid;
begin
  if p_session_id is null
    or p_idempotency_key is null
    or p_correlation_id is null
    or p_expected_version is null
    or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'sessionId, positive expectedVersion, idempotencyKey and correlationId are required.'
    );
  end if;

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.writes_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 trust writes are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_trust_actor_v2(true, true);
  actor_player_id_value := (actor_context ->> 'playerId')::uuid;
  receipt_account_id_value := (actor_context ->> 'accountId')::uuid;
  audit_value := private.validate_command_audit_v2(p_audit);
  request_hash_value := private.command_request_hash_v1(jsonb_build_object(
    'sessionId', p_session_id,
    'expectedVersion', p_expected_version,
    'audit', audit_value,
    'idempotencyKey', p_idempotency_key,
    'correlationId', p_correlation_id
  ));
  select * into command_state
  from private.begin_command_v1(
    command_name_value,
    receipt_account_id_value,
    p_idempotency_key,
    request_hash_value
  );
  if command_state.repeated then
    return jsonb_set(
      coalesce(command_state.response, '{}'::jsonb),
      '{repeated}',
      'true'::jsonb,
      true
    );
  end if;

  select outcomes.* into outcome_row
  from public.session_outcomes_v2 outcomes
  where outcomes.session_id = p_session_id
  for update;
  if outcome_row.id is null then
    perform private.raise_core_error_v1(
      'session_outcome_not_found',
      'The completed-session outcome is unavailable.'
    );
  end if;
  if outcome_row.state = 'disputed' then
    perform private.raise_core_error_v1(
      'session_outcome_disputed',
      'Participation cannot be positively confirmed after a dispute.'
    );
  end if;
  if not actor_player_id_value = any(outcome_row.participant_player_ids) then
    perform private.raise_core_error_v1(
      'trust_forbidden',
      'Only a completed-session participant can confirm participation.'
    );
  end if;
  if outcome_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'aggregate_version_conflict',
      'The session outcome changed before participation confirmation.',
      false,
      jsonb_build_object(
        'expectedVersion', p_expected_version,
        'actualVersion', outcome_row.version
      )
    );
  end if;
  if exists (
    select 1
    from public.session_participation_confirmations_v2 confirmations
    where confirmations.outcome_id = outcome_row.id
      and confirmations.player_id = actor_player_id_value
  ) then
    perform private.raise_core_error_v1(
      'participation_already_recorded',
      'Participation has already been recorded for this player and session.'
    );
  end if;

  insert into public.session_participation_confirmations_v2 (
    outcome_id,
    session_id,
    player_id,
    status,
    reason_code,
    dispute_note,
    audit_metadata,
    confirmed_at
  ) values (
    outcome_row.id,
    outcome_row.session_id,
    actor_player_id_value,
    'confirmed',
    null,
    null,
    audit_value || jsonb_build_object(
      'actorPlayerId', actor_player_id_value,
      'commandName', command_name_value,
      'correlationId', p_correlation_id,
      'idempotencyKey', p_idempotency_key
    ),
    command_time_value
  )
  returning * into confirmation_row;

  update public.session_outcomes_v2 outcomes
  set version = outcomes.version + 1,
      updated_at = command_time_value
  where outcomes.id = outcome_row.id
  returning * into outcome_row;

  confirmation_snapshot_value :=
    private.participation_confirmation_snapshot_v2(confirmation_row.id);
  participation_event_id_value := private.enqueue_contract_event_v2(
    'session.participation_confirmed.v2',
    'session_outcome',
    outcome_row.id,
    outcome_row.version,
    actor_player_id_value,
    p_correlation_id,
    null,
    jsonb_build_object('confirmation', confirmation_snapshot_value),
    format(
      'session-participation-confirmed:%s:%s',
      confirmation_row.id,
      confirmation_row.version
    )
  );
  event_ids_value := event_ids_value || jsonb_build_array(
    participation_event_id_value
  );

  if private.outcome_all_participation_confirmed_v2(outcome_row.id) then
    foreach participant_player_id_value in array outcome_row.participant_player_ids
    loop
      select confirmations.* into participant_confirmation_row
      from public.session_participation_confirmations_v2 confirmations
      where confirmations.outcome_id = outcome_row.id
        and confirmations.player_id = participant_player_id_value
        and confirmations.status = 'confirmed';

      perform private.append_reputation_ledger_entry_v2(
        participant_player_id_value,
        'completed_sessions',
        1,
        'participation_confirmation',
        participant_confirmation_row.id,
        format(
          'participation:%s:completed',
          participant_confirmation_row.id
        ),
        jsonb_build_object(
          'sessionId', outcome_row.session_id,
          'outcomeId', outcome_row.id
        )
      );
      projection_value := private.player_trust_projection_snapshot_v2(
        participant_player_id_value
      );
      progress_event_ids_value := private.emit_reputation_progress_v2(
        participant_player_id_value,
        outcome_row.session_id,
        projection_value,
        actor_player_id_value,
        p_correlation_id,
        participation_event_id_value,
        format(
          'reputation:session:%s:%s:%s',
          outcome_row.session_id,
          participant_player_id_value,
          projection_value ->> 'projectionVersion'
        )
      );
      event_ids_value := event_ids_value || progress_event_ids_value;
    end loop;

    repeat_event_ids_value := private.derive_repeat_teammates_v2(
      outcome_row.id,
      actor_player_id_value,
      p_correlation_id,
      participation_event_id_value
    );
    event_ids_value := event_ids_value || repeat_event_ids_value;
  end if;

  outcome_snapshot_value := private.session_outcome_snapshot_v2(outcome_row.id);
  receipt_value := jsonb_build_object(
    'aggregateId', outcome_row.id,
    'aggregateType', 'session_outcome',
    'aggregateVersion', outcome_row.version,
    'commandName', command_name_value,
    'correlationId', p_correlation_id,
    'eventIds', event_ids_value,
    'occurredAt', command_time_value,
    'repeated', false,
    'resultCode', 'participation_confirmed',
    'confirmation', confirmation_snapshot_value,
    'outcome', outcome_snapshot_value
  );
  perform private.finish_command_v1(
    command_name_value,
    receipt_account_id_value,
    p_idempotency_key,
    receipt_value
  );
  return receipt_value;
end;
$$;

create or replace function public.dismiss_activity_item_v2(
  p_activity_item_id uuid,
  p_expected_version bigint,
  p_audit jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name_value constant text := 'dismiss_activity_item_v2';
  command_time_value timestamptz := now();
  actor_context jsonb;
  actor_player_id_value uuid;
  receipt_account_id_value uuid;
  audit_value jsonb;
  request_hash_value text;
  command_state record;
  config_row private.trust_authority_config_v2;
  activity_row public.activity_items_v2;
  activity_snapshot_value jsonb;
  activity_event_id_value uuid;
  receipt_value jsonb;
begin
  if p_activity_item_id is null
    or p_expected_version is null
    or p_expected_version <= 0
    or p_idempotency_key is null
    or p_correlation_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'activityItemId, positive expectedVersion, idempotencyKey and correlationId are required.'
    );
  end if;

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.writes_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 trust writes are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_trust_actor_v2(true, true);
  actor_player_id_value := (actor_context ->> 'playerId')::uuid;
  receipt_account_id_value := (actor_context ->> 'accountId')::uuid;
  audit_value := private.validate_command_audit_v2(p_audit);
  request_hash_value := private.command_request_hash_v1(jsonb_build_object(
    'activityItemId', p_activity_item_id,
    'expectedVersion', p_expected_version,
    'audit', audit_value,
    'idempotencyKey', p_idempotency_key,
    'correlationId', p_correlation_id
  ));
  select * into command_state
  from private.begin_command_v1(
    command_name_value,
    receipt_account_id_value,
    p_idempotency_key,
    request_hash_value
  );
  if command_state.repeated then
    return jsonb_set(
      coalesce(command_state.response, '{}'::jsonb),
      '{repeated}',
      'true'::jsonb,
      true
    );
  end if;

  select items.* into activity_row
  from public.activity_items_v2 items
  where items.id = p_activity_item_id
  for update;
  if activity_row.id is null then
    perform private.raise_core_error_v1(
      'activity_item_not_found',
      'The activity item does not exist.'
    );
  end if;
  if activity_row.player_id <> actor_player_id_value then
    perform private.raise_core_error_v1(
      'trust_forbidden',
      'Only the activity owner can dismiss this item.'
    );
  end if;
  if activity_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'aggregate_version_conflict',
      'The activity item changed before dismissal.',
      false,
      jsonb_build_object(
        'expectedVersion', p_expected_version,
        'actualVersion', activity_row.version
      )
    );
  end if;
  if activity_row.dismissed_at is not null then
    perform private.raise_core_error_v1(
      'activity_item_already_dismissed',
      'The activity item has already been dismissed.'
    );
  end if;

  update public.activity_items_v2 items
  set dismissed_at = command_time_value,
      version = items.version + 1,
      updated_at = command_time_value
  where items.id = activity_row.id
  returning * into activity_row;

  activity_snapshot_value := private.activity_item_snapshot_v2(activity_row.id);
  activity_event_id_value := private.enqueue_contract_event_v2(
    'activity.item_dismissed.v2',
    'activity_item',
    activity_row.id,
    activity_row.version,
    actor_player_id_value,
    p_correlation_id,
    null,
    jsonb_build_object('activityItem', activity_snapshot_value),
    format('activity-item-dismissed:%s:%s', activity_row.id, activity_row.version)
  );
  receipt_value := jsonb_build_object(
    'aggregateId', activity_row.id,
    'aggregateType', 'activity_item',
    'aggregateVersion', activity_row.version,
    'commandName', command_name_value,
    'correlationId', p_correlation_id,
    'eventIds', jsonb_build_array(activity_event_id_value),
    'occurredAt', command_time_value,
    'repeated', false,
    'resultCode', 'activity_item_dismissed',
    'activityItem', activity_snapshot_value
  );
  perform private.finish_command_v1(
    command_name_value,
    receipt_account_id_value,
    p_idempotency_key,
    receipt_value
  );
  return receipt_value;
end;
$$;

create or replace function public.update_engagement_preferences_v2(
  p_preferences jsonb,
  p_expected_version bigint,
  p_audit jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name_value constant text := 'update_engagement_preferences_v2';
  command_time_value timestamptz := now();
  actor_context jsonb;
  actor_player_id_value uuid;
  receipt_account_id_value uuid;
  audit_value jsonb;
  request_hash_value text;
  command_state record;
  config_row private.trust_authority_config_v2;
  preference_row public.engagement_preferences_v2;
  preference_snapshot_value jsonb;
  preference_event_id_value uuid;
  receipt_value jsonb;
begin
  if p_preferences is null
    or jsonb_typeof(p_preferences) <> 'object'
    or not private.jsonb_has_exact_keys_v2(
      p_preferences,
      array[
        'activityEnabled',
        'feedbackPromptsEnabled',
        'maxReactivationNotificationsPerDay',
        'pushReactivationEnabled',
        'repeatPlayPromptsEnabled'
      ]
    )
    or jsonb_typeof(p_preferences -> 'activityEnabled') <> 'boolean'
    or jsonb_typeof(p_preferences -> 'feedbackPromptsEnabled') <> 'boolean'
    or jsonb_typeof(p_preferences -> 'pushReactivationEnabled') <> 'boolean'
    or jsonb_typeof(p_preferences -> 'repeatPlayPromptsEnabled') <> 'boolean'
    or coalesce(
      p_preferences ->> 'maxReactivationNotificationsPerDay',
      ''
    ) !~ '^[0-9]+$'
    or (p_preferences ->> 'maxReactivationNotificationsPerDay')::integer
      not between 0 and 4
    or p_expected_version is null
    or p_expected_version <= 0
    or p_idempotency_key is null
    or p_correlation_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Exact engagement preferences, positive expectedVersion, idempotencyKey and correlationId are required.'
    );
  end if;

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.writes_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 trust writes are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_trust_actor_v2(true, true);
  actor_player_id_value := (actor_context ->> 'playerId')::uuid;
  receipt_account_id_value := (actor_context ->> 'accountId')::uuid;
  audit_value := private.validate_command_audit_v2(p_audit);
  request_hash_value := private.command_request_hash_v1(jsonb_build_object(
    'preferences', p_preferences,
    'expectedVersion', p_expected_version,
    'audit', audit_value,
    'idempotencyKey', p_idempotency_key,
    'correlationId', p_correlation_id
  ));
  select * into command_state
  from private.begin_command_v1(
    command_name_value,
    receipt_account_id_value,
    p_idempotency_key,
    request_hash_value
  );
  if command_state.repeated then
    return jsonb_set(
      coalesce(command_state.response, '{}'::jsonb),
      '{repeated}',
      'true'::jsonb,
      true
    );
  end if;

  select preferences.* into preference_row
  from public.engagement_preferences_v2 preferences
  where preferences.player_id = actor_player_id_value
  for update;
  if preference_row.player_id is null then
    perform private.raise_core_error_v1(
      'engagement_preferences_not_found',
      'The actor has no engagement preferences.'
    );
  end if;
  if preference_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'aggregate_version_conflict',
      'Engagement preferences changed before update.',
      false,
      jsonb_build_object(
        'expectedVersion', p_expected_version,
        'actualVersion', preference_row.version
      )
    );
  end if;

  update public.engagement_preferences_v2 preferences
  set activity_enabled = (p_preferences ->> 'activityEnabled')::boolean,
      feedback_prompts_enabled =
        (p_preferences ->> 'feedbackPromptsEnabled')::boolean,
      repeat_play_prompts_enabled =
        (p_preferences ->> 'repeatPlayPromptsEnabled')::boolean,
      push_reactivation_enabled =
        (p_preferences ->> 'pushReactivationEnabled')::boolean,
      max_reactivation_notifications_per_day =
        (p_preferences ->> 'maxReactivationNotificationsPerDay')::smallint,
      version = preferences.version + 1,
      updated_at = command_time_value
  where preferences.player_id = actor_player_id_value
  returning * into preference_row;

  preference_snapshot_value :=
    private.engagement_preferences_snapshot_for_update_v2(actor_player_id_value);
  preference_event_id_value := private.enqueue_contract_event_v2(
    'engagement.preferences_updated.v2',
    'engagement_preferences',
    actor_player_id_value,
    preference_row.version,
    actor_player_id_value,
    p_correlation_id,
    null,
    jsonb_build_object('preferences', preference_snapshot_value),
    format(
      'engagement-preferences-updated:%s:%s',
      actor_player_id_value,
      preference_row.version
    )
  );
  receipt_value := jsonb_build_object(
    'aggregateId', actor_player_id_value,
    'aggregateType', 'engagement_preferences',
    'aggregateVersion', preference_row.version,
    'commandName', command_name_value,
    'correlationId', p_correlation_id,
    'eventIds', jsonb_build_array(preference_event_id_value),
    'occurredAt', command_time_value,
    'repeated', false,
    'resultCode', 'engagement_preferences_updated',
    'preferences', preference_snapshot_value
  );
  perform private.finish_command_v1(
    command_name_value,
    receipt_account_id_value,
    p_idempotency_key,
    receipt_value
  );
  return receipt_value;
end;
$$;

create or replace function public.rebuild_reputation_projection_v2(
  p_player_id uuid,
  p_expected_version bigint,
  p_audit jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name_value constant text := 'rebuild_reputation_projection_v2';
  command_time_value timestamptz := now();
  receipt_account_id_value uuid;
  audit_value jsonb;
  request_hash_value text;
  command_state record;
  config_row private.trust_authority_config_v2;
  projection_row public.player_reputation_projection_v2;
  projection_value jsonb;
  reputation_event_id_value uuid;
  receipt_value jsonb;
begin
  if auth.role() <> 'service_role' then
    perform private.raise_core_error_v1(
      'trust_forbidden',
      'Only the privileged rebuild worker can rebuild reputation projections.'
    );
  end if;
  if p_player_id is null
    or p_expected_version is null
    or p_expected_version < 0
    or p_idempotency_key is null
    or p_correlation_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'playerId, non-negative expectedVersion, idempotencyKey and correlationId are required.'
    );
  end if;

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.writes_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 trust writes are disabled.',
      true
    );
  end if;
  select players.account_id
  into receipt_account_id_value
  from public.players players
  where players.id = p_player_id;
  if receipt_account_id_value is null then
    perform private.raise_core_error_v1(
      'trust_player_not_found',
      'The reputation projection target does not exist.'
    );
  end if;

  audit_value := private.validate_command_audit_v2(p_audit);
  request_hash_value := private.command_request_hash_v1(jsonb_build_object(
    'playerId', p_player_id,
    'expectedVersion', p_expected_version,
    'audit', audit_value,
    'idempotencyKey', p_idempotency_key,
    'correlationId', p_correlation_id
  ));
  select * into command_state
  from private.begin_command_v1(
    command_name_value,
    receipt_account_id_value,
    p_idempotency_key,
    request_hash_value
  );
  if command_state.repeated then
    return jsonb_set(
      coalesce(command_state.response, '{}'::jsonb),
      '{repeated}',
      'true'::jsonb,
      true
    );
  end if;

  select projections.* into projection_row
  from public.player_reputation_projection_v2 projections
  where projections.player_id = p_player_id
  for update;
  if projection_row.player_id is null then
    perform private.raise_core_error_v1(
      'projection_not_found',
      'The reputation projection does not exist.'
    );
  end if;
  if projection_row.projection_version <> p_expected_version then
    perform private.raise_core_error_v1(
      'aggregate_version_conflict',
      'The reputation projection changed before rebuild.',
      false,
      jsonb_build_object(
        'expectedVersion', p_expected_version,
        'actualVersion', projection_row.projection_version
      )
    );
  end if;

  projection_row := private.rebuild_player_reputation_projection_v2(
    p_player_id,
    command_time_value
  );
  projection_value := private.player_trust_projection_snapshot_v2(p_player_id);
  reputation_event_id_value := private.enqueue_contract_event_v2(
    'player.reputation_changed.v2',
    'player_reputation_projection',
    p_player_id,
    greatest(projection_row.projection_version, 1),
    null,
    p_correlation_id,
    null,
    jsonb_build_object('projection', projection_value),
    format(
      'player-reputation-rebuilt:%s:%s:%s',
      p_player_id,
      projection_row.projection_version,
      p_idempotency_key
    )
  );
  receipt_value := jsonb_build_object(
    'aggregateId', p_player_id,
    'aggregateType', 'player_reputation_projection',
    'aggregateVersion', projection_row.projection_version,
    'commandName', command_name_value,
    'correlationId', p_correlation_id,
    'eventIds', jsonb_build_array(reputation_event_id_value),
    'occurredAt', command_time_value,
    'repeated', false,
    'resultCode', 'projection_rebuilt',
    'projection', projection_value
  );
  perform private.finish_command_v1(
    command_name_value,
    receipt_account_id_value,
    p_idempotency_key,
    receipt_value
  );
  return receipt_value;
end;
$$;

create or replace function public.list_repeat_play_recommendations_v2(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config_row private.trust_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
  preference_row public.engagement_preferences_v2;
  activity_row public.activity_items_v2;
  teammate_value jsonb;
  teammate_player_id uuid;
  social_snapshot jsonb;
  allowed boolean;
  result_value jsonb := '[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Repeat recommendation limit must be between 1 and 50.'
    );
  end if;
  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false)
    or not coalesce(config_row.activity_enabled, false)
    or not coalesce(config_row.repeat_play_enabled, false) then
    return result_value;
  end if;
  actor_context := private.resolve_trust_actor_v2(true, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  select preferences.* into preference_row
  from public.engagement_preferences_v2 preferences
  where preferences.player_id = actor_player_id;
  if not coalesce(preference_row.activity_enabled, true)
    or not coalesce(preference_row.repeat_play_prompts_enabled, true) then
    return result_value;
  end if;

  for activity_row in
    select activity.*
    from public.activity_items_v2 activity
    where activity.player_id = actor_player_id
      and activity.kind = 'repeat_play_recommendation'
      and activity.dismissed_at is null
    order by activity.priority desc, activity.created_at desc, activity.id
    limit p_limit
  loop
    if jsonb_typeof(activity_row.payload -> 'teammatePlayerIds') <> 'array'
      or jsonb_array_length(activity_row.payload -> 'teammatePlayerIds') not between 1 and 4 then
      continue;
    end if;
    allowed := true;
    for teammate_value in
      select values.value
      from jsonb_array_elements(activity_row.payload -> 'teammatePlayerIds') values(value)
    loop
      begin
        teammate_player_id := trim(both '"' from teammate_value::text)::uuid;
        social_snapshot := private.social_relationship_snapshot_v2(
          actor_player_id,
          teammate_player_id
        );
        if coalesce(
          (social_snapshot #>> '{capabilities,blocked}')::boolean,
          true
        ) or not coalesce(
          (social_snapshot #>> '{capabilities,canInviteToSession}')::boolean,
          false
        ) then
          allowed := false;
          exit;
        end if;
      exception when others then
        allowed := false;
        exit;
      end;
    end loop;
    if allowed then
      result_value := result_value || jsonb_build_array(
        private.activity_item_snapshot_v2(activity_row.id)
      );
    end if;
  end loop;
  return result_value;
end;
$$;

revoke execute on function private.repeat_teammate_relationship_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.repeat_play_request_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.engagement_preferences_snapshot_for_update_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.derive_repeat_teammates_v2(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

revoke execute on function public.list_repeat_play_recommendations_v2(integer)
  from public, anon;
revoke execute on function public.request_repeat_session_v2(
  uuid[],
  jsonb,
  bigint,
  jsonb,
  text,
  uuid
) from public, anon;
revoke execute on function public.dismiss_activity_item_v2(
  uuid,
  bigint,
  jsonb,
  text,
  uuid
) from public, anon;
revoke execute on function public.update_engagement_preferences_v2(
  jsonb,
  bigint,
  jsonb,
  text,
  uuid
) from public, anon;
revoke execute on function public.rebuild_reputation_projection_v2(
  uuid,
  bigint,
  jsonb,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.list_repeat_play_recommendations_v2(integer)
  to authenticated;
grant execute on function public.request_repeat_session_v2(
  uuid[],
  jsonb,
  bigint,
  jsonb,
  text,
  uuid
) to authenticated, service_role;
grant execute on function public.dismiss_activity_item_v2(
  uuid,
  bigint,
  jsonb,
  text,
  uuid
) to authenticated, service_role;
grant execute on function public.update_engagement_preferences_v2(
  jsonb,
  bigint,
  jsonb,
  text,
  uuid
) to authenticated, service_role;
grant execute on function public.rebuild_reputation_projection_v2(
  uuid,
  bigint,
  jsonb,
  text,
  uuid
) to service_role;

comment on function private.derive_repeat_teammates_v2(uuid, uuid, uuid, uuid) is
  'Derives canonical repeat-teammate relationships only from fully confirmed completed sessions; Social block/capability authority controls recommendation visibility, not historical trust facts.';
comment on function public.request_repeat_session_v2(
  uuid[], jsonb, bigint, jsonb, text, uuid
) is
  'Creates one idempotent repeat-session request after validating relationship versions, active lifecycle and live Social block/invite capabilities.';
comment on function public.dismiss_activity_item_v2(
  uuid, bigint, jsonb, text, uuid
) is
  'Dismisses one owner activity item with optimistic concurrency and a versioned outbox event.';
comment on function public.update_engagement_preferences_v2(
  jsonb, bigint, jsonb, text, uuid
) is
  'Updates exact engagement and reactivation preferences with optimistic concurrency and a versioned outbox event.';
comment on function public.rebuild_reputation_projection_v2(
  uuid, bigint, jsonb, text, uuid
) is
  'Service-role-only idempotent rebuild from the immutable ledger; the target player keys the receipt but is not represented as the system actor.';
