-- Final Senior 4 Return Loop cloud repair.
-- Preserve Social-aware profile visibility and block revocation, resolve Set
-- targets only through canonical match_sets_v1, and keep suspension replay
-- receipts unambiguous in the outer event consumer.

create or replace function public.resolve_notification_deep_link_without_activity_v1(
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
          select exists (
            select 1
            from public.match_sets_v1 set_projection
            where set_projection.id = (canonical_deep_link ->> 'setId')::uuid
              and set_projection.state <> 'closed'
          ) into target_exists;
          resolution_status := case
            when target_exists then 'available'
            else 'expired'
          end;
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
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

revoke execute on function public.resolve_notification_deep_link_without_activity_v1(uuid, uuid)
  from public, anon, authenticated;

comment on function public.resolve_notification_deep_link_without_activity_v1(uuid, uuid) is
  'Social-aware legacy notification resolver: profile targets use resolve_visible_profile_identity_v2 and Set targets use canonical match_sets_v1 only.';

create or replace function private.consume_return_loop_event_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid := (p_event ->> 'eventId')::uuid;
  event_type_value text := p_event ->> 'eventType';
  config private.return_loop_config_v1%rowtype;
  result jsonb;
begin
  if event_type_value = 'activity.notification_requested.v2' then
    select * into config from private.return_loop_config_v1 where singleton;
    if not config.event_consumer_enabled then
      return jsonb_build_object('eventId', event_id_value, 'processed', false, 'reason', 'event_consumer_disabled');
    end if;
    return private.consume_activity_notification_requested_v2(p_event);
  end if;

  if event_type_value not in ('player.suspended.v1', 'player.resumed.v1') then
    result := private.consume_return_loop_event_without_suspension_v1(p_event);
    if event_type_value = 'player.deleted.v1'
      and coalesce((result ->> 'processed')::boolean, false) then
      delete from private.notification_presence_v1
      where player_id = (p_event -> 'data' ->> 'playerId')::uuid;
      delete from private.home_lifecycle_projection_watermarks_v1
      where player_id = (p_event -> 'data' ->> 'playerId')::uuid;
    end if;
    return result;
  end if;

  if event_id_value is null then
    raise exception 'Invalid CoreEventV1 envelope'
      using errcode = '22023', detail = 'contract_validation_failed';
  end if;
  select * into config from private.return_loop_config_v1 where singleton;
  if not config.event_consumer_enabled then
    return jsonb_build_object('eventId', event_id_value, 'processed', false, 'reason', 'event_consumer_disabled');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(event_id_value::text, 0));
  if exists (
    select 1
    from private.return_loop_processed_events_v1 processed
    where processed.event_id = event_id_value
  ) then
    return jsonb_build_object('eventId', event_id_value, 'processed', true, 'repeated', true);
  end if;
  result := private.consume_return_loop_suspension_event_v1(p_event);
  insert into private.return_loop_processed_events_v1(event_id, event_type, occurred_at)
  values (event_id_value, event_type_value, (p_event ->> 'occurredAt')::timestamptz);
  return result;
end;
$$;

revoke execute on function private.consume_return_loop_event_v1(jsonb)
  from public, anon, authenticated;
grant execute on function private.consume_return_loop_event_v1(jsonb)
  to service_role;

comment on function private.consume_return_loop_event_v1(jsonb) is
  'Return Loop outer consumer with unambiguous EventId/EventType values, activity dispatch, lifecycle replay receipts and deletion cleanup.';
