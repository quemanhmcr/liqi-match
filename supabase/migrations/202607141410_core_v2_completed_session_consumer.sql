-- Core V2 Mission 4: consume the canonical Senior 2 session.completed.v2
-- envelope into an authoritative outcome, feedback activity and a typed
-- notification request for the Senior 3 delivery provider.

create table private.activity_notification_frequency_v2 (
  player_id uuid not null references public.players(id) on delete restrict,
  frequency_window_key text not null,
  reactivation_notifications_used smallint not null default 0
    check (reactivation_notifications_used between 0 and 4),
  updated_at timestamptz not null default now(),
  primary key (player_id, frequency_window_key),
  constraint activity_notification_frequency_v2_window_format check (
    frequency_window_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:UTC$'
  )
);

create or replace function private.jsonb_has_exact_keys_v2(
  p_value jsonb,
  p_allowed_keys text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) is distinct from 'object' then false
    else (
      select count(*) = cardinality(p_allowed_keys)
        and not exists (
          select 1
          from jsonb_object_keys(p_value) as keys(key_name)
          where not keys.key_name = any(p_allowed_keys)
        )
      from jsonb_object_keys(p_value)
    )
  end;
$$;

create or replace function private.require_contract_uuid_v2(
  p_value text,
  p_field_name text
)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null
    or p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    perform private.raise_core_error_v1(
      'validation_failed',
      format('%s must be a valid UUID.', p_field_name)
    );
  end if;
  return p_value::uuid;
end;
$$;

create or replace function private.require_contract_timestamp_v2(
  p_value text,
  p_field_name text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_value is null
    or p_value !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    perform private.raise_core_error_v1(
      'validation_failed',
      format('%s must be an ISO-8601 timestamp with an offset.', p_field_name)
    );
  end if;
  return p_value::timestamptz;
exception
  when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      format('%s must be a valid timestamp.', p_field_name)
    );
    return null;
end;
$$;

create or replace function private.activity_notification_target_v2(
  p_kind public.activity_item_kind_v2,
  p_payload jsonb,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_id_value uuid;
  outcome_id_value uuid;
  source_session_id_value uuid;
  teammate_ids jsonb;
begin
  case p_kind
    when 'feedback_prompt' then
      session_id_value := private.require_contract_uuid_v2(
        p_payload ->> 'sessionId',
        'activity.payload.sessionId'
      );
      if p_payload ? 'outcomeId' and p_payload ->> 'outcomeId' is not null then
        outcome_id_value := private.require_contract_uuid_v2(
          p_payload ->> 'outcomeId',
          'activity.payload.outcomeId'
        );
      end if;
      return jsonb_build_object(
        'target', 'session_feedback',
        'sessionId', session_id_value,
        'outcomeId', outcome_id_value
      );
    when 'reputation_progress' then
      return jsonb_build_object(
        'target', 'reputation',
        'playerId', p_player_id
      );
    when 'repeat_play_recommendation' then
      source_session_id_value := private.require_contract_uuid_v2(
        p_payload ->> 'sourceSessionId',
        'activity.payload.sourceSessionId'
      );
      teammate_ids := p_payload -> 'teammatePlayerIds';
      if jsonb_typeof(teammate_ids) <> 'array'
        or jsonb_array_length(teammate_ids) not between 1 and 4 then
        perform private.raise_core_error_v1(
          'validation_failed',
          'Repeat-play notification targets require 1-4 teammatePlayerIds.'
        );
      end if;
      return jsonb_build_object(
        'target', 'repeat_play',
        'sourceSessionId', source_session_id_value,
        'teammatePlayerIds', teammate_ids
      );
  end case;
end;
$$;

create or replace function private.enqueue_activity_notification_request_v2(
  p_activity_item_id uuid,
  p_activity_event_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_row public.activity_items_v2;
  preference_row public.engagement_preferences_v2;
  config_row private.trust_authority_config_v2;
  decision_id_value uuid := extensions.gen_random_uuid();
  evaluated_at_value timestamptz := now();
  frequency_window_key_value text;
  notifications_used_value integer := 0;
  max_notifications_value integer := 0;
  inbox_allowed_value boolean := true;
  push_allowed_value boolean := true;
  reason_value text := 'eligible';
  kind_enabled_value boolean := true;
  target_value jsonb;
  request_value jsonb;
  request_event_id uuid;
begin
  select items.* into activity_row
  from public.activity_items_v2 items
  where items.id = p_activity_item_id;
  if activity_row.id is null then
    perform private.raise_core_error_v1(
      'activity_item_not_found',
      'The activity item does not exist.'
    );
  end if;

  select preferences.* into preference_row
  from public.engagement_preferences_v2 preferences
  where preferences.player_id = activity_row.player_id;
  if preference_row.player_id is null then
    perform private.raise_core_error_v1(
      'engagement_preferences_not_found',
      'The activity owner has no engagement preferences.'
    );
  end if;

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;

  kind_enabled_value := case activity_row.kind
    when 'feedback_prompt' then
      coalesce(config_row.feedback_prompts_enabled, false)
      and preference_row.feedback_prompts_enabled
    when 'repeat_play_recommendation' then
      coalesce(config_row.repeat_play_enabled, false)
      and preference_row.repeat_play_prompts_enabled
    when 'reputation_progress' then true
  end;
  max_notifications_value := preference_row.max_reactivation_notifications_per_day;
  frequency_window_key_value :=
    to_char(timezone('UTC', evaluated_at_value), 'YYYY-MM-DD') || ':UTC';

  insert into private.activity_notification_frequency_v2 (
    player_id,
    frequency_window_key,
    reactivation_notifications_used
  ) values (
    activity_row.player_id,
    frequency_window_key_value,
    0
  )
  on conflict (player_id, frequency_window_key) do nothing;

  select frequency.reactivation_notifications_used
    into notifications_used_value
  from private.activity_notification_frequency_v2 frequency
  where frequency.player_id = activity_row.player_id
    and frequency.frequency_window_key = frequency_window_key_value
  for update;

  if not coalesce(config_row.activity_enabled, false)
    or not preference_row.activity_enabled then
    inbox_allowed_value := false;
    push_allowed_value := false;
    reason_value := 'activity_disabled';
  elsif not kind_enabled_value then
    inbox_allowed_value := false;
    push_allowed_value := false;
    reason_value := 'kind_disabled';
  elsif not preference_row.push_reactivation_enabled then
    push_allowed_value := false;
    reason_value := 'push_disabled';
  elsif notifications_used_value >= max_notifications_value then
    push_allowed_value := false;
    reason_value := 'frequency_capped';
  end if;

  if push_allowed_value then
    update private.activity_notification_frequency_v2 frequency
    set reactivation_notifications_used = frequency.reactivation_notifications_used + 1,
        updated_at = evaluated_at_value
    where frequency.player_id = activity_row.player_id
      and frequency.frequency_window_key = frequency_window_key_value;
  end if;

  target_value := private.activity_notification_target_v2(
    activity_row.kind,
    activity_row.payload,
    activity_row.player_id
  );
  request_value := jsonb_build_object(
    'activityItem', private.activity_item_snapshot_v2(activity_row.id),
    'target', target_value,
    'deliveryDecision', jsonb_build_object(
      'decisionId', decision_id_value,
      'engagementPreferencesVersion', preference_row.version,
      'frequencyWindowKey', frequency_window_key_value,
      'reactivationNotificationsUsed', notifications_used_value,
      'maxReactivationNotificationsPerDay', max_notifications_value,
      'inboxAllowed', inbox_allowed_value,
      'pushAllowed', push_allowed_value,
      'reason', reason_value,
      'evaluatedAt', evaluated_at_value
    ),
    'sourceEventId', p_activity_event_id,
    'causationId', p_causation_id,
    'correlationId', p_correlation_id
  );

  request_event_id := private.enqueue_contract_event_v2(
    'activity.notification_requested.v2',
    'activity_item',
    activity_row.id,
    activity_row.version,
    null,
    p_correlation_id,
    p_activity_event_id,
    jsonb_build_object('request', request_value),
    format('activity-notification:%s:%s', activity_row.id, activity_row.version)
  );
  return request_event_id;
end;
$$;

create or replace function private.create_activity_item_with_events_v2(
  p_player_id uuid,
  p_kind public.activity_item_kind_v2,
  p_payload jsonb,
  p_priority integer,
  p_deduplication_key text,
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
  activity_row public.activity_items_v2;
  inserted_count integer;
  activity_event_id uuid;
  notification_request_event_id uuid;
begin
  insert into public.activity_items_v2 (
    player_id,
    kind,
    payload,
    priority,
    deduplication_key
  ) values (
    p_player_id,
    p_kind,
    p_payload,
    p_priority,
    p_deduplication_key
  )
  on conflict (player_id, deduplication_key) do nothing;
  get diagnostics inserted_count = row_count;

  select items.* into activity_row
  from public.activity_items_v2 items
  where items.player_id = p_player_id
    and items.deduplication_key = p_deduplication_key;

  if inserted_count = 0 then
    return jsonb_build_object(
      'activityItem', private.activity_item_snapshot_v2(activity_row.id),
      'activityEventId', null,
      'notificationRequestEventId', null,
      'repeated', true
    );
  end if;

  activity_event_id := private.enqueue_contract_event_v2(
    'activity.item_created.v2',
    'activity_item',
    activity_row.id,
    activity_row.version,
    p_actor_player_id,
    p_correlation_id,
    p_causation_id,
    jsonb_build_object(
      'activityItem', private.activity_item_snapshot_v2(activity_row.id)
    ),
    format('activity-item-created:%s:%s', activity_row.id, activity_row.version)
  );
  notification_request_event_id :=
    private.enqueue_activity_notification_request_v2(
      activity_row.id,
      activity_event_id,
      p_correlation_id,
      p_causation_id
    );

  return jsonb_build_object(
    'activityItem', private.activity_item_snapshot_v2(activity_row.id),
    'activityEventId', activity_event_id,
    'notificationRequestEventId', notification_request_event_id,
    'repeated', false
  );
end;
$$;

create or replace function private.consume_session_completed_v2(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  envelope_keys constant text[] := array[
    'eventId',
    'eventType',
    'eventVersion',
    'aggregateType',
    'aggregateId',
    'aggregateVersion',
    'actorPlayerId',
    'correlationId',
    'causationId',
    'occurredAt',
    'payload'
  ];
  payload_keys constant text[] := array[
    'sessionId',
    'participantPlayerIds',
    'scheduledFor',
    'startedAt',
    'completedAt',
    'roleAssignments',
    'source',
    'verification'
  ];
  role_assignment_keys constant text[] := array[
    'assignmentId',
    'playerId',
    'roleSlug',
    'assignedAt'
  ];
  config_row private.trust_authority_config_v2;
  payload_value jsonb;
  participants_value jsonb;
  role_assignments_value jsonb;
  source_value jsonb;
  participant_value jsonb;
  role_assignment_value jsonb;
  event_id_value uuid;
  event_type_value text;
  event_version_value integer;
  aggregate_type_value text;
  aggregate_id_value uuid;
  aggregate_version_value bigint;
  actor_player_id_value uuid;
  correlation_id_value uuid;
  causation_id_value uuid;
  occurred_at_value timestamptz;
  session_id_value uuid;
  participant_player_ids_value uuid[] := '{}'::uuid[];
  role_assignment_ids_value uuid[] := '{}'::uuid[];
  role_assignment_player_ids_value uuid[] := '{}'::uuid[];
  role_assignment_id_value uuid;
  role_player_id_value uuid;
  source_kind_value text;
  scheduled_for_value timestamptz;
  started_at_value timestamptz;
  completed_at_value timestamptz;
  payload_hash_value text;
  existing_hash_value text;
  existing_result_value jsonb;
  existing_outcome_row public.session_outcomes_v2;
  outcome_row public.session_outcomes_v2;
  outcome_snapshot_value jsonb;
  outcome_event_id_value uuid;
  activity_result_value jsonb;
  event_ids_value jsonb := '[]'::jsonb;
  result_value jsonb;
  preference_row public.engagement_preferences_v2;
  participant_player_id_value uuid;
  participant_count_value integer;
  matching_player_count_value integer;
  inserted_count integer;
begin
  if p_event is null
    or jsonb_typeof(p_event) <> 'object'
    or not private.jsonb_has_exact_keys_v2(p_event, envelope_keys) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'session.completed.v2 must use the exact Core V2 event envelope.'
    );
  end if;

  event_type_value := p_event ->> 'eventType';
  if event_type_value <> 'session.completed.v2' then
    perform private.raise_core_error_v1(
      'unsupported_event_type',
      'The trust outcome consumer only accepts session.completed.v2.'
    );
  end if;

  if coalesce(p_event ->> 'eventVersion', '') !~ '^[0-9]+$' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'eventVersion must be an integer.'
    );
  end if;
  event_version_value := (p_event ->> 'eventVersion')::integer;
  if event_version_value <> 2 then
    perform private.raise_core_error_v1(
      'unsupported_event_version',
      'Only session.completed.v2 eventVersion 2 is supported.',
      false,
      jsonb_build_object('eventVersion', event_version_value)
    );
  end if;

  aggregate_type_value := p_event ->> 'aggregateType';
  if aggregate_type_value <> 'play_session' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'session.completed.v2 aggregateType must be play_session.'
    );
  end if;

  event_id_value := private.require_contract_uuid_v2(
    p_event ->> 'eventId',
    'eventId'
  );
  aggregate_id_value := private.require_contract_uuid_v2(
    p_event ->> 'aggregateId',
    'aggregateId'
  );
  correlation_id_value := private.require_contract_uuid_v2(
    p_event ->> 'correlationId',
    'correlationId'
  );
  if p_event -> 'actorPlayerId' is not null
    and p_event -> 'actorPlayerId' <> 'null'::jsonb then
    actor_player_id_value := private.require_contract_uuid_v2(
      p_event ->> 'actorPlayerId',
      'actorPlayerId'
    );
  end if;
  if p_event -> 'causationId' is not null
    and p_event -> 'causationId' <> 'null'::jsonb then
    causation_id_value := private.require_contract_uuid_v2(
      p_event ->> 'causationId',
      'causationId'
    );
  end if;
  occurred_at_value := private.require_contract_timestamp_v2(
    p_event ->> 'occurredAt',
    'occurredAt'
  );

  if coalesce(p_event ->> 'aggregateVersion', '') !~ '^[0-9]+$' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'aggregateVersion must be a positive integer.'
    );
  end if;
  aggregate_version_value := (p_event ->> 'aggregateVersion')::bigint;
  if aggregate_version_value <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'aggregateVersion must be positive.'
    );
  end if;

  payload_value := p_event -> 'payload';
  if payload_value is null
    or jsonb_typeof(payload_value) <> 'object'
    or not private.jsonb_has_exact_keys_v2(payload_value, payload_keys) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'session.completed.v2 payload does not match the canonical provider contract.'
    );
  end if;
  if payload_value ->> 'verification' <> 'participant_quorum' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Only participant_quorum completion can create a positive session outcome.'
    );
  end if;

  session_id_value := private.require_contract_uuid_v2(
    payload_value ->> 'sessionId',
    'payload.sessionId'
  );
  if session_id_value <> aggregate_id_value then
    perform private.raise_core_error_v1(
      'validation_failed',
      'aggregateId must equal payload.sessionId.'
    );
  end if;

  participants_value := payload_value -> 'participantPlayerIds';
  if participants_value is null
    or jsonb_typeof(participants_value) <> 'array'
    or jsonb_array_length(participants_value) not between 2 and 5
    or exists (
      select 1
      from jsonb_array_elements(participants_value) as participant(item)
      where jsonb_typeof(participant.item) <> 'string'
    ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'participantPlayerIds must contain 2-5 canonical PlayerIds.'
    );
  end if;

  for participant_value in
    select participant.item
    from jsonb_array_elements(participants_value) as participant(item)
  loop
    participant_player_ids_value := array_append(
      participant_player_ids_value,
      private.require_contract_uuid_v2(
        participant_value #>> '{}',
        'payload.participantPlayerIds[]'
      )
    );
  end loop;
  if not private.is_unique_uuid_array_v2(participant_player_ids_value) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'participantPlayerIds must be unique.'
    );
  end if;

  participant_count_value := cardinality(participant_player_ids_value);
  select count(*)::integer into matching_player_count_value
  from public.players players
  where players.id = any(participant_player_ids_value);
  if matching_player_count_value <> participant_count_value then
    perform private.raise_core_error_v1(
      'trust_player_not_found',
      'Every completed-session participant must be a canonical player.'
    );
  end if;
  if actor_player_id_value is not null
    and not actor_player_id_value = any(participant_player_ids_value) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'actorPlayerId must be null or a completed-session participant.'
    );
  end if;

  role_assignments_value := payload_value -> 'roleAssignments';
  if role_assignments_value is null
    or jsonb_typeof(role_assignments_value) <> 'array'
    or jsonb_array_length(role_assignments_value) > 5 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'roleAssignments must be an array with at most five entries.'
    );
  end if;

  for role_assignment_value in
    select assignment.item
    from jsonb_array_elements(role_assignments_value) as assignment(item)
  loop
    if jsonb_typeof(role_assignment_value) <> 'object'
      or not private.jsonb_has_exact_keys_v2(
        role_assignment_value,
        role_assignment_keys
      ) then
      perform private.raise_core_error_v1(
        'validation_failed',
        'Each role assignment must use the exact provider shape.'
      );
    end if;

    role_assignment_id_value := private.require_contract_uuid_v2(
      role_assignment_value ->> 'assignmentId',
      'payload.roleAssignments[].assignmentId'
    );
    role_player_id_value := private.require_contract_uuid_v2(
      role_assignment_value ->> 'playerId',
      'payload.roleAssignments[].playerId'
    );
    if not role_player_id_value = any(participant_player_ids_value) then
      perform private.raise_core_error_v1(
        'validation_failed',
        'Role assignments can only target completed-session participants.'
      );
    end if;
    if coalesce(role_assignment_value ->> 'roleSlug', '') !~ '^[a-z0-9_]{1,32}$' then
      perform private.raise_core_error_v1(
        'validation_failed',
        'Role assignment roleSlug must be a stable lowercase slug.'
      );
    end if;
    perform private.require_contract_timestamp_v2(
      role_assignment_value ->> 'assignedAt',
      'payload.roleAssignments[].assignedAt'
    );

    role_assignment_ids_value := array_append(
      role_assignment_ids_value,
      role_assignment_id_value
    );
    role_assignment_player_ids_value := array_append(
      role_assignment_player_ids_value,
      role_player_id_value
    );
  end loop;
  if cardinality(role_assignment_ids_value) > 0
    and (
      not private.is_unique_uuid_array_v2(role_assignment_ids_value)
      or not private.is_unique_uuid_array_v2(role_assignment_player_ids_value)
    ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Role assignment IDs and assigned players must be unique.'
    );
  end if;

  source_value := payload_value -> 'source';
  if source_value is null or jsonb_typeof(source_value) <> 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'source must be a canonical Play Session source object.'
    );
  end if;
  source_kind_value := source_value ->> 'kind';
  if source_kind_value = 'manual' then
    if not private.jsonb_has_exact_keys_v2(source_value, array['kind']) then
      perform private.raise_core_error_v1(
        'validation_failed',
        'Manual session source must only contain kind.'
      );
    end if;
  elsif source_kind_value = 'match' then
    if not private.jsonb_has_exact_keys_v2(
      source_value,
      array['kind', 'matchId']
    ) then
      perform private.raise_core_error_v1(
        'validation_failed',
        'Match session source must contain only kind and matchId.'
      );
    end if;
    perform private.require_contract_uuid_v2(
      source_value ->> 'matchId',
      'payload.source.matchId'
    );
  elsif source_kind_value = 'set' then
    if not private.jsonb_has_exact_keys_v2(
      source_value,
      array['kind', 'setId']
    ) then
      perform private.raise_core_error_v1(
        'validation_failed',
        'Set session source must contain only kind and setId.'
      );
    end if;
    perform private.require_contract_uuid_v2(
      source_value ->> 'setId',
      'payload.source.setId'
    );
  else
    perform private.raise_core_error_v1(
      'validation_failed',
      'source.kind must be manual, match, or set.'
    );
  end if;

  if payload_value -> 'scheduledFor' is not null
    and payload_value -> 'scheduledFor' <> 'null'::jsonb then
    scheduled_for_value := private.require_contract_timestamp_v2(
      payload_value ->> 'scheduledFor',
      'payload.scheduledFor'
    );
  end if;
  started_at_value := private.require_contract_timestamp_v2(
    payload_value ->> 'startedAt',
    'payload.startedAt'
  );
  completed_at_value := private.require_contract_timestamp_v2(
    payload_value ->> 'completedAt',
    'payload.completedAt'
  );
  if completed_at_value <= started_at_value then
    perform private.raise_core_error_v1(
      'validation_failed',
      'completedAt must be after startedAt.'
    );
  end if;
  if occurred_at_value < completed_at_value then
    perform private.raise_core_error_v1(
      'validation_failed',
      'occurredAt cannot be before completedAt.'
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

  payload_hash_value := private.command_request_hash_v1(p_event);
  perform pg_advisory_xact_lock(hashtextextended(event_id_value::text, 0));

  select consumed.payload_hash, consumed.result
    into existing_hash_value, existing_result_value
  from private.trust_consumed_events_v2 consumed
  where consumed.event_id = event_id_value;
  if existing_hash_value is not null then
    if existing_hash_value <> payload_hash_value then
      perform private.raise_core_error_v1(
        'event_replay_conflict',
        'The eventId was replayed with a different envelope.',
        false,
        jsonb_build_object('eventId', event_id_value)
      );
    end if;
    return jsonb_set(
      coalesce(existing_result_value, '{}'::jsonb),
      '{repeated}',
      'true'::jsonb,
      true
    );
  end if;

  insert into private.trust_consumed_events_v2 (
    event_id,
    event_type,
    aggregate_id,
    aggregate_version,
    payload_hash
  ) values (
    event_id_value,
    event_type_value,
    aggregate_id_value,
    aggregate_version_value,
    payload_hash_value
  );

  select outcomes.* into existing_outcome_row
  from public.session_outcomes_v2 outcomes
  where outcomes.session_id = session_id_value
  for update;
  if existing_outcome_row.id is not null then
    if existing_outcome_row.source_session_version <> aggregate_version_value
      or existing_outcome_row.participant_player_ids <> participant_player_ids_value
      or existing_outcome_row.role_assignments <> role_assignments_value
      or existing_outcome_row.source <> source_value
      or existing_outcome_row.scheduled_for is distinct from scheduled_for_value
      or existing_outcome_row.started_at <> started_at_value
      or existing_outcome_row.completed_at <> completed_at_value then
      perform private.raise_core_error_v1(
        'session_outcome_conflict',
        'A different completed-session outcome already exists for this session.',
        false,
        jsonb_build_object('sessionId', session_id_value)
      );
    end if;

    result_value := jsonb_build_object(
      'outcome', private.session_outcome_snapshot_v2(existing_outcome_row.id),
      'eventIds', '[]'::jsonb,
      'repeated', true
    );
    update private.trust_consumed_events_v2 consumed
    set result = result_value,
        processed_at = now()
    where consumed.event_id = event_id_value;
    return result_value;
  end if;

  insert into public.session_outcomes_v2 (
    session_id,
    source_event_id,
    source_session_version,
    participant_player_ids,
    role_assignments,
    source,
    scheduled_for,
    started_at,
    completed_at,
    confirmation_deadline_at
  ) values (
    session_id_value,
    event_id_value,
    aggregate_version_value,
    participant_player_ids_value,
    role_assignments_value,
    source_value,
    scheduled_for_value,
    started_at_value,
    completed_at_value,
    completed_at_value + interval '72 hours'
  )
  returning * into outcome_row;

  outcome_snapshot_value := private.session_outcome_snapshot_v2(outcome_row.id);
  outcome_event_id_value := private.enqueue_contract_event_v2(
    'session.outcome_recorded.v2',
    'session_outcome',
    outcome_row.id,
    outcome_row.version,
    actor_player_id_value,
    correlation_id_value,
    event_id_value,
    jsonb_build_object('outcome', outcome_snapshot_value),
    format('session-outcome-recorded:%s:%s', outcome_row.id, outcome_row.version)
  );
  event_ids_value := event_ids_value || jsonb_build_array(outcome_event_id_value);

  if coalesce(config_row.activity_enabled, false)
    and coalesce(config_row.feedback_prompts_enabled, false) then
    foreach participant_player_id_value in array participant_player_ids_value
    loop
      select preferences.* into preference_row
      from public.engagement_preferences_v2 preferences
      where preferences.player_id = participant_player_id_value;

      if coalesce(preference_row.activity_enabled, true)
        and coalesce(preference_row.feedback_prompts_enabled, true) then
        activity_result_value := private.create_activity_item_with_events_v2(
          participant_player_id_value,
          'feedback_prompt',
          jsonb_build_object(
            'sessionId', session_id_value,
            'outcomeId', outcome_row.id,
            'confirmationDeadlineAt', outcome_row.confirmation_deadline_at
          ),
          1000,
          format(
            'feedback:%s:%s',
            session_id_value,
            participant_player_id_value
          ),
          actor_player_id_value,
          correlation_id_value,
          event_id_value
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
    end loop;
  end if;

  result_value := jsonb_build_object(
    'outcome', outcome_snapshot_value,
    'eventIds', event_ids_value,
    'repeated', false
  );
  update private.trust_consumed_events_v2 consumed
  set result = result_value,
      processed_at = now()
  where consumed.event_id = event_id_value;

  return result_value;
end;
$$;

revoke all on private.activity_notification_frequency_v2
  from public, anon, authenticated;
grant all on private.activity_notification_frequency_v2 to service_role;

revoke execute on function private.jsonb_has_exact_keys_v2(jsonb, text[])
  from public, anon, authenticated;
revoke execute on function private.require_contract_uuid_v2(text, text)
  from public, anon, authenticated;
revoke execute on function private.require_contract_timestamp_v2(text, text)
  from public, anon, authenticated;
revoke execute on function private.activity_notification_target_v2(
  public.activity_item_kind_v2,
  jsonb,
  uuid
) from public, anon, authenticated;
revoke execute on function private.enqueue_activity_notification_request_v2(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke execute on function private.create_activity_item_with_events_v2(
  uuid,
  public.activity_item_kind_v2,
  jsonb,
  integer,
  text,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke execute on function private.consume_session_completed_v2(jsonb)
  from public, anon, authenticated;

grant execute on function private.consume_session_completed_v2(jsonb)
  to service_role;

comment on function private.consume_session_completed_v2(jsonb) is
  'Consumes exact session.completed.v2 participant-quorum envelopes into immutable outcomes, deduplicated feedback activity and typed notification requests.';
