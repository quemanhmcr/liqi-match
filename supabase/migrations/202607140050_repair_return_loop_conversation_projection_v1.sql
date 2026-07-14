-- PostgreSQL resolves PL/pgSQL identifiers and SQL column names in the
-- same statement scope. These Return Loop consumers used conversation_id as a
-- local variable and as an ON CONFLICT column, making the canonical event path
-- fail only when the relevant conversation event was consumed. Keep the event
-- contract unchanged and rename only local values.

create or replace function private.consume_conversation_ready_v1(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_data jsonb := p_event #> '{data,conversation}';
  projection_receipt jsonb;
  match_id uuid := (conversation_data ->> 'matchId')::uuid;
  conversation_id_value uuid := (conversation_data ->> 'conversationId')::uuid;
  low_player_id uuid := least(
    (conversation_data #>> '{participantIds,0}')::uuid,
    (conversation_data #>> '{participantIds,1}')::uuid
  );
  high_player_id uuid := greatest(
    (conversation_data #>> '{participantIds,0}')::uuid,
    (conversation_data #>> '{participantIds,1}')::uuid
  );
begin
  projection_receipt := public.apply_conversation_created_to_match_v1(p_event);
  if projection_receipt ->> 'matchId' is distinct from match_id::text
    or projection_receipt ->> 'conversationId' is distinct from conversation_id_value::text
    or projection_receipt ->> 'homeStatus' is distinct from 'conversation_ready'
  then
    raise exception 'Match conversation projection returned an invalid receipt'
      using errcode = '22023', detail = 'match_projection_contract_violation';
  end if;

  insert into private.home_conversation_projection_v1 (
    player_id,
    conversation_id,
    match_id,
    participant_player_id,
    updated_at
  ) values
    (low_player_id, conversation_id_value, match_id, high_player_id, now()),
    (high_player_id, conversation_id_value, match_id, low_player_id, now())
  on conflict (player_id, conversation_id) do update
    set match_id = excluded.match_id,
        participant_player_id = excluded.participant_player_id,
        updated_at = now();
end;
$$;

create or replace function private.consume_message_sent_v1(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_data jsonb := p_event -> 'data';
  message_data jsonb := event_data -> 'message';
  content_data jsonb := message_data -> 'content';
  conversation_id_value uuid := (message_data ->> 'conversationId')::uuid;
  sender_player_id uuid := (message_data ->> 'senderPlayerId')::uuid;
  message_created_at timestamptz := (message_data ->> 'createdAt')::timestamptz;
  preview text := left(
    case content_data ->> 'kind'
      when 'text' then content_data ->> 'text'
      when 'media' then coalesce(content_data ->> 'caption', 'Đã gửi một tệp đính kèm')
      when 'system' then content_data ->> 'eventType'
      else null
    end,
    240
  );
  recipient_id_text text;
  first_recipient_id uuid;
begin
  for recipient_id_text in
    select jsonb_array_elements_text(coalesce(event_data -> 'recipientPlayerIds', '[]'::jsonb))
  loop
    if first_recipient_id is null then first_recipient_id := recipient_id_text::uuid; end if;

    insert into private.home_conversation_projection_v1 (
      player_id,
      conversation_id,
      participant_player_id,
      last_message_preview,
      last_message_at,
      updated_at
    ) values (
      recipient_id_text::uuid,
      conversation_id_value,
      sender_player_id,
      preview,
      message_created_at,
      now()
    )
    on conflict (player_id, conversation_id) do update
      set participant_player_id = coalesce(
            private.home_conversation_projection_v1.participant_player_id,
            excluded.participant_player_id
          ),
          last_message_preview = excluded.last_message_preview,
          last_message_at = excluded.last_message_at,
          updated_at = now()
      where private.home_conversation_projection_v1.last_message_at is null
        or private.home_conversation_projection_v1.last_message_at <= excluded.last_message_at;
  end loop;

  if first_recipient_id is not null then
    insert into private.home_conversation_projection_v1 (
      player_id,
      conversation_id,
      participant_player_id,
      last_message_preview,
      last_message_at,
      updated_at
    ) values (
      sender_player_id,
      conversation_id_value,
      first_recipient_id,
      preview,
      message_created_at,
      now()
    )
    on conflict (player_id, conversation_id) do update
      set participant_player_id = coalesce(
            private.home_conversation_projection_v1.participant_player_id,
            excluded.participant_player_id
          ),
          last_message_preview = excluded.last_message_preview,
          last_message_at = excluded.last_message_at,
          updated_at = now()
      where private.home_conversation_projection_v1.last_message_at is null
        or private.home_conversation_projection_v1.last_message_at <= excluded.last_message_at;
  end if;
end;
$$;
