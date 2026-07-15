-- PostgreSQL three-valued boolean repair for relationship snapshots.
-- A missing relationship row must produce explicit Core V2 capability booleans,
-- never JSON nulls that force consumers to guess authority semantics.

create or replace function private.social_relationship_snapshot_v2(
  p_viewer_player_id uuid,
  p_target_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  relationship_row public.social_relationships_v2;
  request_row public.friendship_requests_v2;
  privacy_row public.player_privacy_settings_v2;
  viewer_player public.players;
  target_player public.players;
  relationship_id_value uuid;
  viewer_blocks_target boolean := false;
  target_blocks_viewer boolean := false;
  viewer_muted_target boolean := false;
  blocked boolean := false;
  friend boolean := false;
  active_match boolean := false;
  friendship_label text := 'none';
  friendship_state_value text := 'none';
  profile_visibility_value text := 'everyone';
  presence_visibility_value text := 'friends';
  friendship_requests_value text := 'everyone';
  session_invites_value text := 'friends';
  can_view_profile boolean := false;
  can_discover boolean := false;
  can_message boolean := false;
  can_invite boolean := false;
  can_view_presence boolean := false;
  can_request_friendship boolean := false;
begin
  if p_viewer_player_id is null or p_target_player_id is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'Both canonical PlayerIds are required.'
    );
  end if;
  if p_viewer_player_id = p_target_player_id then
    perform private.raise_core_error_v1(
      'relationship_self_forbidden',
      'A player cannot query a social relationship with self.'
    );
  end if;

  select players.* into viewer_player
  from public.players players
  where players.id = p_viewer_player_id;
  select players.* into target_player
  from public.players players
  where players.id = p_target_player_id;
  if viewer_player.id is null or target_player.id is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'One or more players do not exist.'
    );
  end if;

  relationship_id_value := private.social_relationship_id_v2(
    p_viewer_player_id,
    p_target_player_id
  );
  select relationships.* into relationship_row
  from public.social_relationships_v2 relationships
  where relationships.id = relationship_id_value;

  select requests.* into request_row
  from public.friendship_requests_v2 requests
  where requests.relationship_id = relationship_id_value
  order by requests.created_at desc, requests.id desc
  limit 1;

  select privacy.* into privacy_row
  from public.player_privacy_settings_v2 privacy
  where privacy.player_id = p_target_player_id;

  select exists (
    select 1
    from public.player_blocks_v2 blocks
    where blocks.active
      and blocks.blocker_player_id = p_viewer_player_id
      and blocks.blocked_player_id = p_target_player_id
  ) or exists (
    select 1
    from public.blocks legacy_blocks
    join public.player_profiles_v1 blocker_profile
      on blocker_profile.legacy_profile_id = legacy_blocks.blocker_id
    join public.player_profiles_v1 blocked_profile
      on blocked_profile.legacy_profile_id = legacy_blocks.blocked_id
    join private.social_authority_config_v2 config on config.singleton
    where config.legacy_block_shadow_reads_enabled
      and blocker_profile.player_id = p_viewer_player_id
      and blocked_profile.player_id = p_target_player_id
  ) into viewer_blocks_target;

  select exists (
    select 1
    from public.player_blocks_v2 blocks
    where blocks.active
      and blocks.blocker_player_id = p_target_player_id
      and blocks.blocked_player_id = p_viewer_player_id
  ) or exists (
    select 1
    from public.blocks legacy_blocks
    join public.player_profiles_v1 blocker_profile
      on blocker_profile.legacy_profile_id = legacy_blocks.blocker_id
    join public.player_profiles_v1 blocked_profile
      on blocked_profile.legacy_profile_id = legacy_blocks.blocked_id
    join private.social_authority_config_v2 config on config.singleton
    where config.legacy_block_shadow_reads_enabled
      and blocker_profile.player_id = p_target_player_id
      and blocked_profile.player_id = p_viewer_player_id
  ) into target_blocks_viewer;

  select exists (
    select 1
    from public.player_mutes_v2 mutes
    where mutes.active
      and mutes.muter_player_id = p_viewer_player_id
      and mutes.muted_player_id = p_target_player_id
  ) into viewer_muted_target;

  select exists (
    select 1
    from public.matches matches
    where matches.unmatched_at is null
      and matches.player_low_id = least(p_viewer_player_id, p_target_player_id)
      and matches.player_high_id = greatest(p_viewer_player_id, p_target_player_id)
  ) into active_match;

  blocked := viewer_blocks_target or target_blocks_viewer;
  friend := coalesce(relationship_row.friendship_state = 'accepted', false);
  friendship_state_value := case
    when request_row.state = 'pending' then 'pending'
    when relationship_row.friendship_state is null then 'none'
    else relationship_row.friendship_state::text
  end;
  friendship_label := case
    when friend then 'friend'
    when request_row.state = 'pending'
      and request_row.requester_player_id = p_viewer_player_id then 'pending_outgoing'
    when request_row.state = 'pending'
      and request_row.recipient_player_id = p_viewer_player_id then 'pending_incoming'
    when relationship_row.friendship_state = 'removed' then 'removed'
    else 'none'
  end;

  profile_visibility_value := coalesce(
    privacy_row.profile_visibility::text,
    'everyone'
  );
  presence_visibility_value := coalesce(
    privacy_row.presence_visibility::text,
    'friends'
  );
  friendship_requests_value := coalesce(
    privacy_row.friendship_requests::text,
    'everyone'
  );
  session_invites_value := coalesce(
    privacy_row.session_invites::text,
    'friends'
  );

  can_view_profile := coalesce(
    not blocked
    and target_player.lifecycle_state = 'active'
    and (
      profile_visibility_value = 'everyone'
      or (profile_visibility_value = 'friends' and friend)
    ),
    false
  );
  can_discover := coalesce(
    can_view_profile and target_player.discoverable,
    false
  );
  can_message := coalesce(
    not blocked
    and viewer_player.lifecycle_state = 'active'
    and target_player.lifecycle_state = 'active'
    and viewer_player.messaging_allowed
    and target_player.messaging_allowed
    and (friend or active_match),
    false
  );
  can_invite := coalesce(
    not blocked
    and viewer_player.lifecycle_state = 'active'
    and target_player.lifecycle_state = 'active'
    and (
      session_invites_value = 'everyone'
      or (session_invites_value = 'friends' and friend)
    ),
    false
  );
  can_view_presence := coalesce(
    not blocked
    and target_player.lifecycle_state = 'active'
    and (
      presence_visibility_value = 'everyone'
      or (presence_visibility_value = 'friends' and friend)
    ),
    false
  );
  can_request_friendship := coalesce(
    not blocked
    and viewer_player.lifecycle_state = 'active'
    and target_player.lifecycle_state = 'active'
    and not friend
    and coalesce(request_row.state::text, '') <> 'pending'
    and (
      friendship_requests_value = 'everyone'
      or (friendship_requests_value = 'matched_only' and active_match)
    ),
    false
  );

  return jsonb_build_object(
    'contractVersion', 2,
    'relationshipId', relationship_id_value,
    'viewerPlayerId', p_viewer_player_id,
    'targetPlayerId', p_target_player_id,
    'version', coalesce(relationship_row.version, 0),
    'friendship', jsonb_build_object(
      'state', friendship_state_value,
      'label', friendship_label,
      'requestId', request_row.id,
      'requestState', request_row.state,
      'requestVersion', request_row.version,
      'acceptedAt', relationship_row.accepted_at
    ),
    'block', jsonb_build_object(
      'viewerBlocksTarget', viewer_blocks_target,
      'targetBlocksViewer', target_blocks_viewer
    ),
    'mute', jsonb_build_object(
      'viewerMutedTarget', viewer_muted_target
    ),
    'targetPrivacy', jsonb_build_object(
      'contractVersion', 2,
      'playerId', p_target_player_id,
      'version', coalesce(privacy_row.version, 1),
      'profileVisibility', profile_visibility_value,
      'presenceVisibility', presence_visibility_value,
      'friendshipRequests', friendship_requests_value,
      'sessionInvites', session_invites_value,
      'updatedAt', coalesce(privacy_row.updated_at, target_player.created_at)
    ),
    'capabilities', jsonb_build_object(
      'blocked', blocked,
      'muted', viewer_muted_target,
      'friendshipLabel', friendship_label,
      'canViewProfile', can_view_profile,
      'canDiscover', can_discover,
      'canMessage', can_message,
      'canViewConversation', can_message,
      'canInviteToSession', can_invite,
      'canViewPresence', can_view_presence,
      'canRequestFriendship', can_request_friendship,
      'canAcceptFriendship', not blocked and friendship_label = 'pending_incoming',
      'canDeclineFriendship', not blocked and friendship_label = 'pending_incoming',
      'canCancelFriendship', not blocked and friendship_label = 'pending_outgoing',
      'canRemoveFriendship', not blocked and friend,
      'canBlock', not viewer_blocks_target,
      'canUnblock', viewer_blocks_target,
      'canMute', not blocked and not viewer_muted_target,
      'canUnmute', not blocked and viewer_muted_target,
      'canReport', true
    ),
    'updatedAt', coalesce(
      greatest(
        relationship_row.updated_at,
        request_row.updated_at,
        privacy_row.updated_at
      ),
      relationship_row.updated_at,
      request_row.updated_at,
      privacy_row.updated_at,
      target_player.updated_at
    )
  );
end;
$$;

revoke execute on function private.social_relationship_snapshot_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.social_relationship_snapshot_v2(uuid, uuid)
  to service_role;
