-- Provider seam for Mission 2/3 consumers. The lock flag is intentionally part
-- of the provider API so a consumer transaction can serialize lifecycle checks
-- with its own aggregate writes without reimplementing lifecycle semantics.

create or replace function public.get_player_lifecycle_snapshot_v1(
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
    'profileId', profile_row.id,
    'state', player_row.lifecycle_state,
    'discoverable', player_row.discoverable,
    'messagingAllowed', player_row.messaging_allowed,
    'profileVersion', profile_row.version,
    'version', player_row.lifecycle_version,
    'updatedAt', greatest(player_row.updated_at, profile_row.updated_at)
  );
end;
$$;

create or replace function public.get_player_lifecycle_snapshot_by_player_v1(
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
    'accountId', player_row.account_id,
    'playerId', player_row.id,
    'profileId', profile_row.id,
    'state', player_row.lifecycle_state,
    'discoverable', player_row.discoverable,
    'messagingAllowed', player_row.messaging_allowed,
    'profileVersion', profile_row.version,
    'version', player_row.lifecycle_version,
    'updatedAt', greatest(player_row.updated_at, profile_row.updated_at)
  );
end;
$$;

comment on function public.get_player_lifecycle_snapshot_v1(uuid, boolean) is
  'Mission 1 provider contract. p_lock=true locks player then profile row. Consumers acquiring two snapshots must call in ascending PlayerId order.';
comment on function public.get_player_lifecycle_snapshot_by_player_v1(uuid, boolean) is
  'Mission 1 provider contract. p_lock=true locks player then profile row. Consumers acquiring two snapshots must call in ascending PlayerId order.';

revoke execute on function public.get_player_lifecycle_snapshot_v1(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.get_player_lifecycle_snapshot_by_player_v1(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.get_player_lifecycle_snapshot_v1(uuid, boolean)
  to service_role;
grant execute on function public.get_player_lifecycle_snapshot_by_player_v1(uuid, boolean)
  to service_role;
