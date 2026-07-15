-- Privacy-gated PlayerId -> profile compatibility bridge.
-- Canonical identity remains Core V1 PlayerId/ProfileId. The legacy profile UUID
-- is returned only so the existing profile read adapter can complete cutover.

create or replace function private.can_view_legacy_profile_v2(
  p_legacy_profile_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_context jsonb;
  actor_player_id uuid;
  target_player_id uuid;
  relationship_snapshot jsonb;
begin
  if p_legacy_profile_id is null or auth.uid() is null then
    return false;
  end if;

  actor_context := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;

  select profile.player_id
  into target_player_id
  from public.player_profiles_v1 profile
  where profile.legacy_profile_id = p_legacy_profile_id;

  if target_player_id is null then
    return false;
  end if;

  if actor_player_id = target_player_id then
    return true;
  end if;

  if actor_context #>> '{lifecycle,state}' <> 'active' then
    return false;
  end if;

  relationship_snapshot := private.social_relationship_snapshot_v2(
    actor_player_id,
    target_player_id
  );

  return coalesce(
    (relationship_snapshot #>> '{capabilities,canViewProfile}')::boolean,
    false
  );
exception
  when others then
    return false;
end;
$$;

create or replace function public.resolve_visible_profile_identity_v2(
  p_target_player_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_context jsonb;
  actor_player_id uuid;
  target_player_id_value uuid;
  relationship_snapshot jsonb;
  profile_row public.player_profiles_v1;
begin
  actor_context := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  target_player_id_value := coalesce(p_target_player_id, actor_player_id);
  perform private.assert_social_target_v2(target_player_id_value, false, false);

  if actor_player_id <> target_player_id_value then
    if actor_context #>> '{lifecycle,state}' <> 'active' then
      perform private.raise_core_error_v1(
        'profile_visibility_denied',
        'The requested profile is not available.'
      );
    end if;

    relationship_snapshot := private.social_relationship_snapshot_v2(
      actor_player_id,
      target_player_id_value
    );
    if not coalesce(
      (relationship_snapshot #>> '{capabilities,canViewProfile}')::boolean,
      false
    ) then
      perform private.raise_core_error_v1(
        'profile_visibility_denied',
        'The requested profile is not available.'
      );
    end if;
  end if;

  select *
  into profile_row
  from public.player_profiles_v1 profile
  where profile.player_id = target_player_id_value;

  if not found or profile_row.legacy_profile_id is null then
    perform private.raise_core_error_v1(
      'profile_not_found',
      'The requested profile is not available.'
    );
  end if;

  return jsonb_build_object(
    'contractVersion', 2,
    'playerId', profile_row.player_id,
    'profileId', profile_row.id,
    'legacyProfileId', profile_row.legacy_profile_id
  );
end;
$$;

comment on function public.resolve_visible_profile_identity_v2(uuid) is
  'Resolves a visible canonical PlayerId to ProfileId plus a temporary legacy profile read bridge.';
comment on function private.can_view_legacy_profile_v2(uuid) is
  'Fail-closed Core V2 profile visibility authority for legacy profile RLS consumers.';

drop policy if exists "Profiles are readable when discoverable or own" on public.profiles;
create policy "Profiles follow Core V2 social visibility"
on public.profiles for select
to authenticated
using (
  deleted_at is null
  and private.can_view_legacy_profile_v2(id)
);

revoke execute on function private.can_view_legacy_profile_v2(uuid)
from public, anon;
grant execute on function private.can_view_legacy_profile_v2(uuid)
to authenticated, service_role;
revoke execute on function public.resolve_visible_profile_identity_v2(uuid)
from public, anon;
grant execute on function public.resolve_visible_profile_identity_v2(uuid)
to authenticated, service_role;
