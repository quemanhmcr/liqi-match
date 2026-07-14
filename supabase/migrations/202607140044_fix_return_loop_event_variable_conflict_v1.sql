-- Resolve PL/pgSQL variable/column ambiguity in the pre-suspension Return Loop consumer.
-- Migration 041 renamed this function, so the correction is forward-only.

create or replace function private.consume_return_loop_event_without_suspension_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid := (p_event ->> 'eventId')::uuid;
  event_type_value text := p_event ->> 'eventType';
  occurred_at_value timestamptz := (p_event ->> 'occurredAt')::timestamptz;
  config private.return_loop_config_v1%rowtype;
  notification_id uuid;
  lifecycle_player_id uuid;
begin
  if event_id_value is null or event_type_value is null or occurred_at_value is null then
    raise exception 'Invalid CoreEventV1 envelope'
      using errcode = '22023', detail = 'contract_validation_failed';
  end if;

  select * into config
  from private.return_loop_config_v1
  where singleton;

  if not config.event_consumer_enabled then
    return jsonb_build_object(
      'eventId', event_id_value,
      'processed', false,
      'reason', 'event_consumer_disabled'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(event_id_value::text, 0));

  if exists (
    select 1
    from private.return_loop_processed_events_v1 as processed
    where processed.event_id = event_id_value
  ) then
    return jsonb_build_object(
      'eventId', event_id_value,
      'processed', true,
      'repeated', true
    );
  end if;

  if event_type_value = 'notification.requested.v1' then
    notification_id := private.persist_notification_requested_v1(p_event);
  elsif event_type_value = 'conversation.created.v1' then
    perform private.consume_conversation_ready_v1(p_event);
  elsif event_type_value = 'message.sent.v1' then
    perform private.consume_message_sent_v1(p_event);
  elsif event_type_value = 'conversation.read_advanced.v1' then
    perform private.consume_conversation_read_advanced_v1(p_event);
  elsif event_type_value = 'player.profile_updated.v1' then
    perform private.consume_player_profile_updated_v1(p_event);
  elsif event_type_value in (
    'match.created.v1',
    'player.activated.v1'
  ) then
    null;
  elsif event_type_value in (
    'player.suspended.v1',
    'player.deletion_requested.v1',
    'player.deleted.v1'
  ) then
    lifecycle_player_id := (p_event -> 'data' ->> 'playerId')::uuid;

    update private.push_devices_v1
    set enabled = false,
        disabled_at = coalesce(disabled_at, now())
    where player_id = lifecycle_player_id
      and enabled;

    if event_type_value = 'player.deleted.v1' then
      delete from public.notifications_v1
      where recipient_player_id = lifecycle_player_id;

      delete from private.home_conversation_projection_v1
      where player_id = lifecycle_player_id
        or participant_player_id = lifecycle_player_id;

      delete from private.home_profile_projection_watermarks_v1
      where player_id = lifecycle_player_id;
    end if;
  else
    return jsonb_build_object(
      'eventId', event_id_value,
      'processed', false,
      'reason', 'unsupported_event_type'
    );
  end if;

  insert into private.return_loop_processed_events_v1 (
    event_id,
    event_type,
    occurred_at
  ) values (
    event_id_value,
    event_type_value,
    occurred_at_value
  );

  return jsonb_build_object(
    'eventId', event_id_value,
    'notificationId', notification_id,
    'processed', true,
    'repeated', false
  );
end;
$$;

revoke all on function private.consume_return_loop_event_without_suspension_v1(jsonb)
  from public, anon, authenticated;
