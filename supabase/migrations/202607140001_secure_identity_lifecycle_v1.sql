-- Production Match Loop v1: authoritative account -> player -> profile mapping
-- and server-owned player lifecycle. This migration is additive: legacy profile
-- reads/writes stay available while new consumers cut over to lifecycle snapshots.

create type public.player_lifecycle_state as enum (
  'registered',
  'onboarding',
  'active',
  'suspended',
  'deleting',
  'deleted'
);

create table public.players (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null unique,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  lifecycle_state public.player_lifecycle_state not null default 'registered',
  lifecycle_version bigint not null default 1 check (lifecycle_version > 0),
  discoverable boolean not null default false,
  messaging_allowed boolean not null default false,
  suspension_reason_code text,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_auth_subject_consistent check (
    auth_user_id is null or auth_user_id = account_id
  ),
  constraint players_capabilities_match_lifecycle check (
    lifecycle_state = 'active'
    or (discoverable = false and messaging_allowed = false)
  ),
  constraint players_deletion_timestamps_match_lifecycle check (
    (lifecycle_state not in ('deleting', 'deleted') or deletion_requested_at is not null)
    and (lifecycle_state <> 'deleted' or deleted_at is not null)
  )
);

create table public.player_profiles_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null unique references public.players(id) on delete cascade,
  legacy_profile_id uuid unique references public.profiles(id) on delete set null,
  version bigint not null default 0 check (version >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.command_receipts_v1 (
  command_name text not null,
  account_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (command_name, account_id, idempotency_key),
  constraint command_receipts_v1_key_format check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  )
);

create index players_lifecycle_discoverable_idx
  on public.players (lifecycle_state, discoverable)
  where auth_user_id is not null;
create index players_lifecycle_messaging_idx
  on public.players (lifecycle_state, messaging_allowed)
  where auth_user_id is not null;
create index player_profiles_v1_legacy_profile_idx
  on public.player_profiles_v1 (legacy_profile_id)
  where legacy_profile_id is not null;

create trigger players_set_updated_at
before update on public.players
for each row execute function public.set_updated_at();

create trigger player_profiles_v1_set_updated_at
before update on public.player_profiles_v1
for each row execute function public.set_updated_at();

alter table public.players enable row level security;
alter table public.player_profiles_v1 enable row level security;

create policy "Accounts read own canonical player"
on public.players for select
to authenticated
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
  and account_id = auth.uid()
);

create policy "Accounts read own canonical player profile"
on public.player_profiles_v1 for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.players
    where players.id = player_profiles_v1.player_id
      and players.auth_user_id = auth.uid()
      and players.account_id = auth.uid()
  )
);

revoke all on public.players from public, anon, authenticated;
revoke all on public.player_profiles_v1 from public, anon, authenticated;
grant select on public.players to authenticated;
grant select on public.player_profiles_v1 to authenticated;
grant all on public.players to service_role;
grant all on public.player_profiles_v1 to service_role;

revoke all on private.command_receipts_v1 from public, anon, authenticated;
grant all on private.command_receipts_v1 to service_role;

-- Versioned domain events are validated by executable Core V1 contracts. Keep
-- legacy unversioned event names while allowing additive versioned domains.
alter table private.outbox_events
  drop constraint if exists outbox_events_event_type_check;
alter table private.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'media_uploaded',
      'media_delete_requested',
      'media_processing_requested',
      'push_notification_requested',
      'account_deletion_requested'
    )
    or event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v[1-9][0-9]*$'
  );

create or replace function private.raise_core_error_v1(
  p_code text,
  p_message text,
  p_retryable boolean default false,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = jsonb_build_object(
      'code', p_code,
      'message', p_message,
      'requestId', extensions.gen_random_uuid()::text,
      'retryable', p_retryable,
      'details', coalesce(p_details, '{}'::jsonb)
    )::text;
end;
$$;

create or replace function private.command_request_hash_v1(p_request jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(coalesce(p_request, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function private.begin_command_v1(
  p_command_name text,
  p_account_id uuid,
  p_idempotency_key text,
  p_request_hash text
)
returns table(repeated boolean, response jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  existing_hash text;
  existing_response jsonb;
begin
  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'idempotencyKey must be 16-128 URL-safe characters.'
    );
  end if;

  insert into private.command_receipts_v1 (
    command_name,
    account_id,
    idempotency_key,
    request_hash
  ) values (
    p_command_name,
    p_account_id,
    p_idempotency_key,
    p_request_hash
  )
  on conflict (command_name, account_id, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    return query select false, null::jsonb;
    return;
  end if;

  select receipts.request_hash, receipts.response
  into existing_hash, existing_response
  from private.command_receipts_v1 receipts
  where receipts.command_name = p_command_name
    and receipts.account_id = p_account_id
    and receipts.idempotency_key = p_idempotency_key
  for update;

  if existing_hash is distinct from p_request_hash then
    perform private.raise_core_error_v1(
      'idempotency_key_reused',
      'The idempotency key was already used with a different request.',
      false
    );
  end if;

  if existing_response is null then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'The original command has no durable receipt yet.',
      true
    );
  end if;

  return query
  select true, jsonb_set(existing_response, '{repeated}', 'true'::jsonb, true);
end;
$$;

create or replace function private.finish_command_v1(
  p_command_name text,
  p_account_id uuid,
  p_idempotency_key text,
  p_response jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.command_receipts_v1
  set response = p_response,
      completed_at = now()
  where command_name = p_command_name
    and account_id = p_account_id
    and idempotency_key = p_idempotency_key;
$$;

create or replace function private.authenticated_principal_v1(p_player_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  claims jsonb := auth.jwt();
  session_id_text text;
  issued_at_epoch double precision;
  expires_at_epoch double precision;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  session_id_text := nullif(claims->>'session_id', '');
  if session_id_text is null
    or session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    perform private.raise_core_error_v1(
      'session_expired',
      'The authenticated session is missing a valid session identifier.'
    );
  end if;

  begin
    issued_at_epoch := (claims->>'iat')::double precision;
    expires_at_epoch := (claims->>'exp')::double precision;
  exception when others then
    perform private.raise_core_error_v1(
      'session_expired',
      'The authenticated session has invalid timestamps.'
    );
  end;

  if issued_at_epoch is null
    or expires_at_epoch is null
    or expires_at_epoch <= issued_at_epoch
    or expires_at_epoch <= extract(epoch from now()) then
    perform private.raise_core_error_v1(
      'session_expired',
      'The authenticated session has expired.'
    );
  end if;

  return jsonb_build_object(
    'accountId', actor_account_id,
    'playerId', p_player_id,
    'sessionId', session_id_text::uuid,
    'issuedAt', to_timestamp(issued_at_epoch),
    'expiresAt', to_timestamp(expires_at_epoch)
  );
end;
$$;

create or replace function private.player_lifecycle_snapshot_v1(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accountId', players.account_id,
    'playerId', players.id,
    'profileId', profiles.id,
    'state', players.lifecycle_state,
    'discoverable', players.discoverable,
    'messagingAllowed', players.messaging_allowed,
    'profileVersion', profiles.version,
    'version', players.lifecycle_version,
    'updatedAt', greatest(players.updated_at, profiles.updated_at)
  )
  from public.players players
  join public.player_profiles_v1 profiles on profiles.player_id = players.id
  where players.id = p_player_id;
$$;

create or replace function private.refresh_player_command_response_v1(p_response jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id_value uuid;
  lifecycle_snapshot jsonb;
  refreshed_response jsonb;
begin
  begin
    player_id_value := (p_response #>> '{lifecycle,playerId}')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'internal_error',
      'Stored command receipt has an invalid player identity.'
    );
  end;

  lifecycle_snapshot := private.player_lifecycle_snapshot_v1(player_id_value);
  if lifecycle_snapshot is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Stored command receipt references a missing player.'
    );
  end if;

  refreshed_response := jsonb_set(
    jsonb_set(
      jsonb_set(
        p_response,
        '{principal}',
        private.authenticated_principal_v1(player_id_value),
        true
      ),
      '{lifecycle}',
      lifecycle_snapshot,
      true
    ),
    '{repeated}',
    'true'::jsonb,
    true
  );

  if refreshed_response ? 'profileVersion' then
    refreshed_response := jsonb_set(
      refreshed_response,
      '{profileVersion}',
      lifecycle_snapshot->'profileVersion',
      true
    );
  end if;

  return refreshed_response;
end;
$$;

create or replace function private.is_player_discovery_eligible_v1(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where id = p_player_id
      and auth_user_id is not null
      and lifecycle_state = 'active'
      and discoverable
  );
$$;

create or replace function private.is_player_messaging_allowed_v1(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where id = p_player_id
      and auth_user_id is not null
      and lifecycle_state = 'active'
      and messaging_allowed
  );
$$;

create or replace function private.prepare_player_auth_detached_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.auth_user_id is not null and new.auth_user_id is null then
    new.lifecycle_state := 'deleted';
    new.lifecycle_version := old.lifecycle_version + 1;
    new.discoverable := false;
    new.messaging_allowed := false;
    new.suspension_reason_code := null;
    new.deletion_requested_at := coalesce(old.deletion_requested_at, now());
    new.deleted_at := coalesce(old.deleted_at, now());
  end if;

  return new;
end;
$$;

create trigger players_prepare_auth_detached_v1
before update of auth_user_id on public.players
for each row execute function private.prepare_player_auth_detached_v1();

create or replace function private.emit_player_deleted_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid := extensions.gen_random_uuid();
  canonical_profile_id uuid;
  canonical_profile_version bigint;
begin
  if old.lifecycle_state is distinct from 'deleted'
    and new.lifecycle_state = 'deleted' then
    select id, version
    into canonical_profile_id, canonical_profile_version
    from public.player_profiles_v1
    where player_id = new.id;

    if canonical_profile_id is not null then
      insert into private.outbox_events (
        id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload
      ) values (
        event_id_value,
        'player.deleted.v1',
        'player',
        new.id,
        jsonb_build_object(
          'eventId', event_id_value,
          'eventType', 'player.deleted.v1',
          'aggregateType', 'player',
          'aggregateId', new.id,
          'occurredAt', new.deleted_at,
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
    end if;

    insert into private.audit_logs (
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      null,
      'player_auth_identity_detached',
      'player',
      new.id,
      jsonb_build_object(
        'accountIdHash', encode(
          extensions.digest(convert_to(new.account_id::text, 'UTF8'), 'sha256'),
          'hex'
        ),
        'lifecycleVersion', new.lifecycle_version,
        'eventId', event_id_value
      )
    );
  end if;

  return new;
end;
$$;

create trigger players_emit_deleted_v1
after update of auth_user_id on public.players
for each row execute function private.emit_player_deleted_v1();

create or replace function private.is_valid_player_lifecycle_transition_v1(
  p_from public.player_lifecycle_state,
  p_to public.player_lifecycle_state
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'registered' then p_to in ('onboarding', 'suspended', 'deleting')
    when 'onboarding' then p_to in ('active', 'suspended', 'deleting')
    when 'active' then p_to in ('suspended', 'deleting')
    when 'suspended' then p_to in ('active', 'deleting')
    when 'deleting' then p_to = 'deleted'
    when 'deleted' then false
  end;
$$;

create or replace function private.transition_player_lifecycle_v1(
  p_player_id uuid,
  p_expected_version bigint,
  p_target_state public.player_lifecycle_state,
  p_discoverable boolean,
  p_messaging_allowed boolean,
  p_reason_code text default null
)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_row public.players;
begin
  select * into player_row
  from public.players
  where id = p_player_id
  for update;

  if not found then
    perform private.raise_core_error_v1('player_not_found', 'Player not found.');
  end if;

  if player_row.lifecycle_version <> p_expected_version then
    perform private.raise_core_error_v1(
      'lifecycle_version_conflict',
      'Player lifecycle changed on another request.',
      true,
      jsonb_build_object(
        'expectedVersion', p_expected_version,
        'actualVersion', player_row.lifecycle_version
      )
    );
  end if;

  if not private.is_valid_player_lifecycle_transition_v1(
    player_row.lifecycle_state,
    p_target_state
  ) then
    perform private.raise_core_error_v1(
      'invalid_lifecycle_transition',
      format(
        'Lifecycle transition %s -> %s is forbidden.',
        player_row.lifecycle_state,
        p_target_state
      ),
      false
    );
  end if;

  if p_target_state <> 'active' and (p_discoverable or p_messaging_allowed) then
    perform private.raise_core_error_v1(
      'invalid_lifecycle_transition',
      'Only active players may expose discovery or messaging capabilities.'
    );
  end if;

  update public.players
  set lifecycle_state = p_target_state,
      lifecycle_version = lifecycle_version + 1,
      discoverable = p_discoverable,
      messaging_allowed = p_messaging_allowed,
      suspension_reason_code = case
        when p_target_state = 'suspended' then nullif(p_reason_code, '')
        else null
      end,
      deletion_requested_at = case
        when p_target_state in ('deleting', 'deleted')
          then coalesce(deletion_requested_at, now())
        else null
      end,
      deleted_at = case
        when p_target_state = 'deleted' then coalesce(deleted_at, now())
        else null
      end
  where id = p_player_id
  returning * into player_row;

  return player_row;
end;
$$;

-- Shadow-compute the legacy completion state once, then persist it as the new
-- lifecycle authority. Consumers must never repeat this inference at runtime.
with legacy_state as (
  select
    profiles.id as account_id,
    case
      when profiles.deleted_at is not null then 'deleted'::public.player_lifecycle_state
      when exists (
        select 1 from public.game_profiles where game_profiles.profile_id = profiles.id
      )
      and exists (
        select 1 from public.profile_roles where profile_roles.profile_id = profiles.id
      )
      and (
        select count(*) from public.profile_heroes where profile_heroes.profile_id = profiles.id
      ) = 3
      and exists (
        select 1 from public.profile_habits where profile_habits.profile_id = profiles.id
      ) then 'active'::public.player_lifecycle_state
      else 'onboarding'::public.player_lifecycle_state
    end as lifecycle_state,
    profiles.is_discoverable,
    profiles.updated_at
  from public.profiles profiles
), inserted_players as (
  insert into public.players (
    account_id,
    auth_user_id,
    lifecycle_state,
    discoverable,
    messaging_allowed,
    deletion_requested_at,
    deleted_at,
    created_at,
    updated_at
  )
  select
    legacy_state.account_id,
    legacy_state.account_id,
    legacy_state.lifecycle_state,
    legacy_state.lifecycle_state = 'active' and legacy_state.is_discoverable,
    legacy_state.lifecycle_state = 'active',
    case when legacy_state.lifecycle_state = 'deleted' then legacy_state.updated_at end,
    case when legacy_state.lifecycle_state = 'deleted' then legacy_state.updated_at end,
    legacy_state.updated_at,
    legacy_state.updated_at
  from legacy_state
  on conflict (account_id) do nothing
  returning id, account_id, lifecycle_state, updated_at
)
insert into public.player_profiles_v1 (
  player_id,
  legacy_profile_id,
  version,
  completed_at,
  created_at,
  updated_at
)
select
  inserted_players.id,
  inserted_players.account_id,
  case when inserted_players.lifecycle_state = 'active' then 1 else 0 end,
  case when inserted_players.lifecycle_state = 'active' then inserted_players.updated_at end,
  inserted_players.updated_at,
  inserted_players.updated_at
from inserted_players
on conflict (player_id) do nothing;

insert into private.audit_logs (action, target_type, metadata)
select
  'player_lifecycle_v1_backfill',
  'program',
  jsonb_build_object(
    'registered', count(*) filter (where lifecycle_state = 'registered'),
    'onboarding', count(*) filter (where lifecycle_state = 'onboarding'),
    'active', count(*) filter (where lifecycle_state = 'active'),
    'suspended', count(*) filter (where lifecycle_state = 'suspended'),
    'deleting', count(*) filter (where lifecycle_state = 'deleting'),
    'deleted', count(*) filter (where lifecycle_state = 'deleted')
  )
from public.players;

create or replace function public.get_authenticated_player_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  player_id_value uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;

  select id into player_id_value
  from public.players
  where account_id = actor_account_id;

  return jsonb_build_object(
    'principal', private.authenticated_principal_v1(player_id_value),
    'lifecycle', case
      when player_id_value is null then null
      else private.player_lifecycle_snapshot_v1(player_id_value)
    end
  );
end;
$$;

create or replace function public.bootstrap_authenticated_player_v1(
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  request_hash text;
  command_state record;
  player_row public.players;
  canonical_profile_id uuid;
  response_payload jsonb;
  inserted_player_count integer;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;

  request_hash := private.command_request_hash_v1(
    jsonb_build_object('command', 'bootstrap_authenticated_player_v1')
  );

  select * into command_state
  from private.begin_command_v1(
    'bootstrap_authenticated_player_v1',
    actor_account_id,
    idempotency_key,
    request_hash
  );

  if command_state.repeated then
    return private.refresh_player_command_response_v1(command_state.response);
  end if;

  insert into public.players (account_id, auth_user_id, lifecycle_state)
  values (actor_account_id, actor_account_id, 'registered')
  on conflict (account_id) do nothing;
  get diagnostics inserted_player_count = row_count;

  select * into player_row
  from public.players
  where account_id = actor_account_id
  for update;

  if player_row.lifecycle_state = 'registered' then
    player_row := private.transition_player_lifecycle_v1(
      player_row.id,
      player_row.lifecycle_version,
      'onboarding',
      false,
      false,
      null
    );
  end if;

  insert into public.player_profiles_v1 (player_id, legacy_profile_id)
  values (
    player_row.id,
    case
      when exists (select 1 from public.profiles where id = actor_account_id)
        then actor_account_id
      else null
    end
  )
  on conflict (player_id) do update
    set legacy_profile_id = coalesce(
      public.player_profiles_v1.legacy_profile_id,
      excluded.legacy_profile_id
    )
  returning id into canonical_profile_id;

  response_payload := jsonb_build_object(
    'principal', private.authenticated_principal_v1(player_row.id),
    'lifecycle', private.player_lifecycle_snapshot_v1(player_row.id),
    'repeated', false
  );

  perform private.finish_command_v1(
    'bootstrap_authenticated_player_v1',
    actor_account_id,
    idempotency_key,
    response_payload
  );

  if inserted_player_count = 1 then
    insert into private.audit_logs (
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      actor_account_id,
      'player_identity_bootstrapped',
      'player',
      player_row.id,
      jsonb_build_object(
        'lifecycleState', player_row.lifecycle_state,
        'lifecycleVersion', player_row.lifecycle_version,
        'profileId', canonical_profile_id
      )
    );
  end if;

  return response_payload;
end;
$$;

create or replace function public.complete_player_onboarding_v1(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  idempotency_key_value text := nullif(command->>'idempotencyKey', '');
  expected_profile_version bigint;
  request_hash text;
  command_state record;
  profile_payload jsonb := command->'profile';
  legacy_payload jsonb := command->'legacyProfilePayload';
  display_name_value text;
  game_handle_value text;
  rank_slug_value text;
  timezone_value text;
  canonical_role_slugs text[];
  canonical_hero_slugs text[];
  legacy_role_slugs text[];
  legacy_hero_slugs text[];
  stored_role_slugs text[];
  stored_hero_slugs text[];
  stored_display_name text;
  stored_game_handle text;
  stored_rank_slug text;
  stored_timezone text;
  player_row public.players;
  canonical_profile_row public.player_profiles_v1;
  event_id uuid := extensions.gen_random_uuid();
  occurred_at timestamptz := now();
  response_payload jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;

  if jsonb_typeof(command) <> 'object'
    or jsonb_typeof(profile_payload) <> 'object'
    or jsonb_typeof(legacy_payload) <> 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'command, profile, and legacyProfilePayload must be objects.'
    );
  end if;

  if coalesce(command->>'expectedProfileVersion', '') !~ '^[0-9]+$' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedProfileVersion must be a non-negative integer.'
    );
  end if;
  expected_profile_version := (command->>'expectedProfileVersion')::bigint;

  display_name_value := nullif(btrim(profile_payload->>'displayName'), '');
  game_handle_value := nullif(btrim(profile_payload->>'gameHandle'), '');
  rank_slug_value := nullif(btrim(profile_payload->>'rankSlug'), '');
  timezone_value := nullif(btrim(profile_payload->>'timezone'), '');

  if display_name_value is null or char_length(display_name_value) not between 2 and 40
    or game_handle_value is null or char_length(game_handle_value) not between 2 and 64
    or rank_slug_value is null or rank_slug_value !~ '^[a-z0-9_]+$'
    or timezone_value is null or char_length(timezone_value) > 80
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = timezone_value
    ) then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'The minimum active profile fields are invalid.'
    );
  end if;

  if jsonb_typeof(profile_payload->'roleSlugs') <> 'array'
    or jsonb_typeof(profile_payload->'favoriteHeroSlugs') <> 'array'
    or jsonb_typeof(legacy_payload->'role_slugs') <> 'array'
    or jsonb_typeof(legacy_payload->'heroes') <> 'array' then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Role and hero selections must be arrays.'
    );
  end if;

  select coalesce(array_agg(item.value order by item.value), array[]::text[])
  into canonical_role_slugs
  from (
    select distinct value
    from jsonb_array_elements_text(profile_payload->'roleSlugs') as values(value)
  ) item;

  select coalesce(array_agg(item.value order by item.value), array[]::text[])
  into canonical_hero_slugs
  from (
    select distinct value
    from jsonb_array_elements_text(profile_payload->'favoriteHeroSlugs') as values(value)
  ) item;

  select coalesce(array_agg(item.value order by item.value), array[]::text[])
  into legacy_role_slugs
  from (
    select distinct value
    from jsonb_array_elements_text(legacy_payload->'role_slugs') as values(value)
  ) item;

  select coalesce(array_agg(item.value order by item.value), array[]::text[])
  into legacy_hero_slugs
  from (
    select distinct value->>'slug' as value
    from jsonb_array_elements(legacy_payload->'heroes') as values(value)
  ) item;

  if cardinality(canonical_role_slugs) not between 1 and 2
    or cardinality(canonical_hero_slugs) <> 3
    or canonical_role_slugs <> legacy_role_slugs
    or canonical_hero_slugs <> legacy_hero_slugs
    or display_name_value is distinct from nullif(btrim(legacy_payload->>'display_name'), '')
    or game_handle_value is distinct from nullif(btrim(legacy_payload->>'handle'), '')
    or rank_slug_value is distinct from nullif(btrim(legacy_payload->>'rank_slug'), '')
    or timezone_value is distinct from nullif(btrim(legacy_payload->>'timezone'), '') then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Canonical activation fields do not match the legacy migration payload.'
    );
  end if;

  request_hash := private.command_request_hash_v1(command);
  select * into command_state
  from private.begin_command_v1(
    'complete_player_onboarding_v1',
    actor_account_id,
    idempotency_key_value,
    request_hash
  );

  if command_state.repeated then
    return private.refresh_player_command_response_v1(command_state.response);
  end if;

  select players.*
  into player_row
  from public.players players
  where players.account_id = actor_account_id
  for update;

  if not found then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Bootstrap the canonical player identity before onboarding completion.'
    );
  end if;

  select profiles.*
  into canonical_profile_row
  from public.player_profiles_v1 profiles
  where profiles.player_id = player_row.id
  for update;

  if not found then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Canonical player profile mapping is missing.'
    );
  end if;

  if player_row.lifecycle_state <> 'onboarding' then
    perform private.raise_core_error_v1(
      'invalid_lifecycle_transition',
      format('Cannot complete onboarding from %s.', player_row.lifecycle_state)
    );
  end if;

  if canonical_profile_row.version <> expected_profile_version then
    perform private.raise_core_error_v1(
      'profile_version_conflict',
      'Profile changed on another session.',
      true,
      jsonb_build_object(
        'expectedVersion', expected_profile_version,
        'actualVersion', canonical_profile_row.version
      )
    );
  end if;

  perform public.complete_onboarding(legacy_payload);

  select profiles.display_name, profiles.timezone, game_profiles.handle, ranks.slug
  into stored_display_name, stored_timezone, stored_game_handle, stored_rank_slug
  from public.profiles profiles
  join public.game_profiles game_profiles on game_profiles.profile_id = profiles.id
  join public.ranks ranks on ranks.id = game_profiles.rank_id
  where profiles.id = actor_account_id;

  select coalesce(array_agg(roles.slug order by roles.slug), array[]::text[])
  into stored_role_slugs
  from public.profile_roles
  join public.roles on roles.id = profile_roles.role_id
  where profile_roles.profile_id = actor_account_id;

  select coalesce(array_agg(heroes.slug order by heroes.slug), array[]::text[])
  into stored_hero_slugs
  from public.profile_heroes
  join public.heroes on heroes.id = profile_heroes.hero_id
  where profile_heroes.profile_id = actor_account_id;

  if stored_display_name is distinct from display_name_value
    or stored_game_handle is distinct from game_handle_value
    or stored_rank_slug is distinct from rank_slug_value
    or stored_timezone is distinct from timezone_value
    or stored_role_slugs is distinct from canonical_role_slugs
    or stored_hero_slugs is distinct from canonical_hero_slugs then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Persisted profile failed authoritative activation verification.'
    );
  end if;

  update public.player_profiles_v1
  set legacy_profile_id = actor_account_id,
      version = version + 1,
      completed_at = coalesce(completed_at, now())
  where id = canonical_profile_row.id
  returning * into canonical_profile_row;

  player_row := private.transition_player_lifecycle_v1(
    player_row.id,
    player_row.lifecycle_version,
    'active',
    true,
    true,
    null
  );

  insert into private.outbox_events (
    id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    event_id,
    'player.activated.v1',
    'player',
    player_row.id,
    jsonb_build_object(
      'eventId', event_id,
      'eventType', 'player.activated.v1',
      'aggregateType', 'player',
      'aggregateId', player_row.id,
      'occurredAt', occurred_at,
      'correlationId', event_id,
      'causationId', null,
      'data', jsonb_build_object(
        'accountId', actor_account_id,
        'playerId', player_row.id,
        'profileId', canonical_profile_row.id,
        'lifecycleVersion', player_row.lifecycle_version,
        'profileVersion', canonical_profile_row.version
      )
    )
  );

  response_payload := jsonb_build_object(
    'principal', private.authenticated_principal_v1(player_row.id),
    'lifecycle', private.player_lifecycle_snapshot_v1(player_row.id),
    'profileVersion', canonical_profile_row.version,
    'repeated', false
  );

  perform private.finish_command_v1(
    'complete_player_onboarding_v1',
    actor_account_id,
    idempotency_key_value,
    response_payload
  );

  insert into private.audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    actor_account_id,
    'player_activated',
    'player',
    player_row.id,
    jsonb_build_object(
      'lifecycleVersion', player_row.lifecycle_version,
      'profileVersion', canonical_profile_row.version,
      'eventId', event_id
    )
  );

  return response_payload;
end;
$$;

revoke execute on function public.get_authenticated_player_v1() from public, anon;
revoke execute on function public.bootstrap_authenticated_player_v1(text) from public, anon;
revoke execute on function public.complete_player_onboarding_v1(jsonb) from public, anon;
grant execute on function public.get_authenticated_player_v1() to authenticated;
grant execute on function public.bootstrap_authenticated_player_v1(text) to authenticated;
grant execute on function public.complete_player_onboarding_v1(jsonb) to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
