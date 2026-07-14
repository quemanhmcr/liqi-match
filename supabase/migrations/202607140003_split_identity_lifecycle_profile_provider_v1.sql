-- Correct the Mission 1 provider boundary to the exact Core V1 contracts:
-- identity mapping, lifecycle snapshot, and profile version are separate seams.

create or replace function private.player_lifecycle_snapshot_v1(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'playerId', players.id,
    'profileId', profiles.id,
    'state', players.lifecycle_state,
    'version', players.lifecycle_version,
    'discoverable', players.discoverable,
    'messagingAllowed', players.messaging_allowed,
    'updatedAt', players.updated_at
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
  profile_version_value bigint;
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

  select version
  into profile_version_value
  from public.player_profiles_v1
  where player_id = player_id_value;

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
      to_jsonb(profile_version_value),
      true
    );
  end if;

  return refreshed_response;
end;
$$;

create or replace function public.resolve_player_identity_v1(
  p_account_id uuid,
  p_lock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_row public.players;
  profile_row public.player_profiles_v1;
begin
  if p_account_id is null then
    return null;
  end if;

  if p_lock then
    select players.*
    into player_row
    from public.players players
    where players.account_id = p_account_id
    for update;
  else
    select players.*
    into player_row
    from public.players players
    where players.account_id = p_account_id;
  end if;

  if not found then
    return null;
  end if;

  if p_lock then
    select profiles.*
    into profile_row
    from public.player_profiles_v1 profiles
    where profiles.player_id = player_row.id
    for update;
  else
    select profiles.*
    into profile_row
    from public.player_profiles_v1 profiles
    where profiles.player_id = player_row.id;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'accountId', player_row.account_id,
    'playerId', player_row.id,
    'profileId', profile_row.id
  );
end;
$$;

-- This canonical provider takes PlayerId. The previous account-based envelope
-- is intentionally replaced; callers resolve AccountId through the identity seam.
drop function public.get_player_lifecycle_snapshot_v1(uuid, boolean);

create function public.get_player_lifecycle_snapshot_v1(
  p_player_id uuid,
  p_lock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_row public.players;
  profile_row public.player_profiles_v1;
begin
  if p_player_id is null then
    return null;
  end if;

  if p_lock then
    select players.*
    into player_row
    from public.players players
    where players.id = p_player_id
    for update;
  else
    select players.*
    into player_row
    from public.players players
    where players.id = p_player_id;
  end if;

  if not found then
    return null;
  end if;

  if p_lock then
    select profiles.*
    into profile_row
    from public.player_profiles_v1 profiles
    where profiles.player_id = player_row.id
    for update;
  else
    select profiles.*
    into profile_row
    from public.player_profiles_v1 profiles
    where profiles.player_id = player_row.id;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'playerId', player_row.id,
    'profileId', profile_row.id,
    'state', player_row.lifecycle_state,
    'version', player_row.lifecycle_version,
    'discoverable', player_row.discoverable,
    'messagingAllowed', player_row.messaging_allowed,
    'updatedAt', player_row.updated_at
  );
end;
$$;

-- Compatibility transport only. It delegates to the canonical function and
-- therefore does not own independent lifecycle semantics.
create or replace function public.get_player_lifecycle_snapshot_by_player_v1(
  p_player_id uuid,
  p_lock boolean default false
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.get_player_lifecycle_snapshot_v1(p_player_id, p_lock);
$$;

create or replace function public.get_player_profile_version_v1(
  p_profile_id uuid,
  p_lock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_row public.player_profiles_v1;
begin
  if p_profile_id is null then
    return null;
  end if;

  if p_lock then
    select profiles.*
    into profile_row
    from public.player_profiles_v1 profiles
    where profiles.id = p_profile_id
    for update;
  else
    select profiles.*
    into profile_row
    from public.player_profiles_v1 profiles
    where profiles.id = p_profile_id;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'profileId', profile_row.id,
    'version', profile_row.version,
    'updatedAt', profile_row.updated_at
  );
end;
$$;

comment on function public.resolve_player_identity_v1(uuid, boolean) is
  'AccountId -> PlayerId -> ProfileId authority. Resolve unlocked first for pair ordering; p_lock=true locks player then profile.';
comment on function public.get_player_lifecycle_snapshot_v1(uuid, boolean) is
  'Exact PlayerLifecycleSnapshotV1 by PlayerId. Pair consumers must call p_lock=true in ascending PlayerId order.';
comment on function public.get_player_profile_version_v1(uuid, boolean) is
  'Authoritative profile version by ProfileId. Pair consumers must lock in ascending ProfileId order when independent from lifecycle locks.';

revoke execute on function public.resolve_player_identity_v1(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.get_player_lifecycle_snapshot_v1(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.get_player_lifecycle_snapshot_by_player_v1(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.get_player_profile_version_v1(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.resolve_player_identity_v1(uuid, boolean)
  to service_role;
grant execute on function public.get_player_lifecycle_snapshot_v1(uuid, boolean)
  to service_role;
grant execute on function public.get_player_lifecycle_snapshot_by_player_v1(uuid, boolean)
  to service_role;
grant execute on function public.get_player_profile_version_v1(uuid, boolean)
  to service_role;
