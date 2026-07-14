-- Conversation bootstrap dispatcher and production cutover v1
--
-- Supabase Cron must be enabled before this migration. The named pg_cron job
-- invokes a database function directly every five seconds; match creation stays
-- decoupled from conversation bootstrap, and the replay-safe outbox consumer
-- remains the sole writer of the canonical conversation mapping.

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pg_cron'
  ) then
    raise exception 'Supabase Cron Postgres Module must be enabled before Conversation cutover'
      using errcode = '55000', detail = 'pg_cron_required';
  end if;
end;
$$;

create or replace function public.dispatch_conversation_bootstraps_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  results jsonb;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
begin
  if not private.conversation_bootstrap_enabled_v1() then
    return jsonb_build_object(
      'disabled', true,
      'processedCount', 0,
      'results', '[]'::jsonb
    );
  end if;

  results := public.process_pending_conversation_bootstraps_v1(safe_limit);
  return jsonb_build_object(
    'disabled', false,
    'processedCount', jsonb_array_length(results),
    'results', results
  );
end;
$$;

revoke execute on function public.dispatch_conversation_bootstraps_v1(integer)
  from public, anon, authenticated;
grant execute on function public.dispatch_conversation_bootstraps_v1(integer)
  to service_role;

select cron.schedule(
  'conversation-bootstrap-v1',
  '5 seconds',
  $job$select public.dispatch_conversation_bootstraps_v1(100);$job$
);

update private.conversation_authority_config_v1
set bootstrap_enabled = true,
    reads_enabled = true,
    writes_enabled = true,
    realtime_enabled = true,
    image_messages_enabled = true,
    updated_at = now()
where singleton;

insert into private.audit_logs (action, target_type, metadata)
values (
  'conversation_reliability_v1_cutover',
  'program',
  jsonb_build_object(
    'bootstrapDispatcher', 'conversation-bootstrap-v1',
    'schedule', '5 seconds',
    'bootstrapEnabled', true,
    'readsEnabled', true,
    'writesEnabled', true,
    'realtimeEnabled', true,
    'imageMessagesEnabled', true
  )
);

comment on function public.dispatch_conversation_bootstraps_v1(integer) is
  'Service-role/manual and pg_cron entrypoint for replay-safe conversation.bootstrap_requested.v1 processing.';
