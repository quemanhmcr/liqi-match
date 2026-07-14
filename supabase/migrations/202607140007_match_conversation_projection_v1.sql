-- Match → Conversation/Home projection consumer for conversation.created.v1.
-- Mission 3 owns idempotent conversation bootstrap. Mission 2 owns the
-- authoritative match-related Home facts. This function is the shared seam.

create or replace function public.apply_conversation_created_to_match_v1(
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  correlation_id_value uuid;
  aggregate_conversation_id uuid;
  conversation_id_value uuid;
  match_id_value uuid;
  participant_low_id uuid;
  participant_high_id uuid;
  match_row public.matches%rowtype;
  conversation_row public.conversations%rowtype;
  repeated_value boolean;
begin
  if jsonb_typeof(p_event) is distinct from 'object'
    or p_event ->> 'eventType' is distinct from 'conversation.created.v1'
    or p_event ->> 'aggregateType' is distinct from 'conversation'
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'A canonical conversation.created.v1 event is required.'
    );
  end if;

  begin
    event_id_value := (p_event ->> 'eventId')::uuid;
    correlation_id_value := (p_event ->> 'correlationId')::uuid;
    aggregate_conversation_id := (p_event ->> 'aggregateId')::uuid;
    conversation_id_value := (
      p_event #>> '{data,conversation,conversationId}'
    )::uuid;
    match_id_value := (p_event #>> '{data,conversation,matchId}')::uuid;
    participant_low_id := least(
      (p_event #>> '{data,conversation,participantIds,0}')::uuid,
      (p_event #>> '{data,conversation,participantIds,1}')::uuid
    );
    participant_high_id := greatest(
      (p_event #>> '{data,conversation,participantIds,0}')::uuid,
      (p_event #>> '{data,conversation,participantIds,1}')::uuid
    );
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'conversation.created.v1 identifiers are invalid.'
    );
  end;

  if event_id_value is null
    or correlation_id_value is null
    or aggregate_conversation_id is distinct from conversation_id_value
    or participant_low_id is null
    or participant_high_id is null
    or participant_low_id = participant_high_id
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'conversation.created.v1 envelope and payload are inconsistent.'
    );
  end if;

  select * into match_row
  from public.matches matches
  where matches.id = match_id_value
  for update;

  if match_row.id is null
    or match_row.player_low_id is null
    or match_row.player_high_id is null
  then
    perform private.raise_core_error_v1(
      'not_found',
      'The canonical match was not found.'
    );
  end if;

  if match_row.player_low_id <> participant_low_id
    or match_row.player_high_id <> participant_high_id
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation participants do not match the canonical Match participants.'
    );
  end if;

  if match_row.correlation_id_v1 is distinct from correlation_id_value then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation correlation does not match the canonical Match.'
    );
  end if;

  if match_row.home_status_v1 = 'closed' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'A closed Match cannot transition back to conversation_ready.'
    );
  end if;

  select * into conversation_row
  from public.conversations conversations
  where conversations.id = conversation_id_value
    and conversations.match_id = match_id_value;

  if conversation_row.id is null then
    perform private.raise_core_error_v1(
      'not_found',
      'The bootstrapped conversation does not exist for this Match.'
    );
  end if;

  repeated_value := match_row.home_status_v1 = 'conversation_ready';

  if not repeated_value then
    update public.matches
    set home_status_v1 = 'conversation_ready'
    where id = match_id_value
      and home_status_v1 = 'conversation_pending';

    if not found then
      perform private.raise_core_error_v1(
        'validation_failed',
        'The Match is not awaiting conversation bootstrap.'
      );
    end if;
  end if;

  return jsonb_build_object(
    'conversationId', conversation_id_value,
    'correlationId', correlation_id_value,
    'homeStatus', 'conversation_ready',
    'matchId', match_id_value,
    'repeated', repeated_value
  );
end;
$$;

comment on function public.apply_conversation_created_to_match_v1(jsonb) is
  'Service-only idempotent consumer for canonical conversation.created.v1. Verifies match participants and persisted conversation before publishing conversation_ready Home facts.';

revoke execute on function public.apply_conversation_created_to_match_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_conversation_created_to_match_v1(jsonb)
  to service_role;
