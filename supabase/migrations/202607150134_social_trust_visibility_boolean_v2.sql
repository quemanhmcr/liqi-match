-- Trust visibility must return explicit boolean authority for strangers.
-- Missing relationship rows are not friendships and must fail closed as false,
-- never leak SQL null into the Core V2 provider contract.

create or replace function private.social_trust_visibility_decision_v2(
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
  privacy_row public.player_privacy_settings_v2;
  target_player public.players;
  relationship_id_value uuid;
  blocked_value boolean;
  friend_value boolean;
  trust_visibility_value text;
  can_view_trust_value boolean;
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
      'Cross-player trust visibility requires two distinct players.'
    );
  end if;

  select players.* into target_player
  from public.players players
  where players.id = p_target_player_id;
  if target_player.id is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'The target player does not exist.'
    );
  end if;

  relationship_id_value := private.social_relationship_id_v2(
    p_viewer_player_id,
    p_target_player_id
  );
  select relationships.* into relationship_row
  from public.social_relationships_v2 relationships
  where relationships.id = relationship_id_value;
  select privacy.* into privacy_row
  from public.player_privacy_settings_v2 privacy
  where privacy.player_id = p_target_player_id;

  blocked_value := private.are_players_blocked_v2(
    p_viewer_player_id,
    p_target_player_id
  );
  friend_value := coalesce(relationship_row.friendship_state = 'accepted', false);
  trust_visibility_value := coalesce(
    privacy_row.trust_visibility::text,
    'friends'
  );
  can_view_trust_value := coalesce(
    not blocked_value
    and target_player.lifecycle_state = 'active'
    and (
      trust_visibility_value = 'everyone'
      or (trust_visibility_value = 'friends' and friend_value)
    ),
    false
  );

  return jsonb_build_object(
    'contractVersion', 2,
    'viewerPlayerId', p_viewer_player_id,
    'targetPlayerId', p_target_player_id,
    'relationshipVersion', coalesce(relationship_row.version, 0),
    'privacyVersion', coalesce(privacy_row.version, 1),
    'trustVisibility', trust_visibility_value,
    'blocked', blocked_value,
    'canViewTrust', can_view_trust_value
  );
end;
$$;

revoke execute on function private.social_trust_visibility_decision_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.social_trust_visibility_decision_v2(uuid, uuid)
  to service_role;
