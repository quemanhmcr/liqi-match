-- Core V2 Mission 4: persist activity.notification_requested.v2 into the
-- existing Return Loop inbox/push authority. Supplier eligibility is immutable;
-- this consumer may only add runtime suppression for lifecycle or a dismissed
-- activity. Push payloads continue to carry canonical DeepLinkV1 plus semantic
-- NotificationId/source EventId and are re-authorized after app launch.

-- Extend the canonical DeepLinkV1 database boundary additively.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraints.conname
    from pg_constraint constraints
    where constraints.conrelid = 'public.notifications_v1'::regclass
      and constraints.contype = 'c'
      and pg_get_constraintdef(constraints.oid) like '%deep_link%target%match%conversation%set%profile%'
      and pg_get_constraintdef(constraints.oid) not like '%session_feedback%'
      and pg_get_constraintdef(constraints.oid) not like '%home%'
  loop
    execute format(
      'alter table public.notifications_v1 drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.notifications_v1
  add constraint notifications_v1_deep_link_contract_v2 check (
    (
      deep_link ->> 'target' = 'match'
      and private.jsonb_has_exact_keys_v2(
        deep_link,
        array['target', 'matchId']
      )
    )
    or (
      deep_link ->> 'target' = 'conversation'
      and private.jsonb_has_exact_keys_v2(
        deep_link,
        array['target', 'conversationId']
      )
    )
    or (
      deep_link ->> 'target' = 'set'
      and private.jsonb_has_exact_keys_v2(
        deep_link,
        array['target', 'setId']
      )
    )
    or (
      deep_link ->> 'target' = 'profile'
      and private.jsonb_has_exact_keys_v2(
        deep_link,
        array['target', 'playerId']
      )
    )
    or (
      deep_link ->> 'target' = 'session_feedback'
      and private.jsonb_has_exact_keys_v2(
        deep_link,
        array['target', 'sessionId']
      )
    )
    or (
      deep_link ->> 'target' = 'home'
      and private.jsonb_has_exact_keys_v2(deep_link, array['target'])
    )
  );

create table private.activity_notification_events_v2 (
  event_id uuid primary key,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  processed_at timestamptz not null default now()
);

create table private.activity_notification_deliveries_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  recipient_player_id uuid not null references public.players(id) on delete restrict,
  activity_item_id uuid not null references public.activity_items_v2(id) on delete restrict,
  activity_deduplication_key text not null,
  semantic_hash text not null check (semantic_hash ~ '^[a-f0-9]{64}$'),
  notification_id uuid unique references public.notifications_v1(id) on delete restrict,
  notification_request_id uuid not null unique,
  source_event_id uuid not null,
  causation_id uuid not null,
  correlation_id uuid not null,
  target jsonb not null check (jsonb_typeof(target) = 'object'),
  delivery_decision jsonb not null check (jsonb_typeof(delivery_decision) = 'object'),
  inbox_status text not null check (inbox_status in (
    'not_requested', 'queued', 'suppressed_by_supplier', 'suppressed_by_delivery_runtime'
  )),
  push_status text not null check (push_status in (
    'not_requested', 'queued', 'suppressed_by_supplier', 'suppressed_by_delivery_runtime'
  )),
  runtime_suppression_reason text,
  created_at timestamptz not null default now(),
  unique (recipient_player_id, activity_deduplication_key)
);

create table private.activity_notification_click_facts_v2 (
  notification_request_id uuid primary key,
  notification_id uuid not null unique references public.notifications_v1(id) on delete restrict,
  activity_item_id uuid not null references public.activity_items_v2(id) on delete restrict,
  recipient_player_id uuid not null references public.players(id) on delete restrict,
  source_event_id uuid not null,
  correlation_id uuid not null,
  target jsonb not null check (jsonb_typeof(target) = 'object'),
  clicked_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index activity_notification_deliveries_v2_recipient_created_idx
  on private.activity_notification_deliveries_v2 (
    recipient_player_id,
    created_at desc
  );

create or replace function private.consume_activity_notification_requested_v2(
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  envelope_keys constant text[] := array[
    'eventId', 'eventType', 'eventVersion', 'aggregateType', 'aggregateId',
    'aggregateVersion', 'actorPlayerId', 'correlationId', 'causationId',
    'occurredAt', 'payload'
  ];
  request_keys constant text[] := array[
    'activityItem', 'causationId', 'correlationId', 'deliveryDecision',
    'sourceEventId', 'target'
  ];
  activity_keys constant text[] := array[
    'activityItemId', 'createdAt', 'deduplicationKey', 'dismissedAt',
    'kind', 'payload', 'playerId', 'priority', 'version'
  ];
  decision_keys constant text[] := array[
    'decisionId', 'engagementPreferencesVersion', 'evaluatedAt',
    'frequencyWindowKey', 'inboxAllowed',
    'maxReactivationNotificationsPerDay', 'pushAllowed',
    'reactivationNotificationsUsed', 'reason'
  ];
  event_id_value uuid;
  aggregate_id_value uuid;
  aggregate_version_value bigint;
  actor_player_id_value uuid;
  correlation_id_value uuid;
  event_causation_id_value uuid;
  occurred_at_value timestamptz;
  payload_value jsonb;
  request_value jsonb;
  activity_value jsonb;
  decision_value jsonb;
  target_value jsonb;
  activity_id_value uuid;
  recipient_player_id_value uuid;
  source_event_id_value uuid;
  original_causation_id_value uuid;
  activity_kind_value text;
  activity_deduplication_key_value text;
  activity_created_at_value timestamptz;
  requested_activity_version_value bigint;
  current_activity public.activity_items_v2%rowtype;
  recipient_snapshot private.return_loop_player_snapshot_v1;
  payload_hash_value text;
  semantic_hash_value text;
  existing_event private.activity_notification_events_v2%rowtype;
  existing_delivery private.activity_notification_deliveries_v2%rowtype;
  inbox_allowed_value boolean;
  push_allowed_value boolean;
  supplier_reason_value text;
  runtime_suppression_reason_value text;
  notification_id_value uuid;
  notification_request_id_value uuid := extensions.gen_random_uuid();
  notification_title_value text;
  notification_body_value text;
  deep_link_value jsonb;
  inbox_status_value text;
  push_status_value text;
  receipt_value jsonb;
  result_value jsonb;
  target_player_id_value uuid;
  target_session_id_value uuid;
  teammate_count_value integer;
begin
  if p_event is null
    or jsonb_typeof(p_event) <> 'object'
    or not private.jsonb_has_exact_keys_v2(p_event, envelope_keys) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'activity.notification_requested.v2 must use the exact Core V2 event envelope.'
    );
  end if;
  if p_event ->> 'eventType' <> 'activity.notification_requested.v2'
    or p_event ->> 'aggregateType' <> 'activity_item'
    or p_event ->> 'eventVersion' <> '2' then
    perform private.raise_core_error_v1(
      'unsupported_event_type',
      'Only activity.notification_requested.v2 eventVersion 2 is supported.'
    );
  end if;

  event_id_value := private.require_contract_uuid_v2(p_event ->> 'eventId', 'eventId');
  aggregate_id_value := private.require_contract_uuid_v2(p_event ->> 'aggregateId', 'aggregateId');
  correlation_id_value := private.require_contract_uuid_v2(p_event ->> 'correlationId', 'correlationId');
  event_causation_id_value := private.require_contract_uuid_v2(p_event ->> 'causationId', 'causationId');
  occurred_at_value := private.require_contract_timestamp_v2(p_event ->> 'occurredAt', 'occurredAt');
  if coalesce(p_event ->> 'aggregateVersion', '') !~ '^[0-9]+$' then
    perform private.raise_core_error_v1('validation_failed', 'aggregateVersion must be a positive integer.');
  end if;
  aggregate_version_value := (p_event ->> 'aggregateVersion')::bigint;
  if aggregate_version_value <= 0 then
    perform private.raise_core_error_v1('validation_failed', 'aggregateVersion must be positive.');
  end if;

  payload_value := p_event -> 'payload';
  if not private.jsonb_has_exact_keys_v2(payload_value, array['request']) then
    perform private.raise_core_error_v1('validation_failed', 'Activity notification payload must contain only request.');
  end if;
  request_value := payload_value -> 'request';
  if not private.jsonb_has_exact_keys_v2(request_value, request_keys) then
    perform private.raise_core_error_v1('validation_failed', 'Activity notification request shape is invalid.');
  end if;
  activity_value := request_value -> 'activityItem';
  decision_value := request_value -> 'deliveryDecision';
  target_value := request_value -> 'target';
  if not private.jsonb_has_exact_keys_v2(activity_value, activity_keys) then
    perform private.raise_core_error_v1('validation_failed', 'Activity item snapshot shape is invalid.');
  end if;
  if not private.jsonb_has_exact_keys_v2(decision_value, decision_keys) then
    perform private.raise_core_error_v1('validation_failed', 'Delivery decision shape is invalid.');
  end if;

  activity_id_value := private.require_contract_uuid_v2(activity_value ->> 'activityItemId', 'request.activityItem.activityItemId');
  recipient_player_id_value := private.require_contract_uuid_v2(activity_value ->> 'playerId', 'request.activityItem.playerId');
  source_event_id_value := private.require_contract_uuid_v2(request_value ->> 'sourceEventId', 'request.sourceEventId');
  original_causation_id_value := private.require_contract_uuid_v2(request_value ->> 'causationId', 'request.causationId');
  if request_value ->> 'correlationId' is distinct from correlation_id_value::text
    or event_causation_id_value <> source_event_id_value
    or aggregate_id_value <> activity_id_value then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Activity notification aggregate, causation and correlation must be preserved.'
    );
  end if;
  if p_event -> 'actorPlayerId' is not null
    and p_event -> 'actorPlayerId' <> 'null'::jsonb then
    actor_player_id_value := private.require_contract_uuid_v2(p_event ->> 'actorPlayerId', 'actorPlayerId');
    if actor_player_id_value <> recipient_player_id_value then
      perform private.raise_core_error_v1('validation_failed', 'actorPlayerId must be null or the activity recipient.');
    end if;
  end if;

  if coalesce(activity_value ->> 'version', '') !~ '^[0-9]+$'
    or coalesce(activity_value ->> 'priority', '') !~ '^[0-9]+$' then
    perform private.raise_core_error_v1('validation_failed', 'Activity version and priority must be integers.');
  end if;
  requested_activity_version_value := (activity_value ->> 'version')::bigint;
  if requested_activity_version_value <= 0
    or requested_activity_version_value <> aggregate_version_value then
    perform private.raise_core_error_v1('validation_failed', 'Activity version must equal aggregateVersion and be positive.');
  end if;
  activity_kind_value := activity_value ->> 'kind';
  if activity_kind_value not in ('feedback_prompt', 'reputation_progress', 'repeat_play_recommendation') then
    perform private.raise_core_error_v1('validation_failed', 'Unsupported activity item kind.');
  end if;
  activity_deduplication_key_value := activity_value ->> 'deduplicationKey';
  if activity_deduplication_key_value is null
    or char_length(activity_deduplication_key_value) not between 8 and 180
    or activity_deduplication_key_value !~ '^[A-Za-z0-9._:-]+$' then
    perform private.raise_core_error_v1('validation_failed', 'Activity deduplicationKey is invalid.');
  end if;
  activity_created_at_value := private.require_contract_timestamp_v2(activity_value ->> 'createdAt', 'request.activityItem.createdAt');
  if activity_value -> 'dismissedAt' is not null
    and activity_value -> 'dismissedAt' <> 'null'::jsonb then
    perform private.require_contract_timestamp_v2(activity_value ->> 'dismissedAt', 'request.activityItem.dismissedAt');
  end if;

  if coalesce(decision_value ->> 'engagementPreferencesVersion', '') !~ '^[0-9]+$'
    or (decision_value ->> 'engagementPreferencesVersion')::bigint <= 0
    or coalesce(decision_value ->> 'maxReactivationNotificationsPerDay', '') !~ '^[0-9]+$'
    or (decision_value ->> 'maxReactivationNotificationsPerDay')::integer not between 0 and 4
    or coalesce(decision_value ->> 'reactivationNotificationsUsed', '') !~ '^[0-9]+$'
    or (decision_value ->> 'reactivationNotificationsUsed')::integer < 0 then
    perform private.raise_core_error_v1('validation_failed', 'Delivery decision counters or preference version are invalid.');
  end if;
  perform private.require_contract_uuid_v2(decision_value ->> 'decisionId', 'request.deliveryDecision.decisionId');
  perform private.require_contract_timestamp_v2(decision_value ->> 'evaluatedAt', 'request.deliveryDecision.evaluatedAt');
  if coalesce(decision_value ->> 'frequencyWindowKey', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:[A-Za-z_+/.-]{2,80}$' then
    perform private.raise_core_error_v1('validation_failed', 'frequencyWindowKey is invalid.');
  end if;
  if jsonb_typeof(decision_value -> 'inboxAllowed') <> 'boolean'
    or jsonb_typeof(decision_value -> 'pushAllowed') <> 'boolean' then
    perform private.raise_core_error_v1('validation_failed', 'Delivery allowed flags must be booleans.');
  end if;
  inbox_allowed_value := (decision_value ->> 'inboxAllowed')::boolean;
  push_allowed_value := (decision_value ->> 'pushAllowed')::boolean;
  supplier_reason_value := decision_value ->> 'reason';
  if supplier_reason_value not in (
    'eligible', 'activity_disabled', 'kind_disabled', 'push_disabled', 'frequency_capped'
  )
    or (push_allowed_value and not inbox_allowed_value)
    or (supplier_reason_value = 'eligible' and (not inbox_allowed_value or not push_allowed_value))
    or (supplier_reason_value in ('activity_disabled', 'kind_disabled') and (inbox_allowed_value or push_allowed_value))
    or (supplier_reason_value in ('push_disabled', 'frequency_capped') and (not inbox_allowed_value or push_allowed_value))
    or (
      supplier_reason_value = 'frequency_capped'
      and (decision_value ->> 'reactivationNotificationsUsed')::integer
        < (decision_value ->> 'maxReactivationNotificationsPerDay')::integer
    ) then
    perform private.raise_core_error_v1('validation_failed', 'Delivery decision semantics are inconsistent.');
  end if;

  if activity_kind_value = 'feedback_prompt' then
    if not private.jsonb_has_exact_keys_v2(target_value, array['outcomeId', 'sessionId', 'target'])
      or target_value ->> 'target' <> 'session_feedback' then
      perform private.raise_core_error_v1('validation_failed', 'Feedback activity requires a session_feedback target.');
    end if;
    target_session_id_value := private.require_contract_uuid_v2(target_value ->> 'sessionId', 'request.target.sessionId');
    if target_value -> 'outcomeId' is not null and target_value -> 'outcomeId' <> 'null'::jsonb then
      perform private.require_contract_uuid_v2(target_value ->> 'outcomeId', 'request.target.outcomeId');
    end if;
    if target_session_id_value::text is distinct from activity_value #>> '{payload,sessionId}' then
      perform private.raise_core_error_v1('validation_failed', 'Feedback target session must match activity payload.');
    end if;
    deep_link_value := jsonb_build_object('target', 'session_feedback', 'sessionId', target_session_id_value);
    notification_title_value := 'Hoàn tất phản hồi buổi chơi';
    notification_body_value := 'Xác nhận tham gia và ghi nhận đồng đội sau session.';
  elsif activity_kind_value = 'reputation_progress' then
    if not private.jsonb_has_exact_keys_v2(target_value, array['playerId', 'target'])
      or target_value ->> 'target' <> 'reputation' then
      perform private.raise_core_error_v1('validation_failed', 'Reputation activity requires a reputation target.');
    end if;
    target_player_id_value := private.require_contract_uuid_v2(target_value ->> 'playerId', 'request.target.playerId');
    if target_player_id_value <> recipient_player_id_value then
      perform private.raise_core_error_v1('validation_failed', 'Reputation target must be the activity recipient.');
    end if;
    deep_link_value := jsonb_build_object('target', 'profile', 'playerId', target_player_id_value);
    notification_title_value := 'Thành tích đã xác minh mới';
    notification_body_value := 'Trust profile của bạn vừa được cập nhật từ dữ liệu buổi chơi.';
  else
    if not private.jsonb_has_exact_keys_v2(target_value, array['sourceSessionId', 'target', 'teammatePlayerIds'])
      or target_value ->> 'target' <> 'repeat_play'
      or jsonb_typeof(target_value -> 'teammatePlayerIds') <> 'array' then
      perform private.raise_core_error_v1('validation_failed', 'Repeat activity requires a repeat_play target.');
    end if;
    teammate_count_value := jsonb_array_length(target_value -> 'teammatePlayerIds');
    if teammate_count_value not between 1 and 4
      or exists (
        select 1
        from jsonb_array_elements_text(target_value -> 'teammatePlayerIds') teammate(value)
        where private.require_contract_uuid_v2(teammate.value, 'request.target.teammatePlayerIds[]') = recipient_player_id_value
      )
      or teammate_count_value <> (
        select count(distinct teammate.value)
        from jsonb_array_elements_text(target_value -> 'teammatePlayerIds') teammate(value)
      ) then
      perform private.raise_core_error_v1('validation_failed', 'Repeat teammates must be unique and exclude the recipient.');
    end if;
    if target_value -> 'sourceSessionId' is not null and target_value -> 'sourceSessionId' <> 'null'::jsonb then
      perform private.require_contract_uuid_v2(target_value ->> 'sourceSessionId', 'request.target.sourceSessionId');
    end if;
    deep_link_value := jsonb_build_object('target', 'home');
    notification_title_value := 'Chơi lại cùng đồng đội';
    notification_body_value := 'Một đồng đội đã chơi cùng bạn đang sẵn sàng cho session tiếp theo.';
  end if;

  select activity.* into current_activity
  from public.activity_items_v2 activity
  where activity.id = activity_id_value
  for update;
  if current_activity.id is null
    or current_activity.player_id <> recipient_player_id_value
    or current_activity.kind::text <> activity_kind_value
    or current_activity.payload <> activity_value -> 'payload'
    or current_activity.priority <> (activity_value ->> 'priority')::integer
    or current_activity.deduplication_key <> activity_deduplication_key_value
    or current_activity.created_at <> activity_created_at_value
    or current_activity.version < requested_activity_version_value then
    perform private.raise_core_error_v1('activity_notification_snapshot_conflict', 'The activity snapshot no longer matches its authority row.');
  end if;
  if current_activity.version <> requested_activity_version_value then
    if current_activity.dismissed_at is null then
      perform private.raise_core_error_v1('activity_notification_snapshot_conflict', 'Only an authoritative dismissal may advance activity version before delivery.');
    end if;
    runtime_suppression_reason_value := 'activity_dismissed_before_delivery';
  elsif current_activity.dismissed_at is not null then
    runtime_suppression_reason_value := 'activity_dismissed_before_delivery';
  end if;

  payload_hash_value := private.command_request_hash_v1(p_event);
  semantic_hash_value := private.command_request_hash_v1(jsonb_build_object(
    'activityItem', activity_value,
    'causationId', original_causation_id_value,
    'correlationId', correlation_id_value,
    'deliveryDecision', decision_value,
    'target', target_value
  ));
  perform pg_advisory_xact_lock(hashtextextended(event_id_value::text, 0));
  select events.* into existing_event
  from private.activity_notification_events_v2 events
  where events.event_id = event_id_value;
  if existing_event.event_id is not null then
    if existing_event.payload_hash <> payload_hash_value then
      perform private.raise_core_error_v1('activity_notification_event_replay_conflict', 'The eventId was replayed with different delivery facts.');
    end if;
    return jsonb_set(existing_event.result, '{repeated}', 'true'::jsonb, true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    recipient_player_id_value::text || ':' || activity_deduplication_key_value,
    0
  ));
  select deliveries.* into existing_delivery
  from private.activity_notification_deliveries_v2 deliveries
  where deliveries.recipient_player_id = recipient_player_id_value
    and deliveries.activity_deduplication_key = activity_deduplication_key_value;
  if existing_delivery.id is not null then
    if existing_delivery.semantic_hash <> semantic_hash_value then
      perform private.raise_core_error_v1('activity_notification_dedup_conflict', 'The recipient activity deduplication key was rebound to different delivery facts.');
    end if;
    result_value := jsonb_build_object(
      'activityItemId', existing_delivery.activity_item_id,
      'correlationId', existing_delivery.correlation_id,
      'deduplicationKey', existing_delivery.activity_deduplication_key,
      'inboxStatus', existing_delivery.inbox_status,
      'notificationRequestId', existing_delivery.notification_request_id,
      'processed', true,
      'pushStatus', existing_delivery.push_status,
      'recipientPlayerId', existing_delivery.recipient_player_id,
      'repeated', true,
      'sourceEventId', existing_delivery.source_event_id,
      'target', existing_delivery.target
    );
    insert into private.activity_notification_events_v2(event_id, payload_hash, result)
    values (event_id_value, payload_hash_value, result_value);
    return result_value;
  end if;

  recipient_snapshot := private.require_return_loop_player_snapshot_by_player_v1(
    recipient_player_id_value,
    false
  );
  if recipient_snapshot.state <> 'active' then
    runtime_suppression_reason_value := 'recipient_lifecycle_' || recipient_snapshot.state;
  end if;

  if runtime_suppression_reason_value is not null then
    inbox_status_value := 'suppressed_by_delivery_runtime';
    push_status_value := 'suppressed_by_delivery_runtime';
  elsif not inbox_allowed_value then
    inbox_status_value := 'suppressed_by_supplier';
    push_status_value := 'suppressed_by_supplier';
  else
    notification_id_value := extensions.gen_random_uuid();
    insert into public.notifications_v1 (
      id, recipient_player_id, kind, source_event_id, occurred_at,
      deep_link, title, body, metadata
    ) values (
      notification_id_value,
      recipient_player_id_value,
      'system',
      event_id_value,
      occurred_at_value,
      deep_link_value,
      notification_title_value,
      notification_body_value,
      jsonb_build_object(
        'contract', 'activity.notification_requested.v2',
        'activityItemId', activity_id_value,
        'activityKind', activity_kind_value,
        'activityDeduplicationKey', activity_deduplication_key_value,
        'notificationRequestId', notification_request_id_value,
        'sourceActivityEventId', source_event_id_value,
        'originalCausationId', original_causation_id_value,
        'correlationId', correlation_id_value,
        'target', target_value,
        'deliveryDecision', decision_value
      )
    );
    inbox_status_value := 'queued';
    if push_allowed_value then
      insert into private.notification_push_jobs_v1 (
        notification_id,
        recipient_player_id,
        foreground_policy,
        status,
        available_at,
        expires_at
      ) values (
        notification_id_value,
        recipient_player_id_value,
        'allow_push',
        'pending',
        now(),
        now() + interval '24 hours'
      );
      push_status_value := 'queued';
    else
      push_status_value := 'suppressed_by_supplier';
    end if;
  end if;

  receipt_value := jsonb_build_object(
    'activityItemId', activity_id_value,
    'correlationId', correlation_id_value,
    'deduplicationKey', activity_deduplication_key_value,
    'inboxStatus', inbox_status_value,
    'notificationRequestId', notification_request_id_value,
    'pushStatus', push_status_value,
    'recipientPlayerId', recipient_player_id_value,
    'repeated', false,
    'sourceEventId', source_event_id_value,
    'target', target_value
  );
  insert into private.activity_notification_deliveries_v2 (
    recipient_player_id, activity_item_id, activity_deduplication_key,
    semantic_hash, notification_id, notification_request_id, source_event_id,
    causation_id, correlation_id, target, delivery_decision,
    inbox_status, push_status, runtime_suppression_reason
  ) values (
    recipient_player_id_value, activity_id_value, activity_deduplication_key_value,
    semantic_hash_value, notification_id_value, notification_request_id_value,
    source_event_id_value, original_causation_id_value, correlation_id_value,
    target_value, decision_value, inbox_status_value, push_status_value,
    runtime_suppression_reason_value
  );

  perform private.enqueue_contract_event_v2(
    'notification.requested.v2',
    'notification_request',
    notification_request_id_value,
    1,
    null,
    correlation_id_value,
    source_event_id_value,
    jsonb_build_object('receipt', receipt_value),
    format('notification-requested-v2:%s', notification_request_id_value)
  );

  result_value := receipt_value || jsonb_build_object('processed', true);
  insert into private.activity_notification_events_v2(event_id, payload_hash, result)
  values (event_id_value, payload_hash_value, result_value);
  return result_value;
end;
$$;

-- Dispatch Core V2 activity notification events through the existing Return
-- Loop consumer without changing the shared-outbox ownership model.
create or replace function private.consume_return_loop_event_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := (p_event ->> 'eventId')::uuid;
  event_type text := p_event ->> 'eventType';
  config private.return_loop_config_v1%rowtype;
  result jsonb;
begin
  if event_type = 'activity.notification_requested.v2' then
    select * into config from private.return_loop_config_v1 where singleton;
    if not config.event_consumer_enabled then
      return jsonb_build_object(
        'eventId', event_id,
        'processed', false,
        'reason', 'event_consumer_disabled'
      );
    end if;
    return private.consume_activity_notification_requested_v2(p_event);
  end if;

  if event_type not in ('player.suspended.v1', 'player.resumed.v1') then
    result := private.consume_return_loop_event_without_suspension_v1(p_event);
    if event_type = 'player.deleted.v1'
      and coalesce((result ->> 'processed')::boolean, false) then
      delete from private.notification_presence_v1
      where player_id = (p_event -> 'data' ->> 'playerId')::uuid;
      delete from private.home_lifecycle_projection_watermarks_v1
      where player_id = (p_event -> 'data' ->> 'playerId')::uuid;
    end if;
    return result;
  end if;

  if event_id is null then
    raise exception 'Invalid CoreEventV1 envelope'
      using errcode = '22023', detail = 'contract_validation_failed';
  end if;
  select * into config from private.return_loop_config_v1 where singleton;
  if not config.event_consumer_enabled then
    return jsonb_build_object(
      'eventId', event_id,
      'processed', false,
      'reason', 'event_consumer_disabled'
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(event_id::text, 0));
  if exists (
    select 1 from private.return_loop_processed_events_v1 processed
    where processed.event_id = consume_return_loop_event_v1.event_id
  ) then
    return jsonb_build_object('eventId', event_id, 'processed', true, 'repeated', true);
  end if;
  result := private.consume_return_loop_suspension_event_v1(p_event);
  insert into private.return_loop_processed_events_v1(event_id, event_type, occurred_at)
  values (event_id, event_type, (p_event ->> 'occurredAt')::timestamptz);
  return result;
end;
$$;

create or replace function public.process_pending_return_loop_events_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  consumer_response jsonb;
  selected_count integer := 0;
  processed_count integer := 0;
  repeated_count integer := 0;
  deferred_count integer := 0;
  failed_count integer := 0;
  processed_event_ids jsonb := '[]'::jsonb;
  failures jsonb := '[]'::jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Return Loop dispatch size'
      using errcode = '22023', detail = 'validation_failed';
  end if;
  for event_row in
    select event.id, event.payload
    from private.outbox_events event
    where event.available_at <= now()
      and (
        (
          event.contract_version = 1
          and event.event_type in (
            'player.activated.v1', 'player.profile_updated.v1',
            'player.suspended.v1', 'player.resumed.v1',
            'player.deletion_requested.v1', 'player.deleted.v1',
            'match.created.v1', 'notification.requested.v1',
            'conversation.created.v1', 'message.sent.v1',
            'conversation.read_advanced.v1'
          )
          and not exists (
            select 1 from private.return_loop_processed_events_v1 processed
            where processed.event_id = event.id
          )
        )
        or (
          event.contract_version = 2
          and event.event_type = 'activity.notification_requested.v2'
          and not exists (
            select 1 from private.activity_notification_events_v2 processed
            where processed.event_id = event.id
          )
        )
      )
    order by event.available_at, event.created_at, event.id
    limit p_limit
    for update of event skip locked
  loop
    selected_count := selected_count + 1;
    begin
      consumer_response := private.consume_return_loop_event_v1(event_row.payload);
      if coalesce((consumer_response ->> 'processed')::boolean, false) then
        processed_count := processed_count + 1;
        repeated_count := repeated_count + case
          when coalesce((consumer_response ->> 'repeated')::boolean, false) then 1 else 0 end;
        processed_event_ids := processed_event_ids || jsonb_build_array(event_row.id);
      else
        deferred_count := deferred_count + 1;
      end if;
    exception when others then
      failed_count := failed_count + 1;
      failures := failures || jsonb_build_array(jsonb_build_object(
        'eventId', event_row.id,
        'message', sqlerrm,
        'sqlstate', sqlstate
      ));
    end;
  end loop;
  return jsonb_build_object(
    'deferredCount', deferred_count,
    'failedCount', failed_count,
    'failures', failures,
    'processedCount', processed_count,
    'processedEventIds', processed_event_ids,
    'repeatedCount', repeated_count,
    'selectedCount', selected_count
  );
end;
$$;

create or replace function public.claim_return_loop_events_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_events jsonb;
begin
  if p_limit not between 1 and 500 then
    raise exception 'Invalid event claim size'
      using errcode = '22023', detail = 'validation_failed';
  end if;
  with candidates as (
    select event.id
    from private.outbox_events event
    where event.status = 'pending'
      and event.available_at <= now()
      and (
        (
          event.contract_version = 1
          and event.event_type in (
            'player.activated.v1', 'player.profile_updated.v1',
            'player.suspended.v1', 'player.resumed.v1',
            'player.deletion_requested.v1', 'player.deleted.v1',
            'match.created.v1', 'notification.requested.v1',
            'conversation.created.v1', 'message.sent.v1',
            'conversation.read_advanced.v1'
          )
        )
        or (
          event.contract_version = 2
          and event.event_type = 'activity.notification_requested.v2'
        )
      )
    order by event.available_at, event.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.outbox_events event
    set status = 'processing',
        attempt_count = event.attempt_count + 1,
        last_error = null
    from candidates
    where event.id = candidates.id
    returning event.id, event.payload, event.attempt_count
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'outboxId', claimed.id,
    'event', claimed.payload,
    'attempt', claimed.attempt_count
  ) order by claimed.id), '[]'::jsonb)
  into claimed_events
  from claimed;
  return claimed_events;
end;
$$;

-- Keep the existing resolver for legacy targets and wrap it for the two additive
-- activity destinations. The wrapper remains the sole client authorization seam.
alter function public.resolve_notification_deep_link_v1(uuid, uuid)
  rename to resolve_notification_deep_link_without_activity_v1;

create or replace function public.resolve_notification_deep_link_v1(
  p_notification_id uuid,
  p_source_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.return_loop_player_snapshot_v1;
  notification public.notifications_v1%rowtype;
  target_name text;
  target_exists boolean := false;
  resolution_status public.notification_deep_link_resolution_status_v1;
  transition_time timestamptz := clock_timestamp();
  notification_read_at timestamptz;
  delivery private.activity_notification_deliveries_v2%rowtype;
  existing_click private.activity_notification_click_facts_v2%rowtype;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;
  actor_snapshot := private.require_return_loop_player_snapshot_by_account_v1(actor_account_id, false);
  select persisted.* into notification
  from public.notifications_v1 persisted
  where persisted.id = p_notification_id
    and persisted.source_event_id = p_source_event_id
    and persisted.recipient_player_id = actor_snapshot.player_id;

  target_name := notification.deep_link ->> 'target';
  if notification.id is null or target_name not in ('session_feedback', 'home') then
    return public.resolve_notification_deep_link_without_activity_v1(
      p_notification_id,
      p_source_event_id
    );
  end if;

  if not private.return_loop_feature_enabled_v1('deep_link', actor_account_id) then
    resolution_status := 'disabled';
  else
    select persisted.* into notification
    from public.notifications_v1 persisted
    where persisted.id = p_notification_id
      and persisted.source_event_id = p_source_event_id
      and persisted.recipient_player_id = actor_snapshot.player_id
    for update;
    update public.notifications_v1
    set seen_at = coalesce(seen_at, transition_time),
        read_at = coalesce(read_at, greatest(transition_time, coalesce(seen_at, transition_time)))
    where id = notification.id
    returning read_at into notification_read_at;

    if actor_snapshot.state in ('registered', 'onboarding') then
      resolution_status := 'defer_lifecycle';
    elsif actor_snapshot.state in ('suspended', 'deleting', 'deleted') then
      resolution_status := 'player_unavailable';
    elsif actor_snapshot.state <> 'active' then
      resolution_status := 'provider_unavailable';
    elsif target_name = 'home' then
      resolution_status := 'available';
    else
      begin
        select exists (
          select 1
          from public.session_outcomes_v2 outcome
          where outcome.session_id = (notification.deep_link ->> 'sessionId')::uuid
            and actor_snapshot.player_id = any(outcome.participant_player_ids)
        ) into target_exists;
        resolution_status := case
          when target_exists then 'available'
          when exists (
            select 1 from public.session_outcomes_v2 outcome
            where outcome.session_id = (notification.deep_link ->> 'sessionId')::uuid
          ) then 'expired'::public.notification_deep_link_resolution_status_v1
          else 'defer_target'::public.notification_deep_link_resolution_status_v1
        end;
      exception when invalid_text_representation then
        resolution_status := 'expired';
      end;
    end if;
  end if;

  insert into private.notification_deep_link_attempts_v1 (
    notification_id, source_event_id, account_id, player_id, target, status, resolved_at
  ) values (
    p_notification_id, p_source_event_id, actor_account_id,
    actor_snapshot.player_id, target_name, resolution_status, transition_time
  );

  if resolution_status = 'available' then
    select deliveries.* into delivery
    from private.activity_notification_deliveries_v2 deliveries
    where deliveries.notification_id = notification.id;
    if delivery.id is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(delivery.notification_request_id::text, 0)
      );
      select facts.* into existing_click
      from private.activity_notification_click_facts_v2 facts
      where facts.notification_request_id = delivery.notification_request_id
      for update;
      if existing_click.notification_request_id is not null then
        if existing_click.notification_id <> notification.id
          or existing_click.activity_item_id <> delivery.activity_item_id
          or existing_click.recipient_player_id <> delivery.recipient_player_id
          or existing_click.source_event_id <> delivery.source_event_id
          or existing_click.correlation_id <> delivery.correlation_id
          or existing_click.target <> delivery.target then
          perform private.raise_core_error_v1(
            'activity_notification_click_conflict',
            'The notification request click identity was rebound to different correlation facts.'
          );
        end if;
        update private.activity_notification_click_facts_v2 facts
        set clicked_at = least(facts.clicked_at, transition_time)
        where facts.notification_request_id = delivery.notification_request_id;
      else
        insert into private.activity_notification_click_facts_v2 (
          notification_request_id, notification_id, activity_item_id,
          recipient_player_id, source_event_id, correlation_id, target, clicked_at
        ) values (
          delivery.notification_request_id, notification.id, delivery.activity_item_id,
          delivery.recipient_player_id, delivery.source_event_id,
          delivery.correlation_id, delivery.target, transition_time
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'notificationId', p_notification_id,
    'status', resolution_status,
    'deepLink', notification.deep_link,
    'playerLifecycle', actor_snapshot.state,
    'readAt', notification_read_at,
    'resolvedAt', transition_time
  );
end;
$$;

revoke all on private.activity_notification_events_v2
  from public, anon, authenticated;
revoke all on private.activity_notification_deliveries_v2
  from public, anon, authenticated;
revoke all on private.activity_notification_click_facts_v2
  from public, anon, authenticated;
grant all on private.activity_notification_events_v2 to service_role;
grant all on private.activity_notification_deliveries_v2 to service_role;
grant all on private.activity_notification_click_facts_v2 to service_role;

revoke execute on function private.consume_activity_notification_requested_v2(jsonb)
  from public, anon, authenticated;
grant execute on function private.consume_activity_notification_requested_v2(jsonb)
  to service_role;
revoke execute on function private.consume_return_loop_event_v1(jsonb)
  from public, anon, authenticated;
grant execute on function private.consume_return_loop_event_v1(jsonb)
  to service_role;
revoke execute on function public.resolve_notification_deep_link_without_activity_v1(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.resolve_notification_deep_link_v1(uuid, uuid)
  from public, anon;
grant execute on function public.resolve_notification_deep_link_v1(uuid, uuid)
  to authenticated;

comment on function private.consume_activity_notification_requested_v2(jsonb) is
  'Consumes exact Core V2 activity notification requests into the canonical Return Loop inbox/push authority with event replay, semantic deduplication and lifecycle/dismiss suppression.';
