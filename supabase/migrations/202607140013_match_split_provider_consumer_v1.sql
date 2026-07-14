-- Match Authority consumer integration for the split identity/lifecycle/profile
-- provider seams introduced by 202607140003.

create or replace function private.require_player_snapshot_by_account_v1(
  p_account_id uuid,
  p_lock boolean default false
)
returns private.player_lifecycle_snapshot_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_snapshot jsonb;
  lifecycle_snapshot jsonb;
  profile_snapshot jsonb;
  player_id_value uuid;
  profile_id_value uuid;
  snapshot private.player_lifecycle_snapshot_v1;
begin
  begin
    identity_snapshot := public.resolve_player_identity_v1(p_account_id, p_lock);
  exception
    when undefined_function then
      raise exception 'Player identity provider is unavailable'
        using errcode = '55000', detail = 'identity_provider_unavailable';
  end;

  if identity_snapshot is null then
    raise exception 'Player identity snapshot not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  begin
    player_id_value := (identity_snapshot ->> 'playerId')::uuid;
    profile_id_value := (identity_snapshot ->> 'profileId')::uuid;
  exception
    when others then
      raise exception 'Invalid PlayerIdentityV1 payload'
        using errcode = '22023', detail = 'identity_contract_violation';
  end;

  if (identity_snapshot ->> 'accountId')::uuid is distinct from p_account_id then
    raise exception 'Identity provider returned a mismatched account'
      using errcode = '22023', detail = 'identity_contract_violation';
  end if;

  begin
    lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
      player_id_value,
      p_lock
    );
    profile_snapshot := public.get_player_profile_version_v1(
      profile_id_value,
      p_lock
    );
  exception
    when undefined_function then
      raise exception 'Player lifecycle provider is unavailable'
        using errcode = '55000', detail = 'lifecycle_provider_unavailable';
  end;

  if lifecycle_snapshot is null or profile_snapshot is null then
    raise exception 'Player lifecycle snapshot not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  begin
    snapshot := row(
      p_account_id,
      player_id_value,
      profile_id_value,
      lifecycle_snapshot ->> 'state',
      (lifecycle_snapshot ->> 'discoverable')::boolean,
      (profile_snapshot ->> 'version')::integer,
      (lifecycle_snapshot ->> 'version')::integer,
      greatest(
        (lifecycle_snapshot ->> 'updatedAt')::timestamptz,
        (profile_snapshot ->> 'updatedAt')::timestamptz
      )
    )::private.player_lifecycle_snapshot_v1;
  exception
    when others then
      raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
        using errcode = '22023', detail = 'lifecycle_contract_violation';
  end;

  if (lifecycle_snapshot ->> 'playerId')::uuid is distinct from player_id_value
    or (lifecycle_snapshot ->> 'profileId')::uuid is distinct from profile_id_value
    or (profile_snapshot ->> 'profileId')::uuid is distinct from profile_id_value
  then
    raise exception 'Provider snapshots disagree on player identity'
      using errcode = '22023', detail = 'lifecycle_contract_violation';
  end if;

  return snapshot;
end;
$$;

create or replace function private.require_player_snapshot_by_player_v1(
  p_player_id uuid,
  p_lock boolean default false
)
returns private.player_lifecycle_snapshot_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  lifecycle_snapshot jsonb;
  profile_snapshot jsonb;
  profile_id_value uuid;
  snapshot private.player_lifecycle_snapshot_v1;
begin
  begin
    lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
      p_player_id,
      p_lock
    );
  exception
    when undefined_function then
      raise exception 'Player lifecycle provider is unavailable'
        using errcode = '55000', detail = 'lifecycle_provider_unavailable';
  end;

  if lifecycle_snapshot is null then
    raise exception 'Player lifecycle snapshot not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  begin
    profile_id_value := (lifecycle_snapshot ->> 'profileId')::uuid;
    profile_snapshot := public.get_player_profile_version_v1(
      profile_id_value,
      p_lock
    );
  exception
    when undefined_function then
      raise exception 'Player profile provider is unavailable'
        using errcode = '55000', detail = 'profile_provider_unavailable';
    when others then
      raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
        using errcode = '22023', detail = 'lifecycle_contract_violation';
  end;

  if profile_snapshot is null then
    raise exception 'Player profile snapshot not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  begin
    snapshot := row(
      null,
      p_player_id,
      profile_id_value,
      lifecycle_snapshot ->> 'state',
      (lifecycle_snapshot ->> 'discoverable')::boolean,
      (profile_snapshot ->> 'version')::integer,
      (lifecycle_snapshot ->> 'version')::integer,
      greatest(
        (lifecycle_snapshot ->> 'updatedAt')::timestamptz,
        (profile_snapshot ->> 'updatedAt')::timestamptz
      )
    )::private.player_lifecycle_snapshot_v1;
  exception
    when others then
      raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
        using errcode = '22023', detail = 'lifecycle_contract_violation';
  end;

  if (lifecycle_snapshot ->> 'playerId')::uuid is distinct from p_player_id
    or (profile_snapshot ->> 'profileId')::uuid is distinct from profile_id_value
  then
    raise exception 'Provider snapshots disagree on player identity'
      using errcode = '22023', detail = 'lifecycle_contract_violation';
  end if;

  return snapshot;
end;
$$;
