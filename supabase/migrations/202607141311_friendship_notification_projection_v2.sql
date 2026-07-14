-- Project Social V2 friendship events into the existing Return Loop notification seam.
-- Social owns the source event and profile target semantics; Return Loop remains
-- authoritative for inbox persistence, push delivery, read state and deep-link resolution.

create or replace function private.project_friendship_notification_v2(
  p_event jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_event_id uuid := (p_event ->> 'eventId')::uuid;
  source_event_type text := p_event ->> 'eventType';
  source_event_version integer := (p_event ->> 'eventVersion')::integer;
  source_payload jsonb := p_event -> 'payload';
  recipient_player_id_value uuid;
  profile_target_player_id_value uuid;
  notification_reason_code text;
  projected_event_id uuid;
begin
  if source_event_type not in (
    'friendship.requested.v2',
    'friendship.accepted.v2'
  ) then
    return null;
  end if;

  if source_event_id is null
    or source_event_version is distinct from 2
    or source_payload is null then
    perform private.raise_core_error_v1(
      'contract_validation_failed',
      'Invalid Core V2 friendship event envelope.'
    );
  end if;

  if source_event_type = 'friendship.requested.v2' then
    recipient_player_id_value :=
      (source_payload ->> 'recipientPlayerId')::uuid;
    profile_target_player_id_value :=
      (source_payload ->> 'requesterPlayerId')::uuid;
    notification_reason_code := 'friendship_requested';
  else
    recipient_player_id_value :=
      (source_payload ->> 'requesterPlayerId')::uuid;
    profile_target_player_id_value :=
      (source_payload ->> 'recipientPlayerId')::uuid;
    notification_reason_code := 'friendship_accepted';
  end if;

  if recipient_player_id_value is null
    or profile_target_player_id_value is null
    or recipient_player_id_value = profile_target_player_id_value then
    perform private.raise_core_error_v1(
      'contract_validation_failed',
      'Friendship notification identities are invalid.'
    );
  end if;

  projected_event_id := private.enqueue_contract_event_v1(
    'notification.requested.v1',
    'player',
    recipient_player_id_value,
    (p_event ->> 'correlationId')::uuid,
    source_event_id,
    jsonb_build_object(
      'recipientPlayerId', recipient_player_id_value,
      'reasonCode', notification_reason_code,
      'target', jsonb_build_object(
        'kind', 'profile',
        'playerId', profile_target_player_id_value
      )
    ),
    format(
      'friendship-notification:%s:%s',
      source_event_id,
      notification_reason_code
    )
  );

  return projected_event_id;
exception
  when invalid_text_representation then
    perform private.raise_core_error_v1(
      'contract_validation_failed',
      'Friendship notification event contains an invalid UUID.'
    );
    return null;
end;
$$;

create or replace function private.project_friendship_notification_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contract_version = 2
    and new.event_type in (
      'friendship.requested.v2',
      'friendship.accepted.v2'
    ) then
    perform private.project_friendship_notification_v2(new.payload);
  end if;
  return new;
end;
$$;

drop trigger if exists outbox_project_friendship_notification_v2
on private.outbox_events;
create trigger outbox_project_friendship_notification_v2
after insert on private.outbox_events
for each row execute function private.project_friendship_notification_trigger_v2();

-- Backfill events committed before this projection was deployed. The V1 outbox
-- deduplication key makes this replay safe.
do $$
declare
  source_event record;
begin
  for source_event in
    select event.payload
    from private.outbox_events event
    where event.contract_version = 2
      and event.event_type in (
        'friendship.requested.v2',
        'friendship.accepted.v2'
      )
    order by event.created_at, event.id
  loop
    perform private.project_friendship_notification_v2(source_event.payload);
  end loop;
end;
$$;


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
  social_target_player_id_value uuid;
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

  if reason_code_value in ('friendship_requested', 'friendship_accepted') then
    if target ->> 'kind' <> 'profile' then
      raise exception 'Unsupported friendship notification target'
        using errcode = '22023', detail = 'contract_validation_failed';
    end if;

    begin
      social_target_player_id_value := (target ->> 'playerId')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid friendship notification PlayerId'
          using errcode = '22023', detail = 'contract_validation_failed';
    end;

    if private.are_players_blocked_v2(
      recipient_player_id_value,
      social_target_player_id_value
    ) then
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
        'relationship_blocked',
        occurred_at_value
      )
      on conflict (event_id) do nothing;
      return null;
    end if;
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
  elsif reason_code_value = 'friendship_requested' and target ->> 'kind' = 'profile' then
    notification_kind_value := 'friendship_requested';
    deep_link_value := jsonb_build_object(
      'target', 'profile',
      'playerId', target ->> 'playerId'
    );
    notification_title := 'Bạn có lời mời kết bạn mới';
    notification_body := 'Mở Liqi để xem hồ sơ và phản hồi lời mời.';
  elsif reason_code_value = 'friendship_accepted' and target ->> 'kind' = 'profile' then
    notification_kind_value := 'friendship_accepted';
    deep_link_value := jsonb_build_object(
      'target', 'profile',
      'playerId', target ->> 'playerId'
    );
    notification_title := 'Lời mời kết bạn đã được chấp nhận';
    notification_body := 'Hai bạn đã trở thành bạn bè trên Liqi.';
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

create or replace function public.resolve_notification_deep_link_v1(
  p_notification_id uuid,
  p_source_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.return_loop_player_snapshot_v1;
  notification public.notifications_v1%rowtype;
  canonical_deep_link jsonb;
  target_name text;
  target_exists boolean := false;
  resolution_status public.notification_deep_link_resolution_status_v1;
  transition_time timestamptz := clock_timestamp();
  notification_read_at timestamptz;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  actor_snapshot := private.require_return_loop_player_snapshot_by_account_v1(
    actor_account_id,
    false
  );

  if not private.return_loop_feature_enabled_v1(
    'deep_link',
    actor_account_id
  ) then
    resolution_status := 'disabled';
  else
    select persisted.* into notification
    from public.notifications_v1 as persisted
    where persisted.id = p_notification_id
      and persisted.source_event_id = p_source_event_id
      and persisted.recipient_player_id = actor_snapshot.player_id
    for update;

    if notification.id is null then
      resolution_status := 'not_found';
    else
      canonical_deep_link := notification.deep_link;
      target_name := canonical_deep_link ->> 'target';

      update public.notifications_v1
      set seen_at = coalesce(seen_at, transition_time),
          read_at = coalesce(
            read_at,
            greatest(transition_time, coalesce(seen_at, transition_time))
          )
      where id = notification.id
      returning read_at into notification_read_at;

      if actor_snapshot.state in ('registered', 'onboarding') then
        resolution_status := 'defer_lifecycle';
      elsif actor_snapshot.state in ('suspended', 'deleting', 'deleted') then
        resolution_status := 'player_unavailable';
      elsif actor_snapshot.state <> 'active' then
        resolution_status := 'provider_unavailable';
      elsif target_name = 'match' then
        begin
          select exists (
            select 1
            from public.matches as match
            where match.id = (canonical_deep_link ->> 'matchId')::uuid
              and actor_snapshot.player_id in (
                match.player_low_id,
                match.player_high_id
              )
              and match.unmatched_at is null
          ) into target_exists;
          resolution_status := case
            when target_exists then 'available'
            else 'expired'
          end;
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
        end;
      elsif target_name = 'conversation' then
        begin
          select exists (
            select 1
            from private.home_conversation_projection_v1 as projection
            where projection.player_id = actor_snapshot.player_id
              and projection.conversation_id =
                (canonical_deep_link ->> 'conversationId')::uuid
              and projection.match_id is not null
          ) into target_exists;
          resolution_status := case
            when target_exists then 'available'
            else 'defer_target'
          end;
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
        end;
      elsif target_name = 'profile' then
        begin
          perform public.resolve_visible_profile_identity_v2(
            (canonical_deep_link ->> 'playerId')::uuid
          );
          resolution_status := 'available';
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
          when sqlstate 'P0001' then
            resolution_status := 'expired';
          when undefined_function then
            resolution_status := 'provider_unavailable';
          when others then
            resolution_status := 'provider_unavailable';
        end;
      elsif target_name = 'set' then
        begin
          if to_regclass('public.match_sets_v1') is not null then
            execute
              'select exists (select 1 from public.match_sets_v1 where id = $1 and state <> ''closed'')'
              into target_exists
              using (canonical_deep_link ->> 'setId')::uuid;
            resolution_status := case
              when target_exists then 'available'
              else 'expired'
            end;
          elsif to_regclass('public.sets') is not null then
            execute
              'select exists (select 1 from public.sets where id = $1)'
              into target_exists
              using (canonical_deep_link ->> 'setId')::uuid;
            resolution_status := case
              when target_exists then 'available'
              else 'expired'
            end;
          elsif to_regclass('public.teams') is not null then
            execute
              'select exists (select 1 from public.teams where id = $1)'
              into target_exists
              using (canonical_deep_link ->> 'setId')::uuid;
            resolution_status := case
              when target_exists then 'available'
              else 'expired'
            end;
          else
            resolution_status := 'provider_unavailable';
          end if;
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
          when undefined_table then
            resolution_status := 'provider_unavailable';
        end;
      else
        resolution_status := 'expired';
      end if;
    end if;
  end if;

  insert into private.notification_deep_link_attempts_v1 (
    notification_id,
    source_event_id,
    account_id,
    player_id,
    target,
    status,
    resolved_at
  ) values (
    p_notification_id,
    p_source_event_id,
    actor_account_id,
    actor_snapshot.player_id,
    target_name,
    resolution_status,
    transition_time
  );

  return jsonb_build_object(
    'notificationId', p_notification_id,
    'status', resolution_status,
    'deepLink', canonical_deep_link,
    'playerLifecycle', actor_snapshot.state,
    'readAt', notification_read_at,
    'resolvedAt', transition_time
  );
end;
$$;

revoke execute on function private.project_friendship_notification_v2(jsonb)
from public, anon, authenticated;
revoke execute on function private.project_friendship_notification_trigger_v2()
from public, anon, authenticated;
revoke execute on function private.persist_notification_requested_v1(jsonb)
from public, anon, authenticated;
revoke execute on function public.resolve_notification_deep_link_v1(uuid, uuid)
from public, anon;
grant execute on function public.resolve_notification_deep_link_v1(uuid, uuid)
to authenticated;
