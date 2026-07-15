-- Preserve the V1 profile identity command shape for mobile compatibility,
-- but enforce the Core V2 trust cutover at the authoritative write boundary.
-- Client-provided identity.stats remain part of request hashing/validation only;
-- they are never persisted as trusted profile facts.

create or replace function public.update_player_profile_identity_v1(
  command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  identity_value jsonb := command->'identity';
  idempotency_key_value text := nullif(command->>'idempotencyKey', '');
  expected_profile_version bigint;
  display_name_value text;
  bio_value text;
  gender_value text;
  status_value text;
  matches_numeric numeric;
  rating_numeric numeric;
  reputation_numeric numeric;
  win_rate_numeric numeric;
  request_hash text;
  command_state record;
  player_row public.players;
  canonical_profile_row public.player_profiles_v1;
  legacy_profile_id_value uuid;
  media_summary_value jsonb;
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
    or jsonb_typeof(identity_value) <> 'object'
    or jsonb_typeof(identity_value->'stats') <> 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Profile identity command must be an object with identity.stats.'
    );
  end if;

  begin
    expected_profile_version := (command->>'expectedProfileVersion')::bigint;
    matches_numeric := (identity_value #>> '{stats,matches}')::numeric;
    rating_numeric := (identity_value #>> '{stats,rating}')::numeric;
    reputation_numeric := (identity_value #>> '{stats,reputation}')::numeric;
    win_rate_numeric := (identity_value #>> '{stats,winRate}')::numeric;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Profile version and statistics must be valid numbers.'
    );
  end;

  if expected_profile_version is null or expected_profile_version < 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedProfileVersion must be a non-negative integer.'
    );
  end if;

  display_name_value := nullif(btrim(identity_value->>'displayName'), '');
  bio_value := coalesce(identity_value->>'bio', '');
  gender_value := identity_value->>'genderId';
  status_value := identity_value->>'status';

  if display_name_value is null
    or char_length(display_name_value) not between 2 and 40 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'displayName must be between 2 and 40 characters.'
    );
  end if;

  if char_length(bio_value) > 80 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'bio must contain at most 80 characters.'
    );
  end if;

  if gender_value is not null
    and gender_value not in ('male', 'female', 'hidden') then
    perform private.raise_core_error_v1(
      'validation_failed',
      'genderId is invalid.'
    );
  end if;

  if status_value is not null
    and status_value not in ('ready', 'busy', 'offline', 'friends') then
    perform private.raise_core_error_v1(
      'validation_failed',
      'status is invalid.'
    );
  end if;

  if matches_numeric <> trunc(matches_numeric)
    or matches_numeric not between 0 and 99999
    or rating_numeric not between 0 and 5
    or reputation_numeric <> trunc(reputation_numeric)
    or reputation_numeric not between 0 and 100
    or win_rate_numeric <> trunc(win_rate_numeric)
    or win_rate_numeric not between 0 and 100 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Profile statistics are outside the accepted range.'
    );
  end if;

  request_hash := private.command_request_hash_v1(command);
  select * into command_state
  from private.begin_command_v1(
    'update_player_profile_identity_v1',
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

  update public.profiles
  set display_name = display_name_value,
      bio = nullif(bio_value, '')
  where id = legacy_profile_id_value
    and deleted_at is null;

  if not found then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Legacy profile projection was not found.'
    );
  end if;

  select coalesce(media_summary, '{}'::jsonb)
  into media_summary_value
  from public.profile_habits
  where profile_id = legacy_profile_id_value
  for update;

  if not found then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Profile habits projection was not found.'
    );
  end if;

  media_summary_value := (media_summary_value - 'profile_stats')
    || jsonb_build_object(
      'profile_basics',
        coalesce(media_summary_value->'profile_basics', '{}'::jsonb)
        || jsonb_build_object('gender', gender_value),
      'profile_status', status_value
    );

  update public.profile_habits
  set media_summary = media_summary_value
  where profile_id = legacy_profile_id_value;

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
    'player_profile_identity_updated_v1',
    'player_profile',
    canonical_profile_row.id,
    jsonb_build_object(
      'eventId', event_id_value,
      'profileVersion', canonical_profile_row.version
    )
  );

  response_payload := private.profile_identity_snapshot_v1(player_row.id)
    || jsonb_build_object('repeated', false);

  perform private.finish_command_v1(
    'update_player_profile_identity_v1',
    actor_account_id,
    idempotency_key_value,
    response_payload
  );

  return response_payload;
end;
$$;

revoke all on function public.update_player_profile_identity_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.update_player_profile_identity_v1(jsonb)
  to authenticated, service_role;
