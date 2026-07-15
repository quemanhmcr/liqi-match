create extension if not exists pgtap with schema extensions;

begin;
select plan(29);

select has_table(
  'private',
  'party_session_api_e2e_runs_v2',
  'Party/Session API E2E evidence table exists'
);
select has_function(
  'public',
  'record_party_session_api_e2e_result_v2',
  array['uuid', 'text', 'timestamp with time zone', 'timestamp with time zone', 'jsonb'],
  'API E2E evidence recorder exists'
);
select has_function(
  'public',
  'get_party_session_release_readiness_v2',
  array['interval'],
  'Party/Session readiness projection exists'
);
select function_privs_are(
  'public',
  'get_party_session_release_readiness_v2',
  array['interval'],
  'authenticated',
  array[]::text[],
  'readiness is unavailable to clients'
);
select function_privs_are(
  'public',
  'get_party_session_release_readiness_v2',
  array['interval'],
  'service_role',
  array['EXECUTE'],
  'readiness is available to operators'
);

update private.party_session_config_v2
set reads_enabled = true,
    creation_writes_enabled = true,
    mutation_writes_enabled = true,
    reconciliation_writes_enabled = true,
    updated_at = now()
where singleton;

select is(
  public.record_party_session_api_e2e_result_v2(
    'e3000000-0000-4000-8000-000000000001',
    'passed',
    now() - interval '2 minutes',
    now(),
    '{"twoDeviceLifecycle":true,"staleVersionRejected":true,"restartRestored":true}'
  ) ->> 'status',
  'passed',
  'passing API E2E evidence is recorded'
);
select is(
  public.record_party_session_api_e2e_result_v2(
    'e3000000-0000-4000-8000-000000000001',
    'passed',
    now() - interval '1 minute',
    now(),
    '{"twoDeviceLifecycle":true,"staleVersionRejected":true,"restartRestored":true,"rerun":true}'
  ) #>> '{report,rerun}',
  'true',
  'same run id updates evidence deterministically'
);
select throws_like(
  $$select public.record_party_session_api_e2e_result_v2(
    gen_random_uuid(), 'unknown', now(), now(), '{}'
  )$$,
  '%validation_failed%',
  'invalid E2E evidence is rejected'
);
select throws_like(
  $$select public.get_party_session_release_readiness_v2(interval '0 seconds')$$,
  '%validation_failed%',
  'invalid readiness window is rejected'
);

create temporary table initial_readiness as
select public.get_party_session_release_readiness_v2() as value;
select is((select value #>> '{flags,readsEnabled}' from initial_readiness), 'true', 'read flag is projected');
select is((select value #>> '{flags,creationWritesEnabled}' from initial_readiness), 'true', 'creation flag is projected');
select is((select value #>> '{flags,mutationWritesEnabled}' from initial_readiness), 'true', 'mutation flag is projected');
select is((select value #>> '{flags,reconciliationWritesEnabled}' from initial_readiness), 'true', 'reconciliation flag is projected');
select is((select value #>> '{checks,apiModeE2eFresh}' from initial_readiness), 'true', 'fresh passing API E2E is required');
select is((select value #>> '{checks,aggregateInvariantsHealthy}' from initial_readiness), 'true', 'empty aggregate projection starts healthy');
select is((select value #>> '{checks,communicationHealthy}' from initial_readiness), 'true', 'empty communication projection starts healthy');
select is((select value #>> '{checks,readyChecksHealthy}' from initial_readiness), 'true', 'empty ready-check projection starts healthy');
select is((select value #>> '{checks,socialConsumerHealthy}' from initial_readiness), 'true', 'empty social retry projection starts healthy');
select is((select value ->> 'ready' from initial_readiness), 'true', 'all enabled healthy gates produce ready=true');
select is((select value #>> '{funnel,sessionCreatedCount}' from initial_readiness), '0', 'empty funnel starts with zero Session creates');
select is((select value #>> '{operational,invariantViolationCount}' from initial_readiness), '0', 'empty authority has no invariant violations');

update private.party_session_config_v2
set creation_writes_enabled = false,
    mutation_writes_enabled = false,
    reconciliation_writes_enabled = false,
    updated_at = now()
where singleton;
create temporary table rollback_readiness as
select public.get_party_session_release_readiness_v2() as value;
select is((select value #>> '{checks,rollbackSafe}' from rollback_readiness), 'true', 'read-only rollback posture is projected safe');
select is((select value ->> 'ready' from rollback_readiness), 'false', 'rollback posture blocks release readiness');
select is((select value #>> '{flags,readsEnabled}' from rollback_readiness), 'true', 'rollback preserves authoritative reads');
select is((select count(*)::integer from private.party_session_api_e2e_runs_v2), 1, 'rollback preserves API E2E evidence');
select is((select count(*)::integer from private.command_receipts_v1), 0, 'rollback does not synthesize or delete command receipts');

update private.party_session_config_v2
set creation_writes_enabled = true,
    mutation_writes_enabled = true,
    reconciliation_writes_enabled = true,
    updated_at = now()
where singleton;
insert into private.party_session_api_e2e_runs_v2 (
  run_id, status, started_at, completed_at, report
) values (
  'e3000000-0000-4000-8000-000000000002',
  'failed',
  now() - interval '30 seconds',
  now(),
  '{}'
);
select is(public.get_party_session_release_readiness_v2() #>> '{apiModeE2e,lastStatus}', 'failed', 'latest failed API E2E is visible');
select is(public.get_party_session_release_readiness_v2() #>> '{checks,apiModeE2eFresh}', 'false', 'latest failed API E2E blocks freshness');
select is(public.get_party_session_release_readiness_v2() ->> 'ready', 'false', 'latest failed API E2E blocks release');

select * from finish();
rollback;
