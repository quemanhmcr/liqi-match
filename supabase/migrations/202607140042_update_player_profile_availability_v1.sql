-- Atomic Availability-section profile read/write seam. Canonical profile
-- version remains authoritative; public.availability_slots and profiles.timezone
-- remain the legacy projection consumed by existing readers.

create or replace function private.profile_availability_snapshot_v1(
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  player_row public.players;
  canonical_profile_row public.player_profiles_v1;
  legacy_profile_row public.profiles;
  slot_count integer := 0;
  slots_value jsonb := '[]'::jsonb;
begin
  select * into player_row
  from public.players
  where id = p_player_id;

  if not found then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Canonical player identity was not found.'
    );
  end if;

  select * into canonical_profile_row
  from public.player_profiles_v1
  where player_id = p_player_id;

  if not found or canonical_profile_row.legacy_profile_id is null then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Canonical profile mapping is incomplete.'
    );
  end if;

  select * into legacy_profile_row
  from public.profiles
  where id = canonical_profile_row.legacy_profile_id
    and deleted_at is null;

  if not found then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Legacy profile projection was not found.'
    );
  end if;

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', slots.day_of_week,
          'endMinute', case
            when slots.ends_at = time '23:59:59' then 1440
            else extract(hour from slots.ends_at)::integer * 60
              + extract(minute from slots.ends_at)::integer
          end,
          'startMinute', extract(hour from slots.starts_at)::integer * 60
            + extract(minute from slots.starts_at)::integer
        )
        order by slots.day_of_week, slots.starts_at, slots.ends_at, slots.id
      ),
      '[]'::jsonb
    )
  into slot_count, slots_value
  from public.availability_slots as slots
  where slots.profile_id = canonical_profile_row.legacy_profile_id;

  return jsonb_build_object(
    'availability', case
      when slot_count = 0 then null
      else jsonb_build_object(
        'slots', slots_value,
        'timezone', legacy_profile_row.timezone
      )
    end,
    'playerId', player_row.id,
    'profileId', canonical_profile_row.id,
    'profileVersion', canonical_profile_row.version
  );
end;
$$;

create or replace function public.get_own_player_profile_availability_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  player_id_value uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  select id into player_id_value
  from public.players
  where account_id = actor_account_id
    and auth_user_id = actor_account_id;

  if player_id_value is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Canonical player identity was not found.'
    );
  end if;

  return private.profile_availability_snapshot_v1(player_id_value);
end;
$$;

create or replace function public.update_player_profile_availability_v1(
  command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  availability_value jsonb := command->'availability';
  idempotency_key_value text := nullif(command->>'idempotencyKey', '');
  expected_profile_version bigint;
  timezone_value text;
  request_hash text;
  command_state record;
  player_row public.players;
  canonical_profile_row public.player_profiles_v1;
  legacy_profile_id_value uuid;
  slot_value jsonb;
  day_numeric numeric;
  start_numeric numeric;
  end_numeric numeric;
  day_value integer;
  start_minute_value integer;
  end_minute_value integer;
  overlap_exists boolean := false;
  event_id_value uuid;
  occurred_at_value timestamptz;
  response_payload jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  if jsonb_typeof(command) <> 'object'
    or (command - 'availability' - 'expectedProfileVersion' - 'idempotencyKey')
      <> '{}'::jsonb
    or not command ? 'availability'
    or not command ? 'expectedProfileVersion'
    or not command ? 'idempotencyKey' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Profile availability command has an invalid shape.'
    );
  end if;

  begin
    expected_profile_version := (command->>'expectedProfileVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedProfileVersion must be a non-negative integer.'
    );
  end;

  if expected_profile_version is null or expected_profile_version < 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedProfileVersion must be a non-negative integer.'
    );
  end if;

  if jsonb_typeof(availability_value) not in ('object', 'null') then
    perform private.raise_core_error_v1(
      'validation_failed',
      'availability must be a canonical object or null.'
    );
  end if;

  if jsonb_typeof(availability_value) = 'object' then
    if (availability_value - 'slots' - 'timezone') <> '{}'::jsonb
      or jsonb_typeof(availability_value->'slots') <> 'array'
      or jsonb_typeof(availability_value->'timezone') <> 'string'
      or jsonb_array_length(availability_value->'slots') not between 1 and 84 then
      perform private.raise_core_error_v1(
        'validation_failed',
        'availability must contain timezone and between 1 and 84 slots.'
      );
    end if;

    timezone_value := nullif(btrim(availability_value->>'timezone'), '');
    if timezone_value is null or char_length(timezone_value) > 80 then
      perform private.raise_core_error_v1(
        'validation_failed',
        'availability timezone is invalid.'
      );
    end if;

    for slot_value in
      select value from jsonb_array_elements(availability_value->'slots')
    loop
      if jsonb_typeof(slot_value) <> 'object'
        or (slot_value - 'dayOfWeek' - 'endMinute' - 'startMinute')
          <> '{}'::jsonb
        or jsonb_typeof(slot_value->'dayOfWeek') <> 'number'
        or jsonb_typeof(slot_value->'endMinute') <> 'number'
        or jsonb_typeof(slot_value->'startMinute') <> 'number' then
        perform private.raise_core_error_v1(
          'validation_failed',
          'availability slot has an invalid shape.'
        );
      end if;

      begin
        day_numeric := (slot_value->>'dayOfWeek')::numeric;
        start_numeric := (slot_value->>'startMinute')::numeric;
        end_numeric := (slot_value->>'endMinute')::numeric;
      exception when others then
        perform private.raise_core_error_v1(
          'validation_failed',
          'availability slot values must be integers.'
        );
      end;

      if day_numeric <> trunc(day_numeric)
        or start_numeric <> trunc(start_numeric)
        or end_numeric <> trunc(end_numeric)
        or day_numeric not between 0 and 6
        or start_numeric not between 0 and 1439
        or end_numeric not between 1 and 1440
        or end_numeric <= start_numeric then
        perform private.raise_core_error_v1(
          'validation_failed',
          'availability slots must be canonical non-overlapping intervals.'
        );
      end if;
    end loop;

    select exists (
      with parsed_slots as (
        select
          ordinality,
          (value->>'dayOfWeek')::integer as day_of_week,
          (value->>'startMinute')::integer as start_minute,
          (value->>'endMinute')::integer as end_minute
        from jsonb_array_elements(availability_value->'slots')
          with ordinality as items(value, ordinality)
      )
      select 1
      from parsed_slots as left_slot
      join parsed_slots as right_slot
        on left_slot.ordinality < right_slot.ordinality
       and left_slot.day_of_week = right_slot.day_of_week
       and left_slot.start_minute < right_slot.end_minute
       and right_slot.start_minute < left_slot.end_minute
    ) into overlap_exists;

    if overlap_exists then
      perform private.raise_core_error_v1(
        'validation_failed',
        'availability slots cannot overlap.'
      );
    end if;
  end if;

  request_hash := private.command_request_hash_v1(command);
  select * into command_state
  from private.begin_command_v1(
    'update_player_profile_availability_v1',
    actor_account_id,
    idempotency_key_value,
    request_hash
  );

  if command_state.repeated then
    return command_state.response || jsonb_build_object('repeated', true);
  end if;

  select * into player_row
  from public.players
  where account_id = actor_account_id
    and auth_user_id = actor_account_id
  for update;

  if not found then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Canonical player identity was not found.'
    );
  end if;

  if player_row.lifecycle_state <> 'active' then
    perform private.raise_core_error_v1(
      case player_row.lifecycle_state
        when 'suspended' then 'player_suspended'
        when 'deleting' then 'player_deleting'
        when 'deleted' then 'player_deleted'
        else 'lifecycle_not_active'
      end,
      'Profile updates require an active player.',
      false,
      jsonb_build_object('state', player_row.lifecycle_state)
    );
  end if;

  select * into canonical_profile_row
  from public.player_profiles_v1
  where player_id = player_row.id
  for update;

  if not found or canonical_profile_row.legacy_profile_id is null then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Canonical profile mapping is incomplete.'
    );
  end if;

  if canonical_profile_row.version <> expected_profile_version then
    perform private.raise_core_error_v1(
      'profile_version_conflict',
      'Player profile changed on another request.',
      false,
      jsonb_build_object(
        'expectedVersion', expected_profile_version,
        'actualVersion', canonical_profile_row.version
      )
    );
  end if;

  legacy_profile_id_value := canonical_profile_row.legacy_profile_id;

  perform 1
  from public.profiles
  where id = legacy_profile_id_value
    and deleted_at is null
  for update;

  if not found then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Legacy profile projection was not found.'
    );
  end if;

  delete from public.availability_slots
  where profile_id = legacy_profile_id_value;

  if jsonb_typeof(availability_value) = 'object' then
    update public.profiles
    set timezone = timezone_value
    where id = legacy_profile_id_value;

    for slot_value in
      select value
      from jsonb_array_elements(availability_value->'slots')
      order by
        (value->>'dayOfWeek')::integer,
        (value->>'startMinute')::integer,
        (value->>'endMinute')::integer
    loop
      day_value := (slot_value->>'dayOfWeek')::integer;
      start_minute_value := (slot_value->>'startMinute')::integer;
      end_minute_value := (slot_value->>'endMinute')::integer;

      insert into public.availability_slots (
        profile_id,
        day_of_week,
        starts_at,
        ends_at
      ) values (
        legacy_profile_id_value,
        day_value,
        make_time(start_minute_value / 60, start_minute_value % 60, 0),
        case
          when end_minute_value = 1440 then time '23:59:59'
          else make_time(end_minute_value / 60, end_minute_value % 60, 0)
        end
      );
    end loop;
  end if;

  occurred_at_value := now();
  update public.player_profiles_v1
  set version = version + 1,
      updated_at = occurred_at_value
  where id = canonical_profile_row.id
  returning * into canonical_profile_row;

  event_id_value := extensions.gen_random_uuid();
  insert into private.outbox_events (
    id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    event_id_value,
    'player.profile_updated.v1',
    'player',
    player_row.id,
    jsonb_build_object(
      'eventId', event_id_value,
      'eventType', 'player.profile_updated.v1',
      'aggregateType', 'player',
      'aggregateId', player_row.id,
      'occurredAt', occurred_at_value,
      'correlationId', event_id_value,
      'causationId', null,
      'data', jsonb_build_object(
        'accountId', player_row.account_id,
        'playerId', player_row.id,
        'profileId', canonical_profile_row.id,
        'lifecycleVersion', player_row.lifecycle_version,
        'profileVersion', canonical_profile_row.version
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
    actor_account_id,
    'player_profile_availability_updated_v1',
    'player_profile',
    canonical_profile_row.id,
    jsonb_build_object(
      'eventId', event_id_value,
      'profileVersion', canonical_profile_row.version,
      'slotCount', case
        when jsonb_typeof(availability_value) = 'object'
          then jsonb_array_length(availability_value->'slots')
        else 0
      end
    )
  );

  response_payload := private.profile_availability_snapshot_v1(player_row.id)
    || jsonb_build_object('repeated', false);

  perform private.finish_command_v1(
    'update_player_profile_availability_v1',
    actor_account_id,
    idempotency_key_value,
    response_payload
  );

  return response_payload;
end;
$$;

revoke all on function private.profile_availability_snapshot_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.get_own_player_profile_availability_v1()
  from public, anon, authenticated;
revoke all on function public.update_player_profile_availability_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.get_own_player_profile_availability_v1()
  to authenticated, service_role;
grant execute on function public.update_player_profile_availability_v1(jsonb)
  to authenticated, service_role;
