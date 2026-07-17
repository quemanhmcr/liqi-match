-- Inclusive Social Hub relationship read model.
-- Keeps list_friendships_v2 accepted-only for existing consumers.

create or replace function public.list_social_relationships_v2(
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

  with candidate_targets as (
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

    union

    select case
      when requests.requester_player_id = actor_player_id
        then requests.recipient_player_id
      else requests.requester_player_id
    end as target_player_id
    from public.friendship_requests_v2 requests
    where requests.state = 'pending'
      and requests.expires_at > clock_timestamp()
      and actor_player_id in (
        requests.requester_player_id,
        requests.recipient_player_id
      )
  ), eligible_targets as (
    select candidates.target_player_id
    from candidate_targets candidates
    where not private.are_players_blocked_v2(
      actor_player_id,
      candidates.target_player_id
    )
      and (
        p_after_player_id is null
        or candidates.target_player_id > p_after_player_id
      )
  ), page as (
    select eligible.target_player_id
    from eligible_targets eligible
    order by eligible.target_player_id
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

revoke execute on function public.list_social_relationships_v2(integer, uuid)
  from public, anon;
grant execute on function public.list_social_relationships_v2(integer, uuid)
  to authenticated, service_role;
