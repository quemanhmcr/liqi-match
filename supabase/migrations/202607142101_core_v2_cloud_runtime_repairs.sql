-- Cloud PostgreSQL 17 runtime repairs discovered by the dedicated Core V2
-- database evidence project. This migration is forward-only and idempotent.

-- Migration 1440 attempted to preserve legacy client-editable profile stats at
-- a nested path. jsonb_set does not create missing intermediate objects, so
-- repair rows whose unverified_legacy parent was absent.
update public.profile_habits habits
set media_summary = coalesce(habits.media_summary, '{}'::jsonb)
  || jsonb_build_object(
    'unverified_legacy',
    case
      when jsonb_typeof(habits.media_summary -> 'unverified_legacy') = 'object'
        then habits.media_summary -> 'unverified_legacy'
      else '{}'::jsonb
    end
    || jsonb_build_object(
      'profile_stats',
      habits.media_summary -> 'profile_stats'
    )
  )
where jsonb_typeof(habits.media_summary -> 'profile_stats') = 'object'
  and habits.media_summary #> '{unverified_legacy,profile_stats}' is null;

-- PostgreSQL 17 does not provide max(uuid). The page is already sorted, so the
-- cursor is the final visible UUID selected explicitly.
create or replace function public.list_friendships_v2(
  p_limit integer default 50,
  p_after_player_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config_row private.social_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
  page_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  items jsonb;
  next_cursor uuid;
begin
  select config.* into config_row
  from private.social_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 social reads are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;

  with friendship_targets as (
    select case
      when relationships.player_low_id = actor_player_id
        then relationships.player_high_id
      else relationships.player_low_id
    end as target_player_id
    from public.social_relationships_v2 relationships
    where relationships.friendship_state = 'accepted'
      and actor_player_id in (
        relationships.player_low_id,
        relationships.player_high_id
      )
      and not private.are_players_blocked_v2(
        relationships.player_low_id,
        relationships.player_high_id
      )
  ), page as (
    select targets.target_player_id
    from friendship_targets targets
    where p_after_player_id is null
      or targets.target_player_id > p_after_player_id
    order by targets.target_player_id
    limit page_limit + 1
  ), visible_page as (
    select page.target_player_id
    from page
    order by page.target_player_id
    limit page_limit
  )
  select
    coalesce(
      jsonb_agg(
        private.social_relationship_snapshot_v2(
          actor_player_id,
          visible_page.target_player_id
        )
        order by visible_page.target_player_id
      ),
      '[]'::jsonb
    ),
    case
      when (select count(*) from page) > page_limit
        then (
          select visible_page.target_player_id
          from visible_page
          order by visible_page.target_player_id desc
          limit 1
        )
      else null
    end
  into items, next_cursor
  from visible_page;

  return jsonb_build_object(
    'contractVersion', 2,
    'items', items,
    'nextCursor', next_cursor
  );
end;
$$;

create or replace function public.list_blocked_players_v2(
  p_limit integer default 50,
  p_after_player_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config_row private.social_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
  page_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  items jsonb;
  next_cursor uuid;
  total_count integer;
begin
  select config.* into config_row
  from private.social_authority_config_v2 config
  where config.singleton;

  if not coalesce(config_row.reads_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 social reads are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;

  select count(*)::integer
  into total_count
  from public.player_blocks_v2 blocks
  where blocks.blocker_player_id = actor_player_id
    and blocks.active;

  with blocked_targets as (
    select
      blocks.blocked_player_id as target_player_id,
      blocks.blocked_at,
      nullif(blocks.reason_code, '') as reason_code
    from public.player_blocks_v2 blocks
    where blocks.blocker_player_id = actor_player_id
      and blocks.active
      and (
        p_after_player_id is null
        or blocks.blocked_player_id > p_after_player_id
      )
    order by blocks.blocked_player_id
    limit page_limit + 1
  ), visible_page as (
    select targets.*
    from blocked_targets targets
    order by targets.target_player_id
    limit page_limit
  ), projected as (
    select
      page.target_player_id,
      page.blocked_at,
      page.reason_code,
      canonical_profile.id as profile_id,
      legacy_profile.display_name,
      case
        when avatar.status = 'ready'
          and avatar.moderation_status = 'approved'
        then legacy_profile.avatar_media_id
        else null
      end as avatar_asset_id,
      private.social_relationship_snapshot_v2(
        actor_player_id,
        page.target_player_id
      ) as relationship
    from visible_page page
    left join public.player_profiles_v1 canonical_profile
      on canonical_profile.player_id = page.target_player_id
    left join public.profiles legacy_profile
      on legacy_profile.id = canonical_profile.legacy_profile_id
    left join public.media_assets avatar
      on avatar.id = legacy_profile.avatar_media_id
      and avatar.deleted_at is null
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'blockedAt', projected.blocked_at,
          'reasonCode', projected.reason_code,
          'relationship', projected.relationship,
          'player', jsonb_build_object(
            'playerId', projected.target_player_id,
            'profileId', projected.profile_id,
            'displayName', projected.display_name,
            'avatarAssetId', projected.avatar_asset_id
          )
        )
        order by projected.target_player_id
      ),
      '[]'::jsonb
    ),
    case
      when (select count(*) from blocked_targets) > page_limit
        then (
          select visible_page.target_player_id
          from visible_page
          order by visible_page.target_player_id desc
          limit 1
        )
      else null
    end
  into items, next_cursor
  from projected;

  return jsonb_build_object(
    'contractVersion', 2,
    'items', items,
    'nextCursor', next_cursor,
    'totalCount', total_count
  );
end;
$$;

revoke execute on function public.list_friendships_v2(integer, uuid)
  from public, anon;
grant execute on function public.list_friendships_v2(integer, uuid)
  to authenticated;

revoke execute on function public.list_blocked_players_v2(integer, uuid)
  from public, anon;
grant execute on function public.list_blocked_players_v2(integer, uuid)
  to authenticated, service_role;
