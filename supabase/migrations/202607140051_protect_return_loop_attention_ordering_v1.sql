-- Protect user read state from delayed or concurrently delivered message-attention
-- callbacks. Timestamp-only last-writer-wins allowed an older notification to
-- leave unread state unchanged but still enqueue a user-visible push. Persist an
-- explicit attention priority and decide push eligibility from the same atomic
-- projection upsert: message=1, user read=2.

alter table private.home_conversation_projection_v1
  add column last_attention_priority smallint not null default 0
  check (last_attention_priority between 0 and 2);

update private.home_conversation_projection_v1 as projection
set last_attention_priority = case
  when exists (
    select 1
    from public.notifications_v1 as notification
    where notification.source_event_id = projection.last_attention_event_id
      and notification.kind = 'message_received'
  ) then 1
  when projection.last_attention_event_id is not null then 2
  else 0
end;

create or replace function private.persist_notification_requested_v1(p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid := (p_event ->> 'eventId')::uuid;
  occurred_at_value timestamptz := (p_event ->> 'occurredAt')::timestamptz;
  event_data jsonb := p_event -> 'data';
  target jsonb := event_data -> 'target';
  recipient_player_id_value uuid := (event_data ->> 'recipientPlayerId')::uuid;
  reason_code_value text := event_data ->> 'reasonCode';
  recipient_snapshot private.return_loop_player_snapshot_v1;
  notification_kind_value public.notification_kind_v1;
  deep_link_value jsonb;
  notification_title text;
  notification_body text;
  foreground_policy_value text := 'allow_push';
  notification_id_value uuid;
  attention_projection_applied boolean := false;
  existing public.notifications_v1%rowtype;
begin
  recipient_snapshot := private.require_return_loop_player_snapshot_by_player_v1(
    recipient_player_id_value,
    false
  );

  if recipient_snapshot.state <> 'active' then
    insert into private.return_loop_suppressed_events_v1 (
      event_id,
      event_type,
      recipient_player_id,
      reason,
      occurred_at
    ) values (
      event_id_value,
      'notification.requested.v1',
      recipient_player_id_value,
      'recipient_lifecycle_' || recipient_snapshot.state,
      occurred_at_value
    )
    on conflict (event_id) do nothing;
    return null;
  end if;

  if reason_code_value = 'match_created' and target ->> 'kind' = 'match' then
    notification_kind_value := 'match_created';
    deep_link_value := jsonb_build_object('target', 'match', 'matchId', target ->> 'matchId');
    notification_title := 'Bạn có một match mới';
    notification_body := 'Mở Liqi để xem người chơi vừa match với bạn.';
  elsif reason_code_value = 'message_received' and target ->> 'kind' = 'conversation' then
    notification_kind_value := 'message_received';
    deep_link_value := jsonb_build_object(
      'target', 'conversation',
      'conversationId', target ->> 'conversationId'
    );
    notification_title := 'Bạn có tin nhắn mới';
    notification_body := 'Mở cuộc trò chuyện để tiếp tục kết nối.';
  elsif reason_code_value = 'set_invite_created' and target ->> 'kind' = 'set_invite' then
    notification_kind_value := 'set_invite';
    deep_link_value := jsonb_build_object('target', 'set', 'setId', target ->> 'setId');
    notification_title := 'Bạn có lời mời vào set';
    notification_body := 'Mở Liqi để xem lời mời mới.';
  elsif reason_code_value = 'set_join_requested' and target ->> 'kind' = 'set_join_request' then
    notification_kind_value := 'join_request';
    deep_link_value := jsonb_build_object('target', 'set', 'setId', target ->> 'setId');
    notification_title := 'Có yêu cầu tham gia set';
    notification_body := 'Mở Liqi để xem yêu cầu mới.';
  else
    raise exception 'Unsupported notification.requested.v1 payload'
      using errcode = '22023', detail = 'contract_validation_failed';
  end if;

  insert into public.notifications_v1 (
    recipient_player_id,
    kind,
    source_event_id,
    occurred_at,
    deep_link,
    title,
    body,
    metadata
  ) values (
    recipient_player_id_value,
    notification_kind_value,
    event_id_value,
    occurred_at_value,
    deep_link_value,
    notification_title,
    notification_body,
    jsonb_build_object(
      'reasonCode', reason_code_value,
      'target', target,
      'correlationId', p_event ->> 'correlationId',
      'causationId', p_event ->> 'causationId'
    )
  )
  on conflict (source_event_id) do nothing
  returning id into notification_id_value;

  if notification_id_value is null then
    select * into existing
    from public.notifications_v1
    where source_event_id = event_id_value;

    if existing.recipient_player_id is distinct from recipient_player_id_value
      or existing.kind is distinct from notification_kind_value
      or existing.deep_link is distinct from deep_link_value
      or existing.occurred_at is distinct from occurred_at_value
    then
      raise exception 'Source event was reused with different notification semantics'
        using errcode = '23505', detail = 'source_event_conflict';
    end if;
    return existing.id;
  end if;

  if notification_kind_value = 'message_received' then
    insert into private.home_conversation_projection_v1 (
      player_id,
      conversation_id,
      unread_count,
      last_attention_event_id,
      last_attention_occurred_at,
      last_attention_priority,
      updated_at
    ) values (
      recipient_player_id_value,
      (target ->> 'conversationId')::uuid,
      (target ->> 'authoritativeUnreadCount')::integer,
      event_id_value,
      occurred_at_value,
      1,
      now()
    )
    on conflict (player_id, conversation_id) do update
      set unread_count = excluded.unread_count,
          last_attention_event_id = excluded.last_attention_event_id,
          last_attention_occurred_at = excluded.last_attention_occurred_at,
          last_attention_priority = excluded.last_attention_priority,
          updated_at = now()
      where private.home_conversation_projection_v1.last_attention_occurred_at is null
        or private.home_conversation_projection_v1.last_attention_occurred_at < excluded.last_attention_occurred_at
        or (
          private.home_conversation_projection_v1.last_attention_occurred_at = excluded.last_attention_occurred_at
          and (
            private.home_conversation_projection_v1.last_attention_priority < excluded.last_attention_priority
            or (
              private.home_conversation_projection_v1.last_attention_priority = excluded.last_attention_priority
              and private.home_conversation_projection_v1.unread_count < excluded.unread_count
            )
          )
        )
      returning true into attention_projection_applied;

    if not coalesce(attention_projection_applied, false) then
      foreground_policy_value := 'suppress_push';
    end if;
  end if;

  begin
    insert into private.notification_push_jobs_v1 (
      notification_id,
      recipient_player_id,
      foreground_policy,
      status
    ) values (
      notification_id_value,
      recipient_player_id_value,
      foreground_policy_value,
      case
        when foreground_policy_value = 'suppress_push'
          then 'suppressed'::private.notification_push_status_v1
        else 'pending'::private.notification_push_status_v1
      end
    )
    on conflict (notification_id) do nothing;
  exception
    when others then
      insert into private.notification_delivery_errors_v1 (
        notification_id,
        stage,
        error_message
      ) values (
        notification_id_value,
        'enqueue',
        sqlerrm
      );
  end;

  return notification_id_value;
end;
$$;

create or replace function private.consume_conversation_read_advanced_v1(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := (p_event ->> 'eventId')::uuid;
  read_state jsonb := p_event #> '{data,readState}';
  read_updated_at timestamptz := (read_state ->> 'updatedAt')::timestamptz;
begin
  insert into private.home_conversation_projection_v1 (
    player_id,
    conversation_id,
    unread_count,
    last_attention_event_id,
    last_attention_occurred_at,
    last_attention_priority,
    updated_at
  ) values (
    (read_state ->> 'playerId')::uuid,
    (read_state ->> 'conversationId')::uuid,
    (read_state ->> 'unreadCount')::integer,
    event_id,
    read_updated_at,
    2,
    now()
  )
  on conflict (player_id, conversation_id) do update
    set unread_count = excluded.unread_count,
        last_attention_event_id = excluded.last_attention_event_id,
        last_attention_occurred_at = excluded.last_attention_occurred_at,
        last_attention_priority = excluded.last_attention_priority,
        updated_at = now()
    where private.home_conversation_projection_v1.last_attention_occurred_at is null
      or private.home_conversation_projection_v1.last_attention_occurred_at < excluded.last_attention_occurred_at
      or (
        private.home_conversation_projection_v1.last_attention_occurred_at = excluded.last_attention_occurred_at
        and private.home_conversation_projection_v1.last_attention_priority < excluded.last_attention_priority
      );
end;
$$;
