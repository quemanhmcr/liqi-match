create extension if not exists pgtap with schema extensions;

begin;
select plan(25);

update private.return_loop_config_v1
set core_loop_enabled = true,
    home_reads_enabled = true,
    notification_inbox_enabled = true,
    push_enabled = true,
    deep_links_enabled = true;

select is(
  public.record_return_loop_api_e2e_result_v1(
    'e0000000-0000-4000-8000-000000000901',
    'passed',
    now() - interval '5 minutes',
    now(),
    '{"twoDeviceCoreLoop":true,"restartRestored":true,"retryIdempotent":true,"pushObserved":true}'
  ) ->> 'status',
  'passed',
  'API-mode E2E evidence is recorded'
);
select is(
  public.record_return_loop_api_e2e_result_v1(
    'e0000000-0000-4000-8000-000000000901',
    'passed',
    now() - interval '4 minutes',
    now(),
    '{"twoDeviceCoreLoop":true,"restartRestored":true,"retryIdempotent":true,"pushObserved":true,"rerun":true}'
  ) #>> '{report,rerun}',
  'true',
  'same E2E run idempotently updates evidence'
);
select throws_ok(
  $$select public.record_return_loop_api_e2e_result_v1(gen_random_uuid(), 'unknown', now(), now(), '{}')$$,
  '22023',
  'Invalid API-mode E2E status',
  'invalid E2E status is rejected'
);
select throws_ok(
  $$select public.get_return_loop_release_readiness_v1(interval '0 seconds')$$,
  '22023',
  'Invalid release readiness window',
  'invalid readiness window is rejected'
);

create temporary table ready_projection as
select public.get_return_loop_release_readiness_v1() as value;
select is((select value #>> '{flags,coreLoopEnabled}' from ready_projection), 'true', 'master flag is projected');
select is((select value #>> '{flags,homeEnabled}' from ready_projection), 'true', 'Home flag is projected');
select is((select value #>> '{flags,inboxEnabled}' from ready_projection), 'true', 'Inbox flag is projected');
select is((select value #>> '{flags,pushEnabled}' from ready_projection), 'true', 'Push flag is projected');
select is((select value #>> '{flags,deepLinkEnabled}' from ready_projection), 'true', 'Deep-link flag is projected');
select is((select value #>> '{metrics,duplicateNotificationCount}' from ready_projection), '0', 'duplicate notification metric starts healthy');
select is((select value #>> '{checks,pushProviderObserved}' from ready_projection), 'true', 'E2E evidence can prove push provider observation before cohort traffic');
select is((select value #>> '{checks,apiModeE2eFresh}' from ready_projection), 'true', 'fresh passing API-mode E2E is required');
select is((select value #>> '{metrics,matchCreatedCount}' from ready_projection), '0', 'empty funnel starts with zero matches');
select is((select value #>> '{checks,matchConversationFunnelHealthy}' from ready_projection), 'true', 'empty funnel is healthy');
select is((select value ->> 'ready' from ready_projection), 'true', 'all integrated gates produce ready=true');

insert into private.match_funnel_events_v1 (
  event_name, aggregate_type, aggregate_id, aggregate_version
) values (
  'match_created', 'match', 'e1000000-0000-4000-8000-000000000901', 1
);
select is(public.get_return_loop_release_readiness_v1() #>> '{metrics,matchConversationDivergenceCount}', '1', 'unpaired Match is visible as funnel divergence');
select is(public.get_return_loop_release_readiness_v1() #>> '{checks,matchConversationFunnelHealthy}', 'false', 'unexplained Match divergence blocks funnel health');
select is(public.get_return_loop_release_readiness_v1() ->> 'ready', 'false', 'unexplained Match divergence blocks release');

insert into private.match_funnel_events_v1 (
  event_name, aggregate_type, aggregate_id, aggregate_version
) values (
  'conversation_ready', 'match', 'e1000000-0000-4000-8000-000000000901', 1
);
select is(public.get_return_loop_release_readiness_v1() #>> '{metrics,matchConversationReadyRate}', '1.00000000000000000000', 'conversation readiness restores a complete funnel rate');
select is(public.get_return_loop_release_readiness_v1() #>> '{checks,matchConversationFunnelHealthy}', 'true', 'paired Match and conversation restore funnel health');

update private.return_loop_config_v1 set core_loop_enabled = false;
select is(
  private.return_loop_feature_enabled_v1(
    'home',
    '01000000-0000-4000-8000-000000000901'
  ),
  false,
  'master kill switch disables lower-level feature flags'
);
select is(public.get_return_loop_release_readiness_v1() ->> 'ready', 'false', 'master kill switch blocks release readiness');

update private.return_loop_config_v1 set core_loop_enabled = true;
insert into private.return_loop_api_e2e_runs_v1 (
  run_id, status, started_at, completed_at, report
) values (
  'e0000000-0000-4000-8000-000000000902',
  'failed',
  now() - interval '1 minute',
  now(),
  '{"pushObserved":true}'
);
select is(public.get_return_loop_release_readiness_v1() #>> '{apiModeE2e,lastStatus}', 'failed', 'latest failed E2E is visible');
select is(public.get_return_loop_release_readiness_v1() #>> '{checks,apiModeE2eFresh}', 'false', 'failed E2E blocks freshness gate');
select is(public.get_return_loop_release_readiness_v1() ->> 'ready', 'false', 'failed E2E blocks integrated readiness');

select * from finish();
rollback;
