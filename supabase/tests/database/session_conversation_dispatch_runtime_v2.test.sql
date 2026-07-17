create extension if not exists pgtap with schema extensions;

begin;
select plan(31);

select has_table(
  'private',
  'session_conversation_event_failures_v2',
  'Session Conversation retry table exists'
);
select has_function(
  'private',
  'assert_session_conversation_worker_v2',
  array[]::text[],
  'Session Conversation worker assertion exists'
);
select has_function(
  'public',
  'process_pending_session_conversation_events_v2',
  array['integer'],
  'Session Conversation processor exists'
);
select has_function(
  'public',
  'dispatch_session_conversation_events_v2',
  array['integer'],
  'Session Conversation dispatcher exists'
);
select has_function(
  'public',
  'get_session_conversation_dispatch_health_v2',
  array[]::text[],
  'Session Conversation health projection exists'
);
select is(
  (
    select count(*)::integer
    from cron.job jobs
    where jobs.jobname = 'session-conversation-events-v2'
      and jobs.active
      and jobs.command =
        'select public.dispatch_session_conversation_events_v2(50);'
  ),
  1,
  'exactly one active Session Conversation cron job is scheduled'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.dispatch_session_conversation_events_v2(integer)',
    'execute'
  ),
  'anon cannot execute the Session Conversation dispatcher'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.dispatch_session_conversation_events_v2(integer)',
    'execute'
  ),
  'authenticated cannot execute the Session Conversation dispatcher'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.dispatch_session_conversation_events_v2(integer)',
    'execute'
  ),
  'service role can execute the Session Conversation dispatcher'
);

update private.party_session_config_v2
set reads_enabled = true,
    creation_writes_enabled = true,
    mutation_writes_enabled = true,
    reconciliation_writes_enabled = true,
    updated_at = now()
where singleton;

update private.conversation_authority_config_v2
set reads_enabled = true,
    writes_enabled = true,
    provisioning_enabled = true,
    realtime_enabled = true,
    updated_at = now()
where singleton;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('17010300-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dispatch-a@example.test', 'x', now(), now(), now()),
  ('17010300-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dispatch-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('17010300-0000-4000-8000-000000000001', 'Dispatch A'),
  ('17010300-0000-4000-8000-000000000002', 'Dispatch B');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('17010300-0000-4000-8000-000000000101', '17010300-0000-4000-8000-000000000001', '17010300-0000-4000-8000-000000000001', 'active', 1, true, true),
  ('17010300-0000-4000-8000-000000000102', '17010300-0000-4000-8000-000000000002', '17010300-0000-4000-8000-000000000002', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('17010300-0000-4000-8000-000000000201', '17010300-0000-4000-8000-000000000101', '17010300-0000-4000-8000-000000000001', 1, now()),
  ('17010300-0000-4000-8000-000000000202', '17010300-0000-4000-8000-000000000102', '17010300-0000-4000-8000-000000000002', 1, now());

update public.player_privacy_settings_v2
set session_invites = 'everyone',
    version = version + 1,
    updated_at = now()
where player_id in (
  '17010300-0000-4000-8000-000000000101',
  '17010300-0000-4000-8000-000000000102'
);

create temporary table dispatch_results (
  label text primary key,
  result jsonb not null
);
grant all on dispatch_results to authenticated, service_role;

create or replace function pg_temp.dispatch_audit(p_sequence integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'appVersion', 'session-conversation-dispatch-pgtap',
    'clientCreatedAt', now(),
    'clientRequestId',
      '17010300-0000-4000-8001-' || lpad(p_sequence::text, 12, '0'),
    'deviceInstallationId',
      '17010300-0000-4000-8002-' || lpad(p_sequence::text, 12, '0'),
    'platform', 'android'
  );
$$;
grant execute on function pg_temp.dispatch_audit(integer)
  to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '17010300-0000-4000-8000-000000000001', true);
insert into dispatch_results (label, result)
select 'create', public.create_play_session_v2(
  'Dispatcher duo',
  2,
  array['17010300-0000-4000-8000-000000000102'::uuid],
  null,
  'Asia/Bangkok',
  'session.dispatch.create.0001',
  '17010300-0000-4000-8003-000000000001',
  0,
  pg_temp.dispatch_audit(1)
);
reset role;

select is(
  (select result ->> 'resultCode' from dispatch_results where label = 'create'),
  'created',
  'actor A creates a Session through the public authority'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '17010300-0000-4000-8000-000000000002', true);
insert into dispatch_results (label, result)
select 'invites', public.list_my_session_invites_v2(20);
insert into dispatch_results (label, result)
select 'accept', public.accept_session_invite_v2(
  (select (result #>> '{0,sessionId}')::uuid from dispatch_results where label = 'invites'),
  (select (result #>> '{0,inviteId}')::uuid from dispatch_results where label = 'invites'),
  'session.dispatch.accept.0002',
  '17010300-0000-4000-8003-000000000002',
  (select (result #>> '{0,session,version}')::bigint from dispatch_results where label = 'invites'),
  pg_temp.dispatch_audit(2)
);
reset role;

select is(
  (select result ->> 'resultCode' from dispatch_results where label = 'accept'),
  'invite_accepted',
  'actor B accepts the Session invite through the public authority'
);
select is(
  (
    select count(*)::integer
    from private.conversation_consumed_events_v2 consumed
    where consumed.event_id =
      (select (result #>> '{eventIds,0}')::uuid from dispatch_results where label = 'accept')
  ),
  0,
  'member-joined event is pending before the dispatcher runs'
);
select is(
  (
    select state::text
    from private.play_session_conversation_projection_v2 projections
    where projections.session_id =
      (select (result ->> 'aggregateId')::uuid from dispatch_results where label = 'create')
  ),
  'pending',
  'Session communication projection starts pending'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into dispatch_results (label, result)
select 'dispatch', public.dispatch_session_conversation_events_v2(20);
reset role;

select ok(
  (select (result ->> 'attemptedCount')::integer >= 2 from dispatch_results where label = 'dispatch'),
  'dispatcher attempts the created and member-joined events'
);
select ok(
  (select (result ->> 'processedCount')::integer >= 2 from dispatch_results where label = 'dispatch'),
  'dispatcher processes the eligible Session events'
);
select is(
  (select (result ->> 'failedCount')::integer from dispatch_results where label = 'dispatch'),
  0,
  'valid Session events produce no dispatch failures'
);
select is(
  (
    select count(*)::integer
    from private.conversation_consumed_events_v2 consumed
    where consumed.event_id =
      (select (result #>> '{eventIds,0}')::uuid from dispatch_results where label = 'accept')
  ),
  1,
  'member-joined event is recorded in the Conversation replay ledger'
);
select is(
  (
    select state::text
    from private.play_session_conversation_projection_v2 projections
    where projections.session_id =
      (select (result ->> 'aggregateId')::uuid from dispatch_results where label = 'create')
  ),
  'ready',
  'dispatcher advances Session communication projection to ready'
);
select ok(
  (
    select conversation_id is not null
    from private.play_session_conversation_projection_v2 projections
    where projections.session_id =
      (select (result ->> 'aggregateId')::uuid from dispatch_results where label = 'create')
  ),
  'ready Session projection contains a canonical ConversationId'
);
select is(
  (
    select count(*)::integer
    from public.conversation_members_v2 members
    join private.play_session_conversation_projection_v2 projections
      on projections.conversation_id = members.conversation_id
    where projections.session_id =
      (select (result ->> 'aggregateId')::uuid from dispatch_results where label = 'create')
      and members.state = 'active'
  ),
  2,
  'provisioned Conversation contains both active Session members'
);
select is(
  (
    select count(*)::integer
    from public.conversation_sources_v2 sources
    where sources.source_type = 'play_session'
      and sources.source_id =
        (select (result ->> 'aggregateId')::uuid from dispatch_results where label = 'create')
  ),
  1,
  'Session is bound to exactly one Conversation source'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into dispatch_results (label, result)
select 'dispatch_replay', public.dispatch_session_conversation_events_v2(20);
reset role;

select is(
  (select (result ->> 'attemptedCount')::integer from dispatch_results where label = 'dispatch_replay'),
  0,
  'dispatcher replay has no unconsumed Session events'
);
select is(
  (
    select count(*)::integer
    from public.conversation_sources_v2 sources
    where sources.source_type = 'play_session'
      and sources.source_id =
        (select (result ->> 'aggregateId')::uuid from dispatch_results where label = 'create')
  ),
  1,
  'dispatcher replay does not create a duplicate Conversation'
);

insert into private.outbox_events (
  id,
  event_type,
  aggregate_type,
  aggregate_id,
  payload,
  status,
  attempt_count,
  available_at,
  created_at,
  correlation_id,
  causation_id,
  deduplication_key,
  contract_version
) values (
  '17010300-0000-4000-8000-000000000901',
  'session.created.v2',
  'play_session',
  (select (result ->> 'aggregateId')::uuid from dispatch_results where label = 'create'),
  '{"invalid":true}'::jsonb,
  'pending',
  0,
  now(),
  now(),
  '17010300-0000-4000-8003-000000000003',
  null,
  'session-conversation-dispatch-malformed-170103',
  2
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into dispatch_results (label, result)
select 'malformed', public.dispatch_session_conversation_events_v2(20);
reset role;

select is(
  (select (result ->> 'failedCount')::integer from dispatch_results where label = 'malformed'),
  1,
  'malformed Session event is isolated as a retryable dispatch failure'
);
select is(
  (
    select count(*)::integer
    from private.session_conversation_event_failures_v2 failures
    where failures.event_id = '17010300-0000-4000-8000-000000000901'
  ),
  1,
  'failed event receives durable retry state'
);
select is(
  (
    select attempt_count
    from private.session_conversation_event_failures_v2 failures
    where failures.event_id = '17010300-0000-4000-8000-000000000901'
  ),
  1,
  'first failed dispatch records attempt one'
);
select ok(
  (
    select available_at > now()
    from private.session_conversation_event_failures_v2 failures
    where failures.event_id = '17010300-0000-4000-8000-000000000901'
  ),
  'failed dispatch is delayed by backoff'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into dispatch_results (label, result)
select 'backoff', public.dispatch_session_conversation_events_v2(20);
insert into dispatch_results (label, result)
select 'health', public.get_session_conversation_dispatch_health_v2();
reset role;

select is(
  (select (result ->> 'attemptedCount')::integer from dispatch_results where label = 'backoff'),
  0,
  'immediate retry cannot bypass backoff'
);
select ok(
  (select (result ->> 'cronActive')::boolean from dispatch_results where label = 'health'),
  'health projection confirms the cron job is active'
);
select ok(
  (select (result ->> 'pendingEventCount')::integer >= 1 from dispatch_results where label = 'health'),
  'health projection exposes pending Session Conversation work'
);
select ok(
  (select (result ->> 'failedEventCount')::integer >= 1 from dispatch_results where label = 'health'),
  'health projection exposes failed Session Conversation work'
);

select * from finish();
rollback;
