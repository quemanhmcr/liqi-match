-- Core V2 Conversation mobile surface
--
-- Additive display/read projection for the Expo Messages UI. Conversation,
-- membership, read, lifecycle, profile and media authorities remain unchanged.
-- Legacy profile rows are display-only and V1 message rows remain in place.

create or replace function private.conversation_participant_surface_json_v2(
  p_member public.conversation_members_v2,
  p_viewer_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  player_row public.players%rowtype;
  profile_mapping public.player_profiles_v1%rowtype;
  legacy_profile public.profiles%rowtype;
  avatar public.media_assets%rowtype;
  display_name_value text;
  avatar_asset_id_value uuid;
begin
  select * into player_row
  from public.players players
  where players.id = p_member.player_id;
  if player_row.id is null then
    perform private.raise_core_error_v1(
      'conversation_contract_violation',
      'Canonical conversation participant is missing.'
    );
  end if;

  select * into profile_mapping
  from public.player_profiles_v1 profiles
  where profiles.player_id = p_member.player_id;
  if profile_mapping.id is null then
    perform private.raise_core_error_v1(
      'conversation_contract_violation',
      'Canonical conversation participant profile is missing.'
    );
  end if;

  if profile_mapping.legacy_profile_id is not null then
    select * into legacy_profile
    from public.profiles profiles
    where profiles.id = profile_mapping.legacy_profile_id;
  end if;

  display_name_value := case
    when player_row.lifecycle_state = 'deleted' then 'Người chơi đã xóa'
    else coalesce(nullif(btrim(legacy_profile.display_name), ''), 'Người chơi Liqi')
  end;

  if player_row.lifecycle_state <> 'deleted'
    and legacy_profile.avatar_media_id is not null
  then
    select * into avatar
    from public.media_assets assets
    where assets.id = legacy_profile.avatar_media_id
      and assets.visibility = 'public'
      and assets.status = 'ready'
      and assets.moderation_status = 'approved'
      and assets.deleted_at is null;
    avatar_asset_id_value := avatar.id;
  end if;

  return jsonb_build_object(
    'playerId', p_member.player_id,
    'profileId', profile_mapping.id,
    'displayName', display_name_value,
    'avatarAssetId', avatar_asset_id_value,
    'isSelf', p_member.player_id = p_viewer_player_id,
    'lifecycleState', player_row.lifecycle_state,
    'role', p_member.role,
    'memberState', p_member.state
  );
end;
$$;

create or replace function private.conversation_latest_message_json_v2(
  p_conversation public.conversations_v2
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with combined as (
    select
      messages.sequence,
      private.message_json_v2(messages) as item
    from public.messages_v2 messages
    where messages.conversation_id = p_conversation.id
    union all
    select
      legacy.sequence_v1 as sequence,
      jsonb_build_object(
        'messageId', legacy.id,
        'conversationId', p_conversation.id,
        'senderPlayerId', legacy.sender_player_id_v1,
        'clientMessageId', legacy.client_message_id_v1,
        'sequence', legacy.sequence_v1,
        'content', legacy.content_v1,
        'createdAt', legacy.created_at,
        'tombstonedAt', legacy.deleted_at,
        'legacy', true
      ) as item
    from public.messages legacy
    where p_conversation.legacy_conversation_id is not null
      and legacy.conversation_id = p_conversation.legacy_conversation_id
      and legacy.schema_version_v1 = 1
  )
  select combined.item
  from combined
  order by combined.sequence desc
  limit 1;
$$;

create or replace function private.conversation_first_unread_message_id_v2(
  p_conversation public.conversations_v2,
  p_viewer_player_id uuid,
  p_last_read_sequence bigint
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with combined as (
    select messages.id, messages.sequence, messages.sender_player_id
    from public.messages_v2 messages
    where messages.conversation_id = p_conversation.id
    union all
    select legacy.id, legacy.sequence_v1, legacy.sender_player_id_v1
    from public.messages legacy
    where p_conversation.legacy_conversation_id is not null
      and legacy.conversation_id = p_conversation.legacy_conversation_id
      and legacy.schema_version_v1 = 1
  )
  select combined.id
  from combined
  where combined.sequence > p_last_read_sequence
    and combined.sender_player_id is distinct from p_viewer_player_id
  order by combined.sequence
  limit 1;
$$;

create or replace function private.conversation_mobile_surface_json_v2(
  p_conversation_id uuid,
  p_viewer_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conversation public.conversations_v2%rowtype;
  access jsonb;
  cursor public.conversation_read_cursors_v2%rowtype;
  participant_surfaces jsonb;
  latest_message jsonb;
  muted_value boolean;
  unread_count_value bigint;
  first_unread_message_id_value uuid;
begin
  select * into conversation
  from public.conversations_v2 conversations
  where conversations.id = p_conversation_id;
  if conversation.id is null then
    perform private.raise_core_error_v1(
      'conversation_not_found',
      'Conversation was not found.'
    );
  end if;

  access := private.assert_conversation_access_v2(
    conversation.id,
    p_viewer_player_id,
    'read'
  );

  select * into cursor
  from public.conversation_read_cursors_v2 cursors
  where cursors.conversation_id = conversation.id
    and cursors.player_id = p_viewer_player_id;
  if cursor.player_id is null then
    perform private.raise_core_error_v1(
      'conversation_contract_violation',
      'Conversation read cursor is missing.'
    );
  end if;

  select coalesce(
    jsonb_agg(
      private.conversation_participant_surface_json_v2(
        members,
        p_viewer_player_id
      ) order by
        case when members.role = 'owner' then 0 else 1 end,
        members.joined_at,
        members.player_id
    ),
    '[]'::jsonb
  ) into participant_surfaces
  from public.conversation_members_v2 members
  where members.conversation_id = conversation.id
    and members.state = 'active'
    and members.can_view_conversation;

  latest_message := private.conversation_latest_message_json_v2(conversation);
  unread_count_value := greatest(
    conversation.last_sequence - cursor.last_read_sequence,
    0
  );
  first_unread_message_id_value := private.conversation_first_unread_message_id_v2(
    conversation,
    p_viewer_player_id,
    cursor.last_read_sequence
  );
  select coalesce(mutes.muted or mutes.relationship_muted, false)
  into muted_value
  from public.conversation_mutes_v2 mutes
  where mutes.conversation_id = conversation.id
    and mutes.player_id = p_viewer_player_id;

  return private.conversation_snapshot_v2(conversation.id) || jsonb_build_object(
    'participants', participant_surfaces,
    'viewer', access,
    'readCursor', jsonb_build_object(
      'conversationId', cursor.conversation_id,
      'playerId', cursor.player_id,
      'lastReadSequence', cursor.last_read_sequence,
      'version', cursor.version,
      'updatedAt', cursor.updated_at
    ),
    'muted', coalesce(muted_value, false),
    'unreadCount', unread_count_value,
    'firstUnreadMessageId', first_unread_message_id_value,
    'latestMessage', latest_message
  );
end;
$$;

create or replace function public.get_conversation_mobile_surface_v2(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
begin
  perform private.assert_conversation_feature_v2('read');
  actor := private.resolve_conversation_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;
  return private.conversation_mobile_surface_json_v2(
    p_conversation_id,
    actor_player_id
  );
end;
$$;

create or replace function public.list_conversation_mobile_inbox_v2(
  p_limit integer default 30,
  p_before_updated_at timestamptz default null,
  p_before_conversation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
  items jsonb;
  total_count integer;
  unread_conversation_count integer;
  next_updated_at timestamptz;
  next_conversation_id uuid;
  has_next_page boolean := false;
begin
  perform private.assert_conversation_feature_v2('read');
  actor := private.resolve_conversation_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;
  if (p_before_updated_at is null) <> (p_before_conversation_id is null) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Inbox cursor is incomplete.'
    );
  end if;

  with eligible as (
    select conversations.id, conversations.updated_at
    from public.conversation_members_v2 members
    join public.conversations_v2 conversations
      on conversations.id = members.conversation_id
    where members.player_id = actor_player_id
      and (
        private.conversation_access_v2(
          conversations.id,
          actor_player_id
        ) ->> 'canRead'
      )::boolean
      and (
        p_before_updated_at is null
        or (conversations.updated_at, conversations.id)
          < (p_before_updated_at, p_before_conversation_id)
      )
    order by conversations.updated_at desc, conversations.id desc
    limit safe_limit + 1
  ), retained as (
    select eligible.*
    from eligible
    order by eligible.updated_at desc, eligible.id desc
    limit safe_limit
  )
  select
    coalesce(
      jsonb_agg(
        private.conversation_mobile_surface_json_v2(
          retained.id,
          actor_player_id
        ) order by retained.updated_at desc, retained.id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > safe_limit from eligible),
    (array_agg(retained.updated_at order by retained.updated_at desc, retained.id desc))[safe_limit],
    (array_agg(retained.id order by retained.updated_at desc, retained.id desc))[safe_limit]
  into items, has_next_page, next_updated_at, next_conversation_id
  from retained;

  select
    count(*)::integer,
    count(*) filter (
      where conversations.last_sequence > cursors.last_read_sequence
    )::integer
  into total_count, unread_conversation_count
  from public.conversation_members_v2 members
  join public.conversations_v2 conversations
    on conversations.id = members.conversation_id
  join public.conversation_read_cursors_v2 cursors
    on cursors.conversation_id = conversations.id
    and cursors.player_id = actor_player_id
  where members.player_id = actor_player_id
    and (
      private.conversation_access_v2(
        conversations.id,
        actor_player_id
      ) ->> 'canRead'
    )::boolean;

  return jsonb_build_object(
    'items', items,
    'totalCount', coalesce(total_count, 0),
    'unreadConversationCount', coalesce(unread_conversation_count, 0),
    'pageInfo', jsonb_build_object(
      'hasNextPage', coalesce(has_next_page, false),
      'nextCursor', case
        when has_next_page then jsonb_build_object(
          'beforeUpdatedAt', next_updated_at,
          'beforeConversationId', next_conversation_id
        )
        else null
      end
    )
  );
end;
$$;

revoke execute on function public.get_conversation_mobile_surface_v2(uuid)
  from public, anon;
revoke execute on function public.list_conversation_mobile_inbox_v2(integer,timestamptz,uuid)
  from public, anon;
grant execute on function public.get_conversation_mobile_surface_v2(uuid)
  to authenticated;
grant execute on function public.list_conversation_mobile_inbox_v2(integer,timestamptz,uuid)
  to authenticated;

comment on function public.get_conversation_mobile_surface_v2(uuid) is
  'Authenticated Core V2 conversation read surface with canonical participant display, viewer access, cursor, unread and latest-message projections.';
comment on function public.list_conversation_mobile_inbox_v2(integer,timestamptz,uuid) is
  'Keyset-paginated Core V2 mobile inbox. Cursor references the final retained item so page transitions cannot skip a conversation.';
