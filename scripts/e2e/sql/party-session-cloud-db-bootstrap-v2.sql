create extension if not exists pgtap with schema extensions;

do $$
declare
  system_activity_definition text;
  start_definition text;
  completion_definition text;
  event_definition text;
begin
  if to_regclass('public.play_sessions_v2') is null
    or to_regprocedure('public.create_play_session_v2(text,integer,uuid[],timestamp with time zone,text,text,uuid,bigint,jsonb)') is null
    or to_regprocedure('public.consume_session_conversation_event_v2(jsonb)') is null
    or to_regprocedure('private.consume_session_completed_v2(jsonb)') is null
  then
    raise exception 'Party/Session cloud authority is not ready for runtime tests';
  end if;

  system_activity_definition := pg_get_functiondef(
    'public.project_conversation_system_activity_v2(jsonb)'::regprocedure
  );
  start_definition := pg_get_functiondef(
    'public.start_session_v2(uuid,text,uuid,bigint,jsonb)'::regprocedure
  );
  completion_definition := pg_get_functiondef(
    'public.propose_session_completion_v2(uuid,text,text,text,uuid,bigint,jsonb)'::regprocedure
  );
  event_definition := pg_get_functiondef(
    'private.enqueue_contract_event_v2(text,text,uuid,bigint,uuid,uuid,uuid,jsonb,text)'::regprocedure
  );

  if position('source_event_id_value uuid' in system_activity_definition) = 0
    or position(
      'messages.source_event_id = source_event_id_value'
      in system_activity_definition
    ) = 0
    or position('started_at = clock_timestamp()' in start_definition) = 0
    or position('completed_at = greatest(' in completion_definition) = 0
    or position('clock_timestamp()' in completion_definition) = 0
    or position(
      'started_at + interval ''1 microsecond'''
      in completion_definition
    ) = 0
    or position(
      'occurred_at_value timestamptz := clock_timestamp()'
      in event_definition
    ) = 0
  then
    raise exception 'Party/Session cloud function bodies do not match migration evidence';
  end if;
end;
$$;
