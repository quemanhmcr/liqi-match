-- Product-facing Match Set dashboard and privacy-aware identity presentation.
-- Both functions remain authority reads: clients never read party or profile tables directly.

create or replace function private.match_set_snapshot_v2(p_set_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'setId', sets.id,
    'ownerPlayerId', sets.owner_player_id,
    'title', sets.title,
    'intentKind', sets.intent_kind,
    'capacity', sets.capacity,
    'state', sets.state,
    'version', sets.version,
    'closeReason', sets.close_reason,
    'closedAt', sets.closed_at,
    'expiresAt', sets.expires_at,
    'createdAt', sets.created_at,
    'updatedAt', sets.updated_at,
    'members', private.match_set_membership_snapshot_v2(sets.id)
  )
  from public.match_sets_v2 sets
  where sets.id = p_set_id;
$$;

create or replace function public.get_match_set_dashboard_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
begin
  perform private.assert_party_session_feature_v2('read');
  actor_mapping := private.resolve_party_session_actor_v2(true, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  return jsonb_build_object(
    'sets', coalesce((
      select jsonb_agg(items.snapshot order by items.updated_at desc, items.set_id)
      from (
        select distinct sets.id as set_id, sets.updated_at,
               private.match_set_snapshot_v2(sets.id) as snapshot
        from public.match_sets_v2 sets
        join public.match_set_members_v2 members on members.set_id = sets.id
        where members.player_id = actor_player_id
        order by sets.updated_at desc, sets.id
        limit 100
      ) items
    ), '[]'::jsonb),
    'incomingInvites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'inviteId', invites.id,
        'set', private.match_set_snapshot_v2(invites.set_id),
        'inviterPlayerId', invites.inviter_player_id,
        'targetPlayerId', invites.target_player_id,
        'state', invites.state,
        'version', invites.version,
        'expiresAt', invites.expires_at,
        'createdAt', invites.created_at
      ) order by invites.created_at desc, invites.id)
      from public.match_set_invites_v2 invites
      where invites.target_player_id = actor_player_id and invites.state = 'pending'
    ), '[]'::jsonb),
    'outgoingInvites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'inviteId', invites.id,
        'set', private.match_set_snapshot_v2(invites.set_id),
        'inviterPlayerId', invites.inviter_player_id,
        'targetPlayerId', invites.target_player_id,
        'state', invites.state,
        'version', invites.version,
        'expiresAt', invites.expires_at,
        'createdAt', invites.created_at
      ) order by invites.created_at desc, invites.id)
      from public.match_set_invites_v2 invites
      join public.match_sets_v2 sets on sets.id = invites.set_id
      where (sets.owner_player_id = actor_player_id or invites.inviter_player_id = actor_player_id)
        and invites.state = 'pending'
    ), '[]'::jsonb),
    'outgoingJoinRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'joinRequestId', requests.id,
        'set', private.match_set_snapshot_v2(requests.set_id),
        'requesterPlayerId', requests.requester_player_id,
        'state', requests.state,
        'version', requests.version,
        'expiresAt', requests.expires_at,
        'createdAt', requests.created_at
      ) order by requests.created_at desc, requests.id)
      from public.match_set_join_requests_v2 requests
      where requests.requester_player_id = actor_player_id and requests.state = 'pending'
    ), '[]'::jsonb),
    'incomingJoinRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'joinRequestId', requests.id,
        'set', private.match_set_snapshot_v2(requests.set_id),
        'requesterPlayerId', requests.requester_player_id,
        'state', requests.state,
        'version', requests.version,
        'expiresAt', requests.expires_at,
        'createdAt', requests.created_at
      ) order by requests.created_at desc, requests.id)
      from public.match_set_join_requests_v2 requests
      join public.match_sets_v2 sets on sets.id = requests.set_id
      where sets.owner_player_id = actor_player_id and requests.state = 'pending'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_visible_player_identities_v2(p_player_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_context jsonb;
  actor_player_id uuid;
  requested_count integer;
begin
  actor_context := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  requested_count := coalesce(cardinality(p_player_ids), 0);
  if requested_count > 50 then
    perform private.raise_core_error_v1('validation_failed', 'At most 50 player identities may be resolved.');
  end if;

  return coalesce((
    select jsonb_agg(identity.summary order by identity.ordinal)
    from (
      select requested.ordinal, private.player_summary_v1(requested.player_id) as summary
      from unnest(coalesce(p_player_ids, array[]::uuid[])) with ordinality requested(player_id, ordinal)
      where requested.player_id is not null
        and not private.are_players_blocked_v2(actor_player_id, requested.player_id)
        and (
          requested.player_id = actor_player_id
          or exists (
            select 1
            from public.match_set_members_v2 left_member
            join public.match_set_members_v2 right_member
              on right_member.set_id = left_member.set_id
            where left_member.player_id = actor_player_id
              and right_member.player_id = requested.player_id
              and left_member.state = 'active'
              and right_member.state = 'active'
          )
          or exists (
            select 1
            from public.play_session_members_v2 left_member
            join public.play_session_members_v2 right_member
              on right_member.session_id = left_member.session_id
            where left_member.player_id = actor_player_id
              and right_member.player_id = requested.player_id
              and left_member.state = 'active'
              and right_member.state = 'active'
          )
          or coalesce((private.social_relationship_snapshot_v2(
            actor_player_id,
            requested.player_id
          ) #>> '{capabilities,canViewProfile}')::boolean, false)
        )
    ) identity
    where identity.summary is not null
  ), '[]'::jsonb);
end;
$$;

comment on function public.get_match_set_dashboard_v2() is
  'Authority-backed My Sets, Set inbox, outgoing requests, and owner moderation projection.';
comment on function public.list_visible_player_identities_v2(uuid[]) is
  'Privacy-aware identity presentation for shared Set, Session, friendship, and self contexts.';

revoke execute on function public.get_match_set_dashboard_v2() from public, anon;
revoke execute on function public.list_visible_player_identities_v2(uuid[]) from public, anon;
grant execute on function public.get_match_set_dashboard_v2() to authenticated, service_role;
grant execute on function public.list_visible_player_identities_v2(uuid[]) to authenticated, service_role;
