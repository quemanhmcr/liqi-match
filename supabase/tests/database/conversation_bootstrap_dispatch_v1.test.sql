create extension if not exists pgtap with schema extensions;

begin;
set local search_path = extensions, public, pg_catalog;

select plan(7);

select has_function(
  'public',
  'dispatch_conversation_bootstraps_v1',
  array['integer'],
  'production bootstrap dispatcher function exists'
);

select is(
  (
    select jsonb_build_object(
      'bootstrapEnabled', bootstrap_enabled,
      'readsEnabled', reads_enabled,
      'writesEnabled', writes_enabled,
      'realtimeEnabled', realtime_enabled,
      'imageMessagesEnabled', image_messages_enabled
    )
    from private.conversation_authority_config_v1
    where singleton
  ),
  '{"bootstrapEnabled":true,"readsEnabled":true,"writesEnabled":true,"realtimeEnabled":true,"imageMessagesEnabled":true}'::jsonb,
  'Conversation production cutover enables every v1 capability'
);

select is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'conversation-bootstrap-v1'
      and active
  ),
  1,
  'exactly one active bootstrap dispatcher job exists'
);

select is(
  (
    select schedule
    from cron.job
    where jobname = 'conversation-bootstrap-v1'
  ),
  '5 seconds',
  'bootstrap dispatcher runs every five seconds'
);

select alike(
  (
    select command
    from cron.job
    where jobname = 'conversation-bootstrap-v1'
  ),
  '%dispatch_conversation_bootstraps_v1(100)%',
  'cron invokes the replay-safe database dispatcher directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.dispatch_conversation_bootstraps_v1(integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.dispatch_conversation_bootstraps_v1(integer)',
    'EXECUTE'
  ),
  'dispatcher is service-only'
);

select is(
  (public.dispatch_conversation_bootstraps_v1(100)->>'disabled')::boolean,
  false,
  'manual dispatcher uses the enabled production path'
);

select * from finish(true);
rollback;
