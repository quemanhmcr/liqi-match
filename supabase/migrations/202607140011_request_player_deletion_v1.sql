-- Authoritative account-deletion request. Cleanup and Auth removal happen only
-- after this transaction has disabled discovery/messaging and emitted the
-- durable player.deletion_requested.v1 event.

create or replace function private.emit_player_deletion_requested_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid := extensions.gen_random_uuid();
  canonical_profile_id uuid;
  canonical_profile_version bigint;
  occurred_at_value timestamptz := coalesce(new.deletion_requested_at, now());
begin
  if old.lifecycle_state is distinct from 'deleting'
    and new.lifecycle_state = 'deleting' then
    select id, version
    into canonical_profile_id, canonical_profile_version
    from public.player_profiles_v1
    where player_id = new.id;

    if canonical_profile_id is null then
      perform private.raise_core_error_v1(
        'internal_error',
        'Canonical ProfileId is required before deletion can be requested.',
        true
      );
    end if;

    insert into private.outbox_events (
      id,
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    ) values (
      event_id_value,
      'player.deletion_requested.v1',
      'player',
      new.id,
      jsonb_build_object(
        'eventId', event_id_value,
        'eventType', 'player.deletion_requested.v1',
        'aggregateType', 'player',
        'aggregateId', new.id,
        'occurredAt', occurred_at_value,
        'correlationId', event_id_value,
        'causationId', null,
        'data', jsonb_build_object(
          'accountId', new.account_id,
          'playerId', new.id,
          'profileId', canonical_profile_id,
          'lifecycleVersion', new.lifecycle_version,
          'profileVersion', canonical_profile_version
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
      new.account_id,
      'player_deletion_requested_v1',
      'player',
      new.id,
      jsonb_build_object(
        'eventId', event_id_value,
        'lifecycleVersion', new.lifecycle_version,
        'profileVersion', canonical_profile_version
      )
    );
  end if;

  return new;
end;
$$;

create trigger players_emit_deletion_requested_v1
after update of lifecycle_state on public.players
for each row execute function private.emit_player_deletion_requested_v1();

create or replace function public.request_player_deletion_v1(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  idempotency_key_value text := nullif(command->>'idempotencyKey', '');
  expected_lifecycle_version bigint;
  request_hash text;
  command_state record;
  player_row public.players;
  response_payload jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  if command->>'confirmation' is distinct from 'DELETE' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Account deletion requires explicit DELETE confirmation.'
    );
  end if;

  begin
    expected_lifecycle_version :=
      (command->>'expectedLifecycleVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedLifecycleVersion must be a positive integer.'
    );
  end;

  if expected_lifecycle_version is null or expected_lifecycle_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedLifecycleVersion must be a positive integer.'
    );
  end if;

  request_hash := private.command_request_hash_v1(command);
  select * into command_state
  from private.begin_command_v1(
    'request_player_deletion_v1',
    actor_account_id,
    idempotency_key_value,
    request_hash
  );

  if command_state.repeated then
    return private.refresh_player_command_response_v1(command_state.response);
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

  if player_row.lifecycle_version <> expected_lifecycle_version then
    perform private.raise_core_error_v1(
      'lifecycle_version_conflict',
      'Player lifecycle changed on another request.',
      true,
      jsonb_build_object(
        'expectedVersion', expected_lifecycle_version,
        'actualVersion', player_row.lifecycle_version
      )
    );
  end if;

  if player_row.lifecycle_state = 'deleted' then
    perform private.raise_core_error_v1(
      'player_deleted',
      'The player identity is already deleted.'
    );
  end if;

  if player_row.lifecycle_state <> 'deleting' then
    player_row := private.transition_player_lifecycle_v1(
      player_row.id,
      player_row.lifecycle_version,
      'deleting',
      false,
      false,
      null
    );
  end if;

  response_payload := jsonb_build_object(
    'principal', private.authenticated_principal_v1(player_row.id),
    'lifecycle', private.player_lifecycle_snapshot_v1(player_row.id),
    'repeated', false
  );

  perform private.finish_command_v1(
    'request_player_deletion_v1',
    actor_account_id,
    idempotency_key_value,
    response_payload
  );

  return response_payload;
end;
$$;

revoke all on function public.request_player_deletion_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.request_player_deletion_v1(jsonb)
  to authenticated, service_role;
