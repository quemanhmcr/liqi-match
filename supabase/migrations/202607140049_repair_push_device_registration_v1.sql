-- The canonical register-device RPC used account_id as both a PL/pgSQL
-- variable and a push_devices_v1 column. Rename only the variable while keeping
-- the RPC signature, ownership checks, and device upsert semantics unchanged.

create or replace function public.register_push_device_v1(
  p_device_installation_id text,
  p_expo_push_token text,
  p_platform text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id_value uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
  existing_owner uuid;
  device private.push_devices_v1%rowtype;
begin
  if actor_account_id_value is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_device_installation_id is null
    or char_length(p_device_installation_id) not between 16 and 180
    or p_expo_push_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$'
    or p_platform not in ('android', 'ios')
  then
    raise exception 'Invalid push device registration'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(
    actor_account_id_value,
    false
  );
  if snapshot.state <> 'active' then
    raise exception 'Only active players may register push devices'
      using errcode = '42501', detail = 'lifecycle_not_active';
  end if;

  select registered.account_id into existing_owner
  from private.push_devices_v1 as registered
  where registered.expo_push_token = p_expo_push_token
    and registered.account_id <> actor_account_id_value;

  if existing_owner is not null then
    raise exception 'Push token is owned by another account'
      using errcode = '23505', detail = 'push_token_ownership_conflict';
  end if;

  insert into private.push_devices_v1 (
    account_id,
    player_id,
    device_installation_id,
    expo_push_token,
    platform,
    enabled,
    last_seen_at,
    disabled_at
  ) values (
    actor_account_id_value,
    snapshot.player_id,
    p_device_installation_id,
    p_expo_push_token,
    p_platform,
    true,
    now(),
    null
  )
  on conflict (account_id, device_installation_id) do update
    set player_id = excluded.player_id,
        expo_push_token = excluded.expo_push_token,
        platform = excluded.platform,
        enabled = true,
        last_seen_at = now(),
        disabled_at = null
  returning * into device;

  return jsonb_build_object(
    'deviceInstallationId', device.device_installation_id,
    'playerId', device.player_id,
    'platform', device.platform,
    'enabled', device.enabled,
    'updatedAt', device.updated_at
  );
end;
$$;

revoke execute on function public.register_push_device_v1(text, text, text)
  from public, anon;
grant execute on function public.register_push_device_v1(text, text, text)
  to authenticated;
