-- Read seam for discovery candidate enumeration. Eligibility remains owned by
-- Mission 1 lifecycle state; consumers must not infer it from profile rows.

create function public.list_discoverable_player_lifecycle_v1(
  p_exclude_player_id uuid default null
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.player_lifecycle_snapshot_v1(players.id)
  from public.players players
  where players.auth_user_id is not null
    and players.lifecycle_state = 'active'
    and players.discoverable = true
    and (
      p_exclude_player_id is null
      or players.id <> p_exclude_player_id
    )
    and exists (
      select 1
      from public.player_profiles_v1 profiles
      where profiles.player_id = players.id
    )
  order by players.id;
$$;

comment on function public.list_discoverable_player_lifecycle_v1(uuid) is
  'Returns exact PlayerLifecycleSnapshotV1 rows for live active discoverable players, ordered by PlayerId. Service consumers must recheck with p_lock=true before command writes.';

revoke execute on function public.list_discoverable_player_lifecycle_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.list_discoverable_player_lifecycle_v1(uuid)
  to service_role;
