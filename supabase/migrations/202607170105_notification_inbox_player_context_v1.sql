-- Notification inbox player context v1
--
-- Keep notification events and deep links authoritative, while projecting the
-- current visible player identity and the exact source-message excerpt at read
-- time. Presentation fails closed after a block or player deletion and falls
-- back to the existing generic notification copy when context is unavailable.

create or replace function private.notification_primary_player_v1(
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
  target_lifecycle public.player_lifecycle_state;
  player_summary jsonb;
begin
  if p_viewer_player_id is null
    or p_target_player_id is null
    or p_viewer_player_id = p_target_player_id
  then
    return null;
  end if;

  if private.are_players_blocked_v2(
    p_viewer_player_id,
    p_target_player_id
  ) then
    return null;
  end if;

  select player.lifecycle_state
  into target_lifecycle
  from public.players as player
  where player.id = p_target_player_id;

  if target_lifecycle is null
    or target_lifecycle in ('deleting', 'deleted')
  then
    return null;
  end if;

  player_summary := private.player_summary_v1(p_target_player_id);
  if player_summary is null
    or nullif(btrim(player_summary ->> 'displayName'), '') is null
  then
    return null;
  end if;

  return jsonb_build_object(
    'playerId', p_target_player_id,
    'displayName', player_summary ->> 'displayName',
    'avatarAssetId', player_summary -> 'avatarAssetId'
  );
end;
$$;

create or replace function private.notification_presentation_v1(
  p_notification public.notifications_v1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target jsonb := p_notification.metadata -> 'target';
  primary_player_id uuid;
  primary_player jsonb;
  match_id_value uuid;
  conversation_id_value uuid;
  message_id_value uuid;
  excerpt_value text;
begin
  if p_notification.kind = 'match_created' then
    begin
      match_id_value := nullif(
        p_notification.deep_link ->> 'matchId',
        ''
      )::uuid;
    exception
      when invalid_text_representation then
        match_id_value := null;
    end;

    if match_id_value is not null then
      select case
        when match.player_low_id = p_notification.recipient_player_id
          then match.player_high_id
        when match.player_high_id = p_notification.recipient_player_id
          then match.player_low_id
        else null
      end
      into primary_player_id
      from public.matches as match
      where match.id = match_id_value;
    end if;

    primary_player := private.notification_primary_player_v1(
      p_notification.recipient_player_id,
      primary_player_id
    );

    return jsonb_build_object(
      'primaryPlayer', primary_player,
      'excerpt', null
    );
  end if;

  if p_notification.kind = 'message_received' then
    begin
      conversation_id_value := nullif(
        p_notification.deep_link ->> 'conversationId',
        ''
      )::uuid;
      message_id_value := nullif(target ->> 'messageId', '')::uuid;
      primary_player_id := nullif(target ->> 'senderPlayerId', '')::uuid;
    exception
      when invalid_text_representation then
        conversation_id_value := null;
        message_id_value := null;
        primary_player_id := null;
    end;

    primary_player := private.notification_primary_player_v1(
      p_notification.recipient_player_id,
      primary_player_id
    );

    if primary_player is not null
      and conversation_id_value is not null
      and message_id_value is not null
    then
      select left(
        regexp_replace(
          btrim(private.message_summary_json_v1(message) ->> 'preview'),
          '[[:space:]]+',
          ' ',
          'g'
        ),
        160
      )
      into excerpt_value
      from public.messages as message
      where message.id = message_id_value
        and message.conversation_id = conversation_id_value
        and message.sender_player_id_v1 = primary_player_id
        and message.schema_version_v1 = 1
        and message.deleted_at is null;
    end if;

    return jsonb_build_object(
      'primaryPlayer', primary_player,
      'excerpt', nullif(excerpt_value, '')
    );
  end if;

  return null;
end;
$$;

create or replace function private.notification_to_json_v1(
  p_notification public.notifications_v1
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'notificationId', p_notification.id,
    'recipientPlayerId', p_notification.recipient_player_id,
    'kind', p_notification.kind,
    'sourceEventId', p_notification.source_event_id,
    'occurredAt', p_notification.occurred_at,
    'seenAt', p_notification.seen_at,
    'readAt', p_notification.read_at,
    'deepLink', p_notification.deep_link,
    'presentation', private.notification_presentation_v1(p_notification)
  )
$$;

create or replace function public.list_notifications_without_lifecycle_guard_v1(
  p_cursor text default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
  cursor_value jsonb;
  cursor_occurred_at timestamptz;
  cursor_notification_id uuid;
  page_items jsonb;
  next_cursor text;
  latest_watermark jsonb;
  unseen_count integer;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_limit not between 1 and 100 then
    raise exception 'Invalid notification page size'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  if not private.return_loop_feature_enabled_v1('inbox', account_id) then
    raise exception 'Notification inbox is disabled for this cohort'
      using errcode = '55000', detail = 'notification_inbox_disabled';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(
    account_id,
    false
  );

  if p_cursor is not null then
    begin
      cursor_value := p_cursor::jsonb;
      cursor_occurred_at := (cursor_value ->> 'occurredAt')::timestamptz;
      cursor_notification_id := (cursor_value ->> 'notificationId')::uuid;
    exception
      when others then
        raise exception 'Invalid notification cursor'
          using errcode = '22023', detail = 'stale_cursor';
    end;
  end if;

  with page as (
    select notification
    from public.notifications_v1 as notification
    where notification.recipient_player_id = snapshot.player_id
      and (
        cursor_occurred_at is null
        or (notification.occurred_at, notification.id) <
          (cursor_occurred_at, cursor_notification_id)
      )
    order by notification.occurred_at desc, notification.id desc
    limit p_limit + 1
  ), limited as (
    select page.notification
    from page
    order by
      (page.notification).occurred_at desc,
      (page.notification).id desc
    limit p_limit
  )
  select
    coalesce(
      jsonb_agg(
        private.notification_to_json_v1(limited.notification)
        order by
          (limited.notification).occurred_at desc,
          (limited.notification).id desc
      ),
      '[]'::jsonb
    ),
    case
      when (select count(*) from page) > p_limit then (
        select jsonb_build_object(
          'occurredAt', (tail.notification).occurred_at,
          'notificationId', (tail.notification).id
        )::text
        from limited as tail
        order by
          (tail.notification).occurred_at asc,
          (tail.notification).id asc
        limit 1
      )
      else null
    end
  into page_items, next_cursor
  from limited;

  select jsonb_build_object(
    'notificationId', latest.id,
    'occurredAt', latest.occurred_at
  )
  into latest_watermark
  from public.notifications_v1 as latest
  where latest.recipient_player_id = snapshot.player_id
  order by latest.occurred_at desc, latest.id desc
  limit 1;

  select count(*)::integer
  into unseen_count
  from public.notifications_v1 as unseen
  where unseen.recipient_player_id = snapshot.player_id
    and unseen.seen_at is null;

  return jsonb_build_object(
    'items', page_items,
    'nextCursor', next_cursor,
    'latestWatermark', latest_watermark,
    'unseenCount', unseen_count
  );
end;
$$;

comment on function private.notification_primary_player_v1(uuid, uuid) is
  'Projects the current canonical PlayerSummaryV1 for a notification subject while failing closed after Social block or player deletion.';
comment on function private.notification_presentation_v1(public.notifications_v1) is
  'Derives read-model-only player identity and source-message excerpt from persisted notification authority.';

revoke all on function private.notification_primary_player_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.notification_presentation_v1(public.notifications_v1)
  from public, anon, authenticated;
revoke all on function private.notification_to_json_v1(public.notifications_v1)
  from public, anon, authenticated;
