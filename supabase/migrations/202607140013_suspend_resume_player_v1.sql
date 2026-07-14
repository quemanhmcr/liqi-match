-- Service-owned player suspension lifecycle. Capability preferences are stored
-- before suspension so resume restores authoritative state instead of guessing.

create table private.player_suspensions_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  suspended_lifecycle_version bigint not null,
  reason_code text not null,
  previous_discoverable boolean not null,
  previous_messaging_allowed boolean not null,
  suspended_at timestamptz not null,
  suspend_event_id uuid not null unique,
  resumed_at timestamptz,
  resumed_lifecycle_version bigint,
  resume_event_id uuid unique,
  created_at timestamptz not null default now(),
  unique (player_id, suspended_lifecycle_version),
  check (char_length(reason_code) between 2 and 120),
  check (reason_code ~ '^[a-z0-9][a-z0-9._:-]+$'),
  check (
    (resumed_at is null and resumed_lifecycle_version is null and resume_event_id is null)
    or
    (resumed_at is not null and resumed_lifecycle_version is not null and resume_event_id is not null)
  )
);

revoke all on table private.player_suspensions_v1
  from public, anon, authenticated;

create or replace function public.suspend_player_v1(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id_value uuid;
  expected_lifecycle_version bigint;
  idempotency_key_value text := nullif(command->>'idempotencyKey', '');
  reason_code_value text := nullif(command->>'reasonCode', '');
  target_account_id uuid;
  request_hash text;
  command_state record;
  player_row public.players;
  transitioned_row public.players;
  profile_id_value uuid;
  profile_version_value bigint;
  event_id_value uuid;
  occurred_at_value timestamptz;
  response_payload jsonb;
begin
  if jsonb_typeof(command) <> 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Suspension command must be a JSON object.'
    );
  end if;

  begin
    player_id_value := (command->>'playerId')::uuid;
    expected_lifecycle_version := (command->>'expectedLifecycleVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'playerId and expectedLifecycleVersion are invalid.'
    );
  end;

  if player_id_value is null
    or expected_lifecycle_version is null
    or expected_lifecycle_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'playerId and a positive expectedLifecycleVersion are required.'
    );
  end if;

  if reason_code_value is null
    or char_length(reason_code_value) not between 2 and 120
    or reason_code_value !~ '^[a-z0-9][a-z0-9._:-]+$' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'reasonCode must be a stable lowercase service code.'
    );
  end if;

  select account_id into target_account_id
  from public.players
  where id = player_id_value
    and auth_user_id is not null;

  if target_account_id is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Live canonical player identity was not found.'
    );
  end if;

  request_hash := private.command_request_hash_v1(command);
  select * into command_state
  from private.begin_command_v1(
    'suspend_player_v1',
    target_account_id,
    idempotency_key_value,
    request_hash
  );

  if command_state.repeated then
    return command_state.response || jsonb_build_object('repeated', true);
  end if;

  select * into player_row
  from public.players
  where id = player_id_value
    and account_id = target_account_id
    and auth_user_id is not null
  for update;

  if not found then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Live canonical player identity was not found.'
    );
  end if;

  if player_row.lifecycle_version <> expected_lifecycle_version then
    perform private.raise_core_error_v1(
      'lifecycle_version_conflict',
      'Player lifecycle changed on another request.',
      false,
      jsonb_build_object(
        'expectedVersion', expected_lifecycle_version,
        'actualVersion', player_row.lifecycle_version
      )
    );
  end if;

  if player_row.lifecycle_state <> 'active' then
    perform private.raise_core_error_v1(
      'invalid_lifecycle_transition',
      'Only an active player can be suspended.',
      false,
      jsonb_build_object('state', player_row.lifecycle_state)
    );
  end if;

  select id, version into profile_id_value, profile_version_value
  from public.player_profiles_v1
  where player_id = player_row.id;

  if profile_id_value is null then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Canonical ProfileId is required before suspension.'
    );
  end if;

  transitioned_row := private.transition_player_lifecycle_v1(
    player_row.id,
    player_row.lifecycle_version,
    'suspended',
    false,
    false,
    reason_code_value
  );

  occurred_at_value := transitioned_row.updated_at;
  event_id_value := extensions.gen_random_uuid();

  insert into private.player_suspensions_v1 (
    player_id,
    suspended_lifecycle_version,
    reason_code,
    previous_discoverable,
    previous_messaging_allowed,
    suspended_at,
    suspend_event_id
  ) values (
    player_row.id,
    transitioned_row.lifecycle_version,
    reason_code_value,
    player_row.discoverable,
    player_row.messaging_allowed,
    occurred_at_value,
    event_id_value
  );

  insert into private.outbox_events (
    id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    event_id_value,
    'player.suspended.v1',
    'player',
    player_row.id,
    jsonb_build_object(
      'eventId', event_id_value,
      'eventType', 'player.suspended.v1',
      'aggregateType', 'player',
      'aggregateId', player_row.id,
      'occurredAt', occurred_at_value,
      'correlationId', event_id_value,
      'causationId', null,
      'data', jsonb_build_object(
        'accountId', player_row.account_id,
        'playerId', player_row.id,
        'profileId', profile_id_value,
        'lifecycleVersion', transitioned_row.lifecycle_version,
        'profileVersion', profile_version_value,
        'reasonCode', reason_code_value
      )
    )
  );

  insert into private.audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    null,
    'player_suspended_v1',
    'player',
    player_row.id,
    jsonb_build_object(
      'eventId', event_id_value,
      'reasonCode', reason_code_value,
      'lifecycleVersion', transitioned_row.lifecycle_version
    )
  );

  response_payload := jsonb_build_object(
    'lifecycle', private.player_lifecycle_snapshot_v1(player_row.id),
    'reasonCode', reason_code_value,
    'repeated', false
  );

  perform private.finish_command_v1(
    'suspend_player_v1',
    target_account_id,
    idempotency_key_value,
    response_payload
  );

  return response_payload;
end;
$$;

create or replace function public.resume_player_v1(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id_value uuid;
  expected_lifecycle_version bigint;
  idempotency_key_value text := nullif(command->>'idempotencyKey', '');
  target_account_id uuid;
  request_hash text;
  command_state record;
  player_row public.players;
  transitioned_row public.players;
  suspension_row private.player_suspensions_v1;
  profile_id_value uuid;
  profile_version_value bigint;
  event_id_value uuid;
  occurred_at_value timestamptz;
  response_payload jsonb;
begin
  if jsonb_typeof(command) <> 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Resume command must be a JSON object.'
    );
  end if;

  begin
    player_id_value := (command->>'playerId')::uuid;
    expected_lifecycle_version := (command->>'expectedLifecycleVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'playerId and expectedLifecycleVersion are invalid.'
    );
  end;

  if player_id_value is null
    or expected_lifecycle_version is null
    or expected_lifecycle_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'playerId and a positive expectedLifecycleVersion are required.'
    );
  end if;

  select account_id into target_account_id
  from public.players
  where id = player_id_value
    and auth_user_id is not null;

  if target_account_id is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Live canonical player identity was not found.'
    );
  end if;

  request_hash := private.command_request_hash_v1(command);
  select * into command_state
  from private.begin_command_v1(
    'resume_player_v1',
    target_account_id,
    idempotency_key_value,
    request_hash
  );

  if command_state.repeated then
    return command_state.response || jsonb_build_object('repeated', true);
  end if;

  select * into player_row
  from public.players
  where id = player_id_value
    and account_id = target_account_id
    and auth_user_id is not null
  for update;

  if not found then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Live canonical player identity was not found.'
    );
  end if;

  if player_row.lifecycle_version <> expected_lifecycle_version then
    perform private.raise_core_error_v1(
      'lifecycle_version_conflict',
      'Player lifecycle changed on another request.',
      false,
      jsonb_build_object(
        'expectedVersion', expected_lifecycle_version,
        'actualVersion', player_row.lifecycle_version
      )
    );
  end if;

  if player_row.lifecycle_state <> 'suspended' then
    perform private.raise_core_error_v1(
      'invalid_lifecycle_transition',
      'Only a suspended player can be resumed.',
      false,
      jsonb_build_object('state', player_row.lifecycle_state)
    );
  end if;

  select * into suspension_row
  from private.player_suspensions_v1
  where player_id = player_row.id
    and resumed_at is null
  order by suspended_lifecycle_version desc
  limit 1
  for update;

  if not found then
    perform private.raise_core_error_v1(
      'internal_error',
      'Suspension history is missing for the suspended player.',
      true
    );
  end if;

  select id, version into profile_id_value, profile_version_value
  from public.player_profiles_v1
  where player_id = player_row.id;

  if profile_id_value is null then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Canonical ProfileId is required before resume.'
    );
  end if;

  transitioned_row := private.transition_player_lifecycle_v1(
    player_row.id,
    player_row.lifecycle_version,
    'active',
    suspension_row.previous_discoverable,
    suspension_row.previous_messaging_allowed,
    null
  );

  occurred_at_value := transitioned_row.updated_at;
  event_id_value := extensions.gen_random_uuid();

  update private.player_suspensions_v1
  set resumed_at = occurred_at_value,
      resumed_lifecycle_version = transitioned_row.lifecycle_version,
      resume_event_id = event_id_value
  where id = suspension_row.id;

  insert into private.outbox_events (
    id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    event_id_value,
    'player.resumed.v1',
    'player',
    player_row.id,
    jsonb_build_object(
      'eventId', event_id_value,
      'eventType', 'player.resumed.v1',
      'aggregateType', 'player',
      'aggregateId', player_row.id,
      'occurredAt', occurred_at_value,
      'correlationId', event_id_value,
      'causationId', suspension_row.suspend_event_id,
      'data', jsonb_build_object(
        'accountId', player_row.account_id,
        'playerId', player_row.id,
        'profileId', profile_id_value,
        'lifecycleVersion', transitioned_row.lifecycle_version,
        'profileVersion', profile_version_value,
        'reasonCode', suspension_row.reason_code
      )
    )
  );

  insert into private.audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    null,
    'player_resumed_v1',
    'player',
    player_row.id,
    jsonb_build_object(
      'eventId', event_id_value,
      'reasonCode', suspension_row.reason_code,
      'lifecycleVersion', transitioned_row.lifecycle_version,
      'suspendEventId', suspension_row.suspend_event_id
    )
  );

  response_payload := jsonb_build_object(
    'lifecycle', private.player_lifecycle_snapshot_v1(player_row.id),
    'repeated', false
  );

  perform private.finish_command_v1(
    'resume_player_v1',
    target_account_id,
    idempotency_key_value,
    response_payload
  );

  return response_payload;
end;
$$;

revoke all on function public.suspend_player_v1(jsonb)
  from public, anon, authenticated;
revoke all on function public.resume_player_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.suspend_player_v1(jsonb)
  to service_role;
grant execute on function public.resume_player_v1(jsonb)
  to service_role;
