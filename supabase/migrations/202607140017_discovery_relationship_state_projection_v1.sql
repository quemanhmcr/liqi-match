-- Keep the persistence enum (like/pass) internal while projecting the
-- executable Discovery contract vocabulary (none/liked/passed).

create or replace function private.create_discovery_snapshot_v1(
  p_viewer_player_id uuid,
  p_viewer_legacy_profile_id uuid,
  p_match_intent_id uuid,
  p_intent_version bigint,
  p_viewer_filters jsonb
)
returns private.discovery_snapshots_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_row private.discovery_snapshots_v1%rowtype;
  candidate_count integer;
begin
  insert into private.discovery_snapshots_v1 (
    viewer_player_id,
    match_intent_id,
    intent_version,
    expires_at
  ) values (
    p_viewer_player_id,
    p_match_intent_id,
    p_intent_version,
    now() + interval '10 minutes'
  )
  returning * into snapshot_row;

  with eligible_candidates as (
    select
      candidate.id as candidate_player_id,
      canonical_profile.id as candidate_profile_id,
      canonical_profile.version as candidate_profile_version,
      canonical_profile.legacy_profile_id,
      legacy_profile.display_name,
      case
        when avatar.status = 'ready'
          and avatar.moderation_status = 'approved'
        then legacy_profile.avatar_media_id
        else null
      end as avatar_asset_id,
      rank_row.id as rank_id,
      rank_row.slug as rank_slug,
      rank_row.name as rank_name,
      primary_role.id as role_id,
      primary_role.slug as role_slug,
      primary_role.name as role_name,
      candidate_intent.filters as candidate_filters,
      relationship.decision,
      40
        + case
            when coalesce(candidate_intent.filters ->> 'intentKind', 'normal')
              = coalesce(p_viewer_filters ->> 'intentKind', 'normal')
            then 30 else 0
          end
        + case
            when candidate_intent.filters ->> 'mode'
              = p_viewer_filters ->> 'mode'
            then 10 else 0
          end
        + case
            when candidate_intent.filters ->> 'partyFormat'
              = p_viewer_filters ->> 'partyFormat'
            then 20 else 0
          end as recommendation_score
    from public.players candidate
    join public.player_profiles_v1 canonical_profile
      on canonical_profile.player_id = candidate.id
    join public.profiles legacy_profile
      on legacy_profile.id = canonical_profile.legacy_profile_id
      and legacy_profile.deleted_at is null
    join public.match_intents_v1 candidate_intent
      on candidate_intent.player_id = candidate.id
      and candidate_intent.state = 'active'
      and candidate_intent.expires_at > now()
    left join public.game_profiles game_profile
      on game_profile.profile_id = canonical_profile.legacy_profile_id
    left join public.ranks rank_row on rank_row.id = game_profile.rank_id
    left join public.media_assets avatar
      on avatar.id = legacy_profile.avatar_media_id
      and avatar.deleted_at is null
    left join lateral (
      select roles.id, roles.slug, roles.name
      from public.profile_roles profile_roles
      join public.roles roles on roles.id = profile_roles.role_id
      where profile_roles.profile_id = canonical_profile.legacy_profile_id
      order by roles.slug, roles.id
      limit 1
    ) primary_role on true
    left join public.relationship_decisions_v1 relationship
      on relationship.actor_player_id = p_viewer_player_id
      and relationship.target_player_id = candidate.id
    where candidate.id <> p_viewer_player_id
      and private.is_player_discovery_eligible_v1(candidate.id)
      and not private.are_profiles_blocked(
        p_viewer_legacy_profile_id,
        canonical_profile.legacy_profile_id
      )
      and coalesce(relationship.decision::text, 'none') <> 'pass'
      and not exists (
        select 1
        from public.matches matches
        where matches.player_low_id = least(p_viewer_player_id, candidate.id)
          and matches.player_high_id = greatest(p_viewer_player_id, candidate.id)
      )
  ),
  ranked_candidates as (
    select
      row_number() over (
        order by recommendation_score desc, candidate_player_id
      )::integer as ordinal,
      eligible_candidates.*
    from eligible_candidates
  )
  insert into private.discovery_snapshot_candidates_v1 (
    snapshot_id,
    ordinal,
    candidate_player_id,
    score,
    payload
  )
  select
    snapshot_row.id,
    ranked.ordinal,
    ranked.candidate_player_id,
    ranked.recommendation_score,
    jsonb_build_object(
      'playerId', ranked.candidate_player_id,
      'profileSummary', jsonb_build_object(
        'playerId', ranked.candidate_player_id,
        'profileId', ranked.candidate_profile_id,
        'profileVersion', ranked.candidate_profile_version,
        'displayName', ranked.display_name,
        'avatarAssetId', ranked.avatar_asset_id,
        'avatarUrl', null,
        'rank', case
          when ranked.rank_id is null then null
          else jsonb_build_object(
            'id', ranked.rank_id,
            'slug', ranked.rank_slug,
            'name', ranked.rank_name
          )
        end,
        'primaryRole', case
          when ranked.role_id is null then null
          else jsonb_build_object(
            'id', ranked.role_id,
            'slug', ranked.role_slug,
            'name', ranked.role_name
          )
        end
      ),
      'relationshipState', case ranked.decision
        when 'like' then 'liked'
        when 'pass' then 'passed'
        else 'none'
      end,
      'capabilities', jsonb_build_object(
        'canLike', ranked.decision is distinct from 'like',
        'canPass', ranked.decision is distinct from 'pass',
        'canInvite', false
      ),
      'recommendationContext', jsonb_build_object(
        'score', ranked.recommendation_score,
        'reasonCodes', to_jsonb(array_remove(array[
          'active_now'::text,
          case
            when coalesce(ranked.candidate_filters ->> 'intentKind', 'normal')
              = coalesce(p_viewer_filters ->> 'intentKind', 'normal')
            then 'intent_kind_overlap'
          end,
          case
            when ranked.candidate_filters ->> 'mode'
              = p_viewer_filters ->> 'mode'
            then 'mode_overlap'
          end,
          case
            when ranked.candidate_filters ->> 'partyFormat'
              = p_viewer_filters ->> 'partyFormat'
            then 'party_format_overlap'
          end,
          case when ranked.decision = 'like' then 'previous_like' end
        ], null))
      )
    )
  from ranked_candidates ranked;

  get diagnostics candidate_count = row_count;

  update private.discovery_snapshots_v1
  set total_candidates = candidate_count
  where id = snapshot_row.id
  returning * into snapshot_row;

  return snapshot_row;
end;
$$;
