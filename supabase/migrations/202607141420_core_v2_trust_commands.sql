-- Core V2 Mission 4: authoritative participation and endorsement commands.
-- Commands reuse Core V1 identity/lifecycle and durable command receipts, emit
-- versioned Core V2 events and never allow clients to write trust facts directly.

create or replace function private.validate_command_audit_v2(p_audit jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  allowed_keys constant text[] := array[
    'appVersion',
    'clientCreatedAt',
    'clientRequestId',
    'deviceInstallationId',
    'platform'
  ];
  normalized jsonb;
begin
  if p_audit is null or jsonb_typeof(p_audit) <> 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit metadata must be an object.'
    );
  end if;
  if not p_audit ?& array[
    'appVersion',
    'clientCreatedAt',
    'clientRequestId',
    'platform'
  ] then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit metadata is missing a required field.'
    );
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_audit) as keys(key_name)
    where not keys.key_name = any(allowed_keys)
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit metadata contains an unsupported field.'
    );
  end if;
  if char_length(coalesce(p_audit ->> 'appVersion', '')) not between 1 and 64 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit.appVersion must contain 1-64 characters.'
    );
  end if;
  if p_audit ->> 'platform' not in ('ios', 'android', 'web', 'unknown') then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit.platform is unsupported.'
    );
  end if;
  perform private.require_contract_timestamp_v2(
    p_audit ->> 'clientCreatedAt',
    'audit.clientCreatedAt'
  );
  perform private.require_contract_uuid_v2(
    p_audit ->> 'clientRequestId',
    'audit.clientRequestId'
  );
  if p_audit -> 'deviceInstallationId' is not null
    and p_audit -> 'deviceInstallationId' <> 'null'::jsonb then
    perform private.require_contract_uuid_v2(
      p_audit ->> 'deviceInstallationId',
      'audit.deviceInstallationId'
    );
  end if;

  normalized := jsonb_strip_nulls(jsonb_build_object(
    'appVersion', p_audit ->> 'appVersion',
    'clientCreatedAt', p_audit ->> 'clientCreatedAt',
    'clientRequestId', p_audit ->> 'clientRequestId',
    'deviceInstallationId', p_audit ->> 'deviceInstallationId',
    'platform', p_audit ->> 'platform'
  ));
  return normalized;
end;
$$;

create or replace function private.participation_confirmation_snapshot_v2(
  p_confirmation_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'confirmationId', confirmations.id,
    'sessionId', confirmations.session_id,
    'playerId', confirmations.player_id,
    'status', confirmations.status,
    'reasonCode', confirmations.reason_code,
    'version', confirmations.version,
    'confirmedAt', confirmations.confirmed_at
  )
  from public.session_participation_confirmations_v2 confirmations
  where confirmations.id = p_confirmation_id;
$$;

create or replace function private.player_endorsement_snapshot_v2(
  p_endorsement_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'endorsementId', endorsements.id,
    'sessionId', endorsements.session_id,
    'actorPlayerId', endorsements.actor_player_id,
    'targetPlayerId', endorsements.target_player_id,
    'kinds', endorsements.kinds,
    'version', endorsements.version,
    'createdAt', endorsements.created_at
  )
  from public.player_endorsements_v2 endorsements
  where endorsements.id = p_endorsement_id;
$$;

create or replace function private.outcome_all_participation_confirmed_v2(
  p_outcome_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select cardinality(outcomes.participant_player_ids) = (
    select count(*)
    from public.session_participation_confirmations_v2 confirmations
    where confirmations.outcome_id = outcomes.id
      and confirmations.status = 'confirmed'
  )
  from public.session_outcomes_v2 outcomes
  where outcomes.id = p_outcome_id
    and outcomes.state = 'recorded';
$$;

create or replace function private.emit_reputation_progress_v2(
  p_player_id uuid,
  p_session_id uuid,
  p_projection jsonb,
  p_actor_player_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_activity_deduplication_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  projection_version_value bigint;
  reputation_event_id_value uuid;
  activity_result_value jsonb;
  event_ids_value jsonb := '[]'::jsonb;
  config_row private.trust_authority_config_v2;
  preference_row public.engagement_preferences_v2;
begin
  if p_projection is null or jsonb_typeof(p_projection) <> 'object' then
    perform private.raise_core_error_v1(
      'projection_not_found',
      'The authoritative reputation projection is unavailable.'
    );
  end if;
  if coalesce(p_projection ->> 'projectionVersion', '') !~ '^[0-9]+$' then
    perform private.raise_core_error_v1(
      'projection_contract_violation',
      'projectionVersion must be a non-negative integer.'
    );
  end if;
  projection_version_value := (p_projection ->> 'projectionVersion')::bigint;

  reputation_event_id_value := private.enqueue_contract_event_v2(
    'player.reputation_changed.v2',
    'player_reputation_projection',
    p_player_id,
    greatest(projection_version_value, 1),
    p_actor_player_id,
    p_correlation_id,
    p_causation_id,
    jsonb_build_object('projection', p_projection),
    format(
      'player-reputation-changed:%s:%s',
      p_player_id,
      projection_version_value
    )
  );
  event_ids_value := event_ids_value || jsonb_build_array(
    reputation_event_id_value
  );

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  select preferences.* into preference_row
  from public.engagement_preferences_v2 preferences
  where preferences.player_id = p_player_id;

  if coalesce(config_row.activity_enabled, false)
    and coalesce(preference_row.activity_enabled, true) then
    activity_result_value := private.create_activity_item_with_events_v2(
      p_player_id,
      'reputation_progress',
      jsonb_build_object(
        'sessionId', p_session_id,
        'projectionVersion', projection_version_value
      ),
      500,
      p_activity_deduplication_key,
      p_actor_player_id,
      p_correlation_id,
      reputation_event_id_value
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
  end if;

  return event_ids_value;
end;
$$;

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

create or replace function public.dispute_session_participation_v2(
  p_session_id uuid,
  p_reason_code public.participation_dispute_reason_v2,
  p_note text,
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
  command_name_value constant text := 'dispute_session_participation_v2';
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
  outcome_snapshot_value jsonb;
  confirmation_snapshot_value jsonb;
  participation_event_id_value uuid;
  event_ids_value jsonb := '[]'::jsonb;
  receipt_value jsonb;
begin
  if p_session_id is null
    or p_reason_code is null
    or p_idempotency_key is null
    or p_correlation_id is null
    or p_expected_version is null
    or p_expected_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'sessionId, reasonCode, positive expectedVersion, idempotencyKey and correlationId are required.'
    );
  end if;
  if p_note is not null
    and (char_length(btrim(p_note)) < 1 or char_length(p_note) > 500) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Dispute note must contain 1-500 characters when provided.'
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
    'reasonCode', p_reason_code,
    'note', p_note,
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
  if not actor_player_id_value = any(outcome_row.participant_player_ids) then
    perform private.raise_core_error_v1(
      'trust_forbidden',
      'Only a completed-session participant can dispute participation.'
    );
  end if;
  if outcome_row.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'aggregate_version_conflict',
      'The session outcome changed before participation dispute.',
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
    'disputed',
    p_reason_code,
    case when p_note is null then null else btrim(p_note) end,
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
  set state = 'disputed',
      version = outcomes.version + 1,
      updated_at = command_time_value
  where outcomes.id = outcome_row.id
  returning * into outcome_row;

  confirmation_snapshot_value :=
    private.participation_confirmation_snapshot_v2(confirmation_row.id);
  participation_event_id_value := private.enqueue_contract_event_v2(
    'session.participation_disputed.v2',
    'session_outcome',
    outcome_row.id,
    outcome_row.version,
    actor_player_id_value,
    p_correlation_id,
    null,
    jsonb_build_object('confirmation', confirmation_snapshot_value),
    format(
      'session-participation-disputed:%s:%s',
      confirmation_row.id,
      confirmation_row.version
    )
  );
  event_ids_value := jsonb_build_array(participation_event_id_value);
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
    'resultCode', 'participation_disputed',
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

create or replace function public.submit_player_endorsement_v2(
  p_session_id uuid,
  p_target_player_id uuid,
  p_kinds public.endorsement_kind_v2[],
  p_expected_version bigint,
  p_expected_outcome_version bigint,
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
  command_name_value constant text := 'submit_player_endorsement_v2';
  command_time_value timestamptz := now();
  actor_context jsonb;
  actor_player_id_value uuid;
  receipt_account_id_value uuid;
  audit_value jsonb;
  request_hash_value text;
  command_state record;
  config_row private.trust_authority_config_v2;
  outcome_row public.session_outcomes_v2;
  endorsement_row public.player_endorsements_v2;
  endorsement_snapshot_value jsonb;
  endorsement_event_id_value uuid;
  projection_value jsonb;
  progress_event_ids_value jsonb;
  event_ids_value jsonb := '[]'::jsonb;
  receipt_value jsonb;
  kind_value public.endorsement_kind_v2;
begin
  if p_session_id is null
    or p_target_player_id is null
    or p_kinds is null
    or cardinality(p_kinds) not between 1 and 6
    or p_expected_version is null
    or p_expected_version <> 0
    or p_expected_outcome_version is null
    or p_expected_outcome_version <= 0
    or p_idempotency_key is null
    or p_correlation_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'A new endorsement requires expectedVersion 0, a positive expectedOutcomeVersion, 1-6 kinds, idempotencyKey and correlationId.'
    );
  end if;
  if not private.is_unique_endorsement_kind_array_v2(p_kinds) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Endorsement kinds must be unique.'
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
  if actor_player_id_value = p_target_player_id then
    perform private.raise_core_error_v1(
      'self_endorsement_forbidden',
      'Players cannot endorse themselves.'
    );
  end if;
  audit_value := private.validate_command_audit_v2(p_audit);
  request_hash_value := private.command_request_hash_v1(jsonb_build_object(
    'sessionId', p_session_id,
    'targetPlayerId', p_target_player_id,
    'kinds', p_kinds,
    'expectedVersion', p_expected_version,
    'expectedOutcomeVersion', p_expected_outcome_version,
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
  if outcome_row.state <> 'recorded' then
    perform private.raise_core_error_v1(
      'session_outcome_disputed',
      'Endorsements are unavailable while the outcome is disputed.'
    );
  end if;
  if outcome_row.version <> p_expected_outcome_version then
    perform private.raise_core_error_v1(
      'aggregate_version_conflict',
      'The session outcome changed before endorsement.',
      false,
      jsonb_build_object(
        'expectedVersion', p_expected_outcome_version,
        'actualVersion', outcome_row.version
      )
    );
  end if;
  if not actor_player_id_value = any(outcome_row.participant_player_ids)
    or not p_target_player_id = any(outcome_row.participant_player_ids) then
    perform private.raise_core_error_v1(
      'trust_forbidden',
      'Only participants can endorse another participant in the completed session.'
    );
  end if;
  if not private.outcome_all_participation_confirmed_v2(outcome_row.id) then
    perform private.raise_core_error_v1(
      'participation_confirmation_incomplete',
      'Every session participant must confirm before endorsements are accepted.'
    );
  end if;
  if exists (
    select 1
    from public.player_endorsements_v2 endorsements
    where endorsements.session_id = outcome_row.session_id
      and endorsements.actor_player_id = actor_player_id_value
      and endorsements.target_player_id = p_target_player_id
  ) then
    perform private.raise_core_error_v1(
      'endorsement_already_submitted',
      'This player-to-player session endorsement already exists.'
    );
  end if;

  insert into public.player_endorsements_v2 (
    outcome_id,
    session_id,
    actor_player_id,
    target_player_id,
    kinds,
    audit_metadata,
    created_at
  ) values (
    outcome_row.id,
    outcome_row.session_id,
    actor_player_id_value,
    p_target_player_id,
    p_kinds,
    audit_value || jsonb_build_object(
      'actorPlayerId', actor_player_id_value,
      'commandName', command_name_value,
      'correlationId', p_correlation_id,
      'idempotencyKey', p_idempotency_key
    ),
    command_time_value
  )
  returning * into endorsement_row;

  endorsement_snapshot_value := private.player_endorsement_snapshot_v2(
    endorsement_row.id
  );
  endorsement_event_id_value := private.enqueue_contract_event_v2(
    'player.endorsed.v2',
    'player_endorsement',
    endorsement_row.id,
    endorsement_row.version,
    actor_player_id_value,
    p_correlation_id,
    null,
    jsonb_build_object('endorsement', endorsement_snapshot_value),
    format(
      'player-endorsed:%s:%s',
      endorsement_row.id,
      endorsement_row.version
    )
  );
  event_ids_value := event_ids_value || jsonb_build_array(
    endorsement_event_id_value
  );

  foreach kind_value in array p_kinds
  loop
    perform private.append_reputation_ledger_entry_v2(
      p_target_player_id,
      'positive_endorsements',
      1,
      'endorsement',
      endorsement_row.id,
      format('endorsement:%s:%s', endorsement_row.id, kind_value),
      jsonb_build_object(
        'sessionId', outcome_row.session_id,
        'actorPlayerId', actor_player_id_value,
        'kind', kind_value
      )
    );
  end loop;

  projection_value := private.player_trust_projection_snapshot_v2(
    p_target_player_id
  );
  progress_event_ids_value := private.emit_reputation_progress_v2(
    p_target_player_id,
    outcome_row.session_id,
    projection_value,
    actor_player_id_value,
    p_correlation_id,
    endorsement_event_id_value,
    format(
      'reputation:endorsement:%s:%s',
      endorsement_row.id,
      projection_value ->> 'projectionVersion'
    )
  );
  event_ids_value := event_ids_value || progress_event_ids_value;

  receipt_value := jsonb_build_object(
    'aggregateId', endorsement_row.id,
    'aggregateType', 'player_endorsement',
    'aggregateVersion', endorsement_row.version,
    'commandName', command_name_value,
    'correlationId', p_correlation_id,
    'eventIds', event_ids_value,
    'occurredAt', command_time_value,
    'repeated', false,
    'resultCode', 'endorsement_submitted',
    'endorsement', endorsement_snapshot_value
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

revoke execute on function private.validate_command_audit_v2(jsonb)
  from public, anon, authenticated;
revoke execute on function private.participation_confirmation_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.player_endorsement_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.outcome_all_participation_confirmed_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.emit_reputation_progress_v2(
  uuid,
  uuid,
  jsonb,
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;

revoke execute on function public.confirm_session_participation_v2(
  uuid,
  bigint,
  jsonb,
  text,
  uuid
) from public, anon;
revoke execute on function public.dispute_session_participation_v2(
  uuid,
  public.participation_dispute_reason_v2,
  text,
  bigint,
  jsonb,
  text,
  uuid
) from public, anon;
revoke execute on function public.submit_player_endorsement_v2(
  uuid,
  uuid,
  public.endorsement_kind_v2[],
  bigint,
  bigint,
  jsonb,
  text,
  uuid
) from public, anon;

grant execute on function public.confirm_session_participation_v2(
  uuid,
  bigint,
  jsonb,
  text,
  uuid
) to authenticated, service_role;
grant execute on function public.dispute_session_participation_v2(
  uuid,
  public.participation_dispute_reason_v2,
  text,
  bigint,
  jsonb,
  text,
  uuid
) to authenticated, service_role;
grant execute on function public.submit_player_endorsement_v2(
  uuid,
  uuid,
  public.endorsement_kind_v2[],
  bigint,
  bigint,
  jsonb,
  text,
  uuid
) to authenticated, service_role;

comment on function public.confirm_session_participation_v2(
  uuid,
  bigint,
  jsonb,
  text,
  uuid
) is
  'Records immutable participation evidence. Positive completed-session ledger facts are written only after every participant confirms.';
comment on function public.dispute_session_participation_v2(
  uuid,
  public.participation_dispute_reason_v2,
  text,
  bigint,
  jsonb,
  text,
  uuid
) is
  'Records immutable participant dispute evidence and prevents positive outcome progression until an authoritative reconciliation exists.';
comment on function public.submit_player_endorsement_v2(
  uuid,
  uuid,
  public.endorsement_kind_v2[],
  bigint,
  bigint,
  jsonb,
  text,
  uuid
) is
  'Creates one non-anonymous positive endorsement aggregate for two fully confirmed completed-session participants.';
