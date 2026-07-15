-- Migration history 2101 was present on the shared E2E project while the
-- deployed function body still used ambiguous PL/pgSQL identifiers. Reapply
-- the corrected definition under a new version so history and runtime converge.

create or replace function public.project_conversation_system_activity_v2(p_activity jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.conversations_v2%rowtype;
  source_row public.conversation_sources_v2%rowtype;
  source jsonb := p_activity -> 'source';
  source_event_id_value uuid;
  source_event_version_value integer;
  source_event_type_value text;
  correlation_id_value uuid;
  causation_id_value uuid;
  existing public.messages_v2%rowtype;
  message public.messages_v2%rowtype;
  next_sequence bigint;
begin
  perform private.require_conversation_service_v2();
  if jsonb_typeof(source) is distinct from 'object'
    or nullif(p_activity ->> 'conversationId', '') is null
    or nullif(p_activity ->> 'sourceEventId', '') is null
    or nullif(p_activity ->> 'sourceEventType', '') is null
  then
    perform private.raise_core_error_v1('validation_failed', 'System activity is incomplete.');
  end if;
  begin
    source_event_id_value := (p_activity ->> 'sourceEventId')::uuid;
    source_event_version_value := (p_activity ->> 'sourceEventVersion')::integer;
    correlation_id_value := (p_activity ->> 'correlationId')::uuid;
    causation_id_value := nullif(p_activity ->> 'causationId', '')::uuid;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'System activity identifiers are invalid.');
  end;
  source_event_type_value := p_activity ->> 'sourceEventType';
  if source_event_version_value <= 0 then
    perform private.raise_core_error_v1('unsupported_event_version', 'System event version is unsupported.');
  end if;

  select * into conversation
  from public.conversations_v2
  where id = (p_activity ->> 'conversationId')::uuid
  for update;
  if conversation.id is null then
    perform private.raise_core_error_v1('conversation_not_found', 'Conversation was not found.');
  end if;
  select * into source_row
  from public.conversation_sources_v2 sources
  where sources.conversation_id = conversation.id
    and sources.source_type = (source ->> 'sourceType')::public.conversation_source_type_v2
    and sources.source_id = (source ->> 'sourceId')::uuid;
  if source_row.conversation_id is null then
    perform private.raise_core_error_v1('conversation_source_conflict', 'System activity source is not bound.');
  end if;

  select * into existing
  from public.messages_v2 messages
  where messages.conversation_id = conversation.id
    and messages.source_event_id = source_event_id_value;
  if existing.id is not null then return private.message_json_v2(existing); end if;

  next_sequence := conversation.last_sequence + 1;
  insert into public.messages_v2 (
    conversation_id,
    sender_player_id,
    client_message_id,
    sequence,
    kind,
    content,
    content_fingerprint,
    source_event_id,
    source_event_type,
    source_event_version,
    correlation_id
  ) values (
    conversation.id,
    null,
    'system-event:' || source_event_id_value,
    next_sequence,
    'system',
    jsonb_build_object(
      'kind', 'system',
      'sourceEventId', source_event_id_value,
      'sourceEventType', source_event_type_value,
      'sourceEventVersion', source_event_version_value,
      'payload', coalesce(p_activity -> 'payload', '{}'::jsonb)
    ),
    private.command_request_hash_v1(coalesce(p_activity -> 'payload', '{}'::jsonb)),
    source_event_id_value,
    source_event_type_value,
    source_event_version_value,
    correlation_id_value
  ) returning * into message;
  update public.conversations_v2
  set last_sequence = next_sequence,
      version = version + 1,
      updated_at = now()
  where id = conversation.id;
  perform private.enqueue_contract_event_v2(
    'message.sent.v2',
    'conversation',
    conversation.id,
    conversation.version + 1,
    null,
    correlation_id_value,
    causation_id_value,
    jsonb_build_object(
      'message', private.message_json_v2(message),
      'recipientPlayerIds', coalesce(
        (select jsonb_agg(members.player_id order by members.player_id)
         from public.conversation_members_v2 members
         where members.conversation_id = conversation.id
           and members.state = 'active'
           and members.can_view_conversation),
        '[]'::jsonb
      )
    ),
    'message-system-sent:' || source_event_id_value
  );
  return private.message_json_v2(message);
end;
$$;

revoke execute on function public.project_conversation_system_activity_v2(jsonb)
  from public, anon, authenticated;
grant execute on function public.project_conversation_system_activity_v2(jsonb)
  to service_role;
