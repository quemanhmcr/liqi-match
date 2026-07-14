-- Conversation mobile surface v1
--
-- Additive read models for the Expo client. Conversation/read/lifecycle semantics
-- remain owned by their authoritative tables and commands; legacy profile/media
-- rows are used only as a display projection.

create or replace function private.conversation_participant_surface_json_v1(
  p_participant public.conversation_participants_v1,
  p_viewer_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  player public.players%rowtype;
  legacy_profile public.profiles%rowtype;
  avatar public.media_assets%rowtype;
  display_name text;
  avatar_asset_id uuid;
begin
  select * into player
  from public.players
  where id = p_participant.player_id;

  if player.id is null then
    raise exception 'Canonical conversation participant is missing'
      using errcode = '22023', detail = 'conversation_contract_violation';
  end if;

  if p_participant.legacy_profile_id is not null then
    select * into legacy_profile
    from public.profiles
    where id = p_participant.legacy_profile_id;
  end if;

  display_name := case
    when player.lifecycle_state = 'deleted' then 'Người chơi đã xóa'
    else coalesce(nullif(btrim(legacy_profile.display_name), ''), 'Người chơi Liqi')
  end;

  if player.lifecycle_state <> 'deleted'
    and legacy_profile.avatar_media_id is not null
  then
    select * into avatar
    from public.media_assets
    where id = legacy_profile.avatar_media_id
      and visibility = 'public'
      and status = 'ready'
      and moderation_status = 'approved'
      and deleted_at is null;
    avatar_asset_id := avatar.id;
  end if;

  return jsonb_build_object(
    'playerId', p_participant.player_id,
    'profileId', p_participant.profile_id,
    'displayName', display_name,
    'avatarAssetId', avatar_asset_id,
    'isSelf', p_participant.player_id = p_viewer_player_id,
    'lifecycleState', player.lifecycle_state
  );
end;
$$;

create or replace function private.conversation_surface_json_v1(
  p_conversation_id uuid,
  p_viewer_player_id uuid,
  p_viewer_messaging_allowed boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conversation public.conversations%rowtype;
  viewer_member public.conversation_participants_v1%rowtype;
  snapshot jsonb;
  participant_surfaces jsonb;
  first_unread_message_id uuid;
begin
  select * into conversation
  from public.conversations
  where id = p_conversation_id;

  if conversation.id is null then
    raise exception 'Conversation not found'
      using errcode = 'P0002', detail = 'conversation_not_found';
  end if;

  select * into viewer_member
  from public.conversation_participants_v1
  where conversation_id = conversation.id
    and player_id = p_viewer_player_id;

  if viewer_member.conversation_id is null then
    raise exception 'Conversation membership required'
      using errcode = '42501', detail = 'conversation_forbidden';
  end if;

  snapshot := private.conversation_snapshot_json_v1(
    conversation.id,
    p_viewer_player_id
  );

  select coalesce(
    jsonb_agg(
      private.conversation_participant_surface_json_v1(
        participant,
        p_viewer_player_id
      )
      order by participant.player_id
    ),
    '[]'::jsonb
  ) into participant_surfaces
  from public.conversation_participants_v1 as participant
  where participant.conversation_id = conversation.id;

  select message.id into first_unread_message_id
  from public.messages as message
  where message.conversation_id = conversation.id
    and message.schema_version_v1 = 1
    and message.deleted_at is null
    and message.sequence_v1 > viewer_member.last_read_sequence
    and message.sender_player_id_v1 <> p_viewer_player_id
  order by message.sequence_v1
  limit 1;

  return jsonb_build_object(
    'conversation', snapshot,
    'participants', participant_surfaces,
    'viewer', jsonb_build_object(
      'playerId', p_viewer_player_id,
      'canMessage',
        conversation.state_v1 = 'open'
        and coalesce(p_viewer_messaging_allowed, false),
      'lastReadSequence', viewer_member.last_read_sequence,
      'firstUnreadMessageId', first_unread_message_id
    )
  );
end;
$$;

create or replace function public.get_conversation_surface_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_snapshot private.messaging_player_snapshot_v1;
begin
  if not private.conversation_reads_enabled_v1() then
    raise exception 'Conversation reads are disabled'
      using errcode = '55000', detail = 'conversation_reads_disabled';
  end if;

  actor_snapshot := private.require_authenticated_messaging_snapshot_v1(false);

  return private.conversation_surface_json_v1(
    p_conversation_id,
    actor_snapshot.player_id,
    actor_snapshot.state = 'active' and actor_snapshot.messaging_allowed
  );
end;
$$;

create or replace function public.get_conversation_inbox_page_v1(
  p_limit integer default 30,
  p_before_last_message_at timestamptz default null,
  p_before_conversation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_snapshot private.messaging_player_snapshot_v1;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
  items jsonb;
  total_count integer;
  unread_conversation_count integer;
  next_activity_at timestamptz;
  next_conversation_id uuid;
  has_next_page boolean;
begin
  if not private.conversation_reads_enabled_v1() then
    raise exception 'Conversation reads are disabled'
      using errcode = '55000', detail = 'conversation_reads_disabled';
  end if;

  if (p_before_last_message_at is null) <> (p_before_conversation_id is null) then
    raise exception 'Inbox cursor is incomplete'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  actor_snapshot := private.require_authenticated_messaging_snapshot_v1(false);

  with page as (
    select
      conversation.id,
      coalesce(conversation.last_message_at, conversation.created_at) as activity_at
    from public.conversation_participants_v1 as member
    join public.conversations as conversation
      on conversation.id = member.conversation_id
    where member.player_id = actor_snapshot.player_id
      and (
        p_before_last_message_at is null
        or (
          coalesce(conversation.last_message_at, conversation.created_at),
          conversation.id
        ) < (p_before_last_message_at, p_before_conversation_id)
      )
    order by activity_at desc, conversation.id desc
    limit safe_limit
  )
  select coalesce(
    jsonb_agg(
      private.conversation_surface_json_v1(
        page.id,
        actor_snapshot.player_id,
        actor_snapshot.state = 'active' and actor_snapshot.messaging_allowed
      )
      order by page.activity_at desc, page.id desc
    ),
    '[]'::jsonb
  ) into items
  from page;

  select
    count(*)::integer,
    count(*) filter (
      where private.conversation_unread_count_v1(
        member.conversation_id,
        actor_snapshot.player_id,
        member.last_read_sequence
      ) > 0
    )::integer
  into total_count, unread_conversation_count
  from public.conversation_participants_v1 as member
  where member.player_id = actor_snapshot.player_id;

  select
    coalesce(conversation.last_message_at, conversation.created_at),
    conversation.id
  into next_activity_at, next_conversation_id
  from public.conversation_participants_v1 as member
  join public.conversations as conversation
    on conversation.id = member.conversation_id
  where member.player_id = actor_snapshot.player_id
    and (
      p_before_last_message_at is null
      or (
        coalesce(conversation.last_message_at, conversation.created_at),
        conversation.id
      ) < (p_before_last_message_at, p_before_conversation_id)
    )
  order by coalesce(conversation.last_message_at, conversation.created_at) desc,
    conversation.id desc
  offset safe_limit - 1
  limit 1;

  if next_conversation_id is null then
    has_next_page := false;
  else
    select exists (
      select 1
      from public.conversation_participants_v1 as member
      join public.conversations as conversation
        on conversation.id = member.conversation_id
      where member.player_id = actor_snapshot.player_id
        and (
          coalesce(conversation.last_message_at, conversation.created_at),
          conversation.id
        ) < (next_activity_at, next_conversation_id)
    ) into has_next_page;
  end if;

  return jsonb_build_object(
    'items', items,
    'totalCount', coalesce(total_count, 0),
    'unreadConversationCount', coalesce(unread_conversation_count, 0),
    'pageInfo', jsonb_build_object(
      'hasNextPage', coalesce(has_next_page, false),
      'nextCursor', case
        when has_next_page then jsonb_build_object(
          'beforeLastMessageAt', next_activity_at,
          'beforeConversationId', next_conversation_id
        )
        else null
      end
    )
  );
end;
$$;

revoke execute on function public.get_conversation_surface_v1(uuid)
  from public, anon;
revoke execute on function public.get_conversation_inbox_page_v1(integer, timestamptz, uuid)
  from public, anon;

grant execute on function public.get_conversation_surface_v1(uuid)
  to authenticated;
grant execute on function public.get_conversation_inbox_page_v1(integer, timestamptz, uuid)
  to authenticated;

comment on function public.get_conversation_surface_v1(uuid) is
  'Authenticated ConversationSnapshotV1 plus display-only participant projection and viewer read/capability state.';
comment on function public.get_conversation_inbox_page_v1(integer, timestamptz, uuid) is
  'Keyset-paginated mobile inbox. Unread values derive only from authoritative read watermarks.';
