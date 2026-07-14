-- Core V2 Party/Session release readiness.
-- Metrics are projections of authoritative tables/events; they never decide
-- lifecycle semantics. API-mode evidence and rollback flags are durable.

create table private.party_session_api_e2e_runs_v2 (
  run_id uuid primary key,
  status text not null check (status in ('passed', 'failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  report jsonb not null default '{}'::jsonb check (jsonb_typeof(report) = 'object'),
  recorded_at timestamptz not null default clock_timestamp(),
  check (completed_at >= started_at)
);

create index party_session_api_e2e_runs_v2_latest_idx
  on private.party_session_api_e2e_runs_v2 (
    completed_at desc,
    recorded_at desc,
    run_id desc
  );

create or replace function private.assert_party_session_operator_v2()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    perform private.raise_core_error_v1(
      'forbidden',
      'Party/Session operational access requires service role.'
    );
  end if;
end;
$$;

create or replace function public.record_party_session_api_e2e_result_v2(
  p_run_id uuid,
  p_status text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_report jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded private.party_session_api_e2e_runs_v2%rowtype;
begin
  perform private.assert_party_session_operator_v2();
  if p_run_id is null
    or p_status not in ('passed', 'failed')
    or p_started_at is null
    or p_completed_at is null
    or p_completed_at < p_started_at
    or jsonb_typeof(p_report) <> 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Party/Session API E2E evidence is invalid.'
    );
  end if;

  insert into private.party_session_api_e2e_runs_v2 (
    run_id,
    status,
    started_at,
    completed_at,
    report,
    recorded_at
  ) values (
    p_run_id,
    p_status,
    p_started_at,
    p_completed_at,
    p_report,
    clock_timestamp()
  )
  on conflict (run_id) do update
    set status = excluded.status,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        report = excluded.report,
        recorded_at = clock_timestamp()
  returning * into recorded;

  return jsonb_build_object(
    'runId', recorded.run_id,
    'status', recorded.status,
    'startedAt', recorded.started_at,
    'completedAt', recorded.completed_at,
    'report', recorded.report,
    'recordedAt', recorded.recorded_at
  );
end;
$$;

create or replace function public.get_party_session_release_readiness_v2(
  p_window interval default interval '24 hours'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  generated_at timestamptz := clock_timestamp();
  window_started_at timestamptz;
  config_row private.party_session_config_v2%rowtype;
  latest_e2e private.party_session_api_e2e_runs_v2%rowtype;
  session_created_count integer;
  session_invite_created_count integer;
  session_member_joined_count integer;
  ready_check_opened_count integer;
  ready_check_passed_count integer;
  ready_check_expired_count integer;
  session_started_count integer;
  session_completed_count integer;
  session_disputed_count integer;
  session_cancelled_count integer;
  invite_acceptance_rate numeric;
  ready_pass_rate numeric;
  completion_rate numeric;
  communication_pending_count integer;
  communication_degraded_count integer;
  stale_communication_count integer;
  overdue_ready_check_count integer;
  due_social_retry_count integer;
  owner_invariant_violation_count integer;
  capacity_invariant_violation_count integer;
  ready_state_invariant_violation_count integer;
  completion_event_invariant_violation_count integer;
  invariant_violation_count integer;
  api_mode_e2e_fresh boolean;
  communication_healthy boolean;
  ready_checks_healthy boolean;
  social_consumer_healthy boolean;
  aggregate_invariants_healthy boolean;
  rollback_safe boolean;
  ready boolean;
begin
  perform private.assert_party_session_operator_v2();
  if p_window <= interval '0 seconds' or p_window > interval '30 days' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Party/Session readiness window must be between one second and 30 days.'
    );
  end if;
  window_started_at := generated_at - p_window;

  select config.* into config_row
  from private.party_session_config_v2 config
  where config.singleton;

  select * into latest_e2e
  from private.party_session_api_e2e_runs_v2 runs
  order by runs.completed_at desc, runs.recorded_at desc, runs.run_id desc
  limit 1;

  select
    count(*) filter (where events.event_type = 'session.created.v2')::integer,
    count(*) filter (where events.event_type = 'session.invite_created.v2')::integer,
    count(*) filter (where events.event_type = 'session.member_joined.v2')::integer,
    count(*) filter (where events.event_type = 'session.ready_check_opened.v2')::integer,
    count(*) filter (where events.event_type = 'session.ready_check_passed.v2')::integer,
    count(*) filter (where events.event_type = 'session.ready_check_expired.v2')::integer,
    count(*) filter (where events.event_type = 'session.started.v2')::integer,
    count(*) filter (where events.event_type = 'session.completed.v2')::integer,
    count(*) filter (where events.event_type in ('session.disputed.v2', 'session.safety_disputed.v2'))::integer,
    count(*) filter (where events.event_type = 'session.cancelled.v2')::integer
  into
    session_created_count,
    session_invite_created_count,
    session_member_joined_count,
    ready_check_opened_count,
    ready_check_passed_count,
    ready_check_expired_count,
    session_started_count,
    session_completed_count,
    session_disputed_count,
    session_cancelled_count
  from private.outbox_events events
  where events.created_at >= window_started_at;

  invite_acceptance_rate := case
    when session_invite_created_count = 0 then null
    else round(
      least(session_member_joined_count, session_invite_created_count)::numeric /
      session_invite_created_count::numeric,
      4
    )
  end;
  ready_pass_rate := case
    when ready_check_opened_count = 0 then null
    else round(
      ready_check_passed_count::numeric / ready_check_opened_count::numeric,
      4
    )
  end;
  completion_rate := case
    when session_started_count = 0 then null
    else round(
      session_completed_count::numeric / session_started_count::numeric,
      4
    )
  end;

  select
    count(*) filter (where projections.state = 'pending')::integer,
    count(*) filter (where projections.state = 'degraded')::integer,
    count(*) filter (
      where projections.state in ('pending', 'degraded')
        and projections.updated_at < generated_at - interval '5 minutes'
        and exists (
          select 1
          from public.play_session_members_v2 members
          where members.session_id = projections.session_id
            and members.state = 'active'
          group by members.session_id
          having count(*) >= 2
        )
    )::integer
  into
    communication_pending_count,
    communication_degraded_count,
    stale_communication_count
  from private.play_session_conversation_projection_v2 projections;

  select count(*)::integer into overdue_ready_check_count
  from public.play_session_ready_checks_v2 checks
  where checks.state = 'open'
    and checks.deadline_at <= generated_at;

  select count(*)::integer into due_social_retry_count
  from private.play_session_social_event_failures_v2 failures
  where failures.available_at <= generated_at
    and not exists (
      select 1
      from private.play_session_consumed_social_events_v2 consumed
      where consumed.event_id = failures.event_id
    );

  select count(*)::integer into owner_invariant_violation_count
  from public.play_sessions_v2 sessions
  where (
    select count(*)
    from public.play_session_members_v2 members
    where members.session_id = sessions.id
      and members.state = 'active'
      and members.role = 'owner'
  ) <> 1;

  select count(*)::integer into capacity_invariant_violation_count
  from public.play_sessions_v2 sessions
  where (
    select count(*)
    from public.play_session_members_v2 members
    where members.session_id = sessions.id
      and members.state = 'active'
  ) > sessions.capacity;

  select count(*)::integer into ready_state_invariant_violation_count
  from public.play_session_ready_checks_v2 checks
  join public.play_sessions_v2 sessions on sessions.id = checks.session_id
  where (checks.state = 'open' and sessions.state <> 'ready_check')
    or (
      checks.state in ('open', 'passed')
      and checks.required_membership_version <> sessions.membership_version
    );

  select count(*)::integer into completion_event_invariant_violation_count
  from public.play_sessions_v2 sessions
  where sessions.state = 'completed'
    and not exists (
      select 1
      from private.outbox_events events
      where events.aggregate_id = sessions.id
        and events.event_type = 'session.completed.v2'
    );

  invariant_violation_count :=
    owner_invariant_violation_count +
    capacity_invariant_violation_count +
    ready_state_invariant_violation_count +
    completion_event_invariant_violation_count;
  api_mode_e2e_fresh :=
    latest_e2e.status = 'passed'
    and latest_e2e.completed_at >= generated_at - interval '24 hours';
  communication_healthy := stale_communication_count = 0;
  ready_checks_healthy := overdue_ready_check_count = 0;
  social_consumer_healthy := due_social_retry_count = 0;
  aggregate_invariants_healthy := invariant_violation_count = 0;
  rollback_safe :=
    config_row.reads_enabled
    and not config_row.creation_writes_enabled
    and not config_row.mutation_writes_enabled;
  ready :=
    config_row.reads_enabled
    and config_row.creation_writes_enabled
    and config_row.mutation_writes_enabled
    and config_row.reconciliation_writes_enabled
    and communication_healthy
    and ready_checks_healthy
    and social_consumer_healthy
    and aggregate_invariants_healthy
    and api_mode_e2e_fresh;

  return jsonb_build_object(
    'windowStartedAt', window_started_at,
    'generatedAt', generated_at,
    'flags', jsonb_build_object(
      'readsEnabled', config_row.reads_enabled,
      'creationWritesEnabled', config_row.creation_writes_enabled,
      'mutationWritesEnabled', config_row.mutation_writes_enabled,
      'reconciliationWritesEnabled', config_row.reconciliation_writes_enabled
    ),
    'funnel', jsonb_build_object(
      'sessionCreatedCount', session_created_count,
      'sessionInviteCreatedCount', session_invite_created_count,
      'sessionMemberJoinedCount', session_member_joined_count,
      'inviteAcceptanceRate', invite_acceptance_rate,
      'readyCheckOpenedCount', ready_check_opened_count,
      'readyCheckPassedCount', ready_check_passed_count,
      'readyCheckExpiredCount', ready_check_expired_count,
      'readyPassRate', ready_pass_rate,
      'sessionStartedCount', session_started_count,
      'sessionCompletedCount', session_completed_count,
      'sessionDisputedCount', session_disputed_count,
      'sessionCancelledCount', session_cancelled_count,
      'completionRate', completion_rate
    ),
    'operational', jsonb_build_object(
      'communicationPendingCount', communication_pending_count,
      'communicationDegradedCount', communication_degraded_count,
      'staleCommunicationCount', stale_communication_count,
      'overdueReadyCheckCount', overdue_ready_check_count,
      'dueSocialRetryCount', due_social_retry_count,
      'ownerInvariantViolationCount', owner_invariant_violation_count,
      'capacityInvariantViolationCount', capacity_invariant_violation_count,
      'readyStateInvariantViolationCount', ready_state_invariant_violation_count,
      'completionEventInvariantViolationCount', completion_event_invariant_violation_count,
      'invariantViolationCount', invariant_violation_count
    ),
    'apiModeE2e', jsonb_build_object(
      'lastRunId', latest_e2e.run_id,
      'lastStatus', latest_e2e.status,
      'lastCompletedAt', latest_e2e.completed_at
    ),
    'checks', jsonb_build_object(
      'communicationHealthy', communication_healthy,
      'readyChecksHealthy', ready_checks_healthy,
      'socialConsumerHealthy', social_consumer_healthy,
      'aggregateInvariantsHealthy', aggregate_invariants_healthy,
      'apiModeE2eFresh', api_mode_e2e_fresh,
      'rollbackSafe', rollback_safe
    ),
    'ready', ready
  );
end;
$$;

revoke all on private.party_session_api_e2e_runs_v2
  from public, anon, authenticated;
grant all on private.party_session_api_e2e_runs_v2 to service_role;

revoke execute on function private.assert_party_session_operator_v2()
  from public, anon, authenticated;
grant execute on function private.assert_party_session_operator_v2()
  to service_role;
revoke execute on function public.record_party_session_api_e2e_result_v2(
  uuid, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.record_party_session_api_e2e_result_v2(
  uuid, text, timestamptz, timestamptz, jsonb
) to service_role;
revoke execute on function public.get_party_session_release_readiness_v2(interval)
  from public, anon, authenticated;
grant execute on function public.get_party_session_release_readiness_v2(interval)
  to service_role;
