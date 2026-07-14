-- Route legacy profile-based block consumers through the Core V2 PlayerId authority.
-- The legacy table remains a shadow source until parity is proven and the rollout
-- flag is disabled. No consumer may treat auth.uid() or a legacy profile UUID as
-- canonical social identity.

create or replace function private.are_profiles_blocked(
  left_profile_id uuid,
  right_profile_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  left_player_id uuid;
  right_player_id uuid;
  shadow_legacy boolean := false;
begin
  if left_profile_id is null or right_profile_id is null then
    return false;
  end if;

  select profiles.player_id
  into left_player_id
  from public.player_profiles_v1 profiles
  where profiles.legacy_profile_id = left_profile_id;

  select profiles.player_id
  into right_player_id
  from public.player_profiles_v1 profiles
  where profiles.legacy_profile_id = right_profile_id;

  if left_player_id is not null and right_player_id is not null and exists (
    select 1
    from public.player_blocks_v2 blocks
    where blocks.active
      and (
        (
          blocks.blocker_player_id = left_player_id
          and blocks.blocked_player_id = right_player_id
        )
        or (
          blocks.blocker_player_id = right_player_id
          and blocks.blocked_player_id = left_player_id
        )
      )
  ) then
    return true;
  end if;

  select config.legacy_block_shadow_reads_enabled
  into shadow_legacy
  from private.social_authority_config_v2 config
  where config.singleton;

  if not coalesce(shadow_legacy, false) then
    return false;
  end if;

  return exists (
    select 1
    from public.blocks legacy_blocks
    where (
      legacy_blocks.blocker_id = left_profile_id
      and legacy_blocks.blocked_id = right_profile_id
    ) or (
      legacy_blocks.blocker_id = right_profile_id
      and legacy_blocks.blocked_id = left_profile_id
    )
  );
end;
$$;

comment on function private.are_profiles_blocked(uuid, uuid) is
  'Compatibility seam: V2 PlayerId block authority first, legacy profile block shadow second.';

revoke execute on function private.are_profiles_blocked(uuid, uuid)
from public, anon;
grant execute on function private.are_profiles_blocked(uuid, uuid)
to authenticated, service_role;
