-- Make API-mode E2E evidence ordering deterministic when providers report the
-- same completedAt timestamp. recorded_at tracks the actual authority write and
-- run_id is the final total-order tie-breaker for historical backfill rows.

alter table private.return_loop_api_e2e_runs_v1
  add column recorded_at timestamptz;

update private.return_loop_api_e2e_runs_v1
set recorded_at = created_at;

alter table private.return_loop_api_e2e_runs_v1
  alter column recorded_at set default clock_timestamp(),
  alter column recorded_at set not null;

drop index if exists private.return_loop_api_e2e_runs_v1_completed_idx;
create index return_loop_api_e2e_runs_v1_completed_idx
  on private.return_loop_api_e2e_runs_v1 (
    completed_at desc,
    recorded_at desc,
    run_id desc
  );

create or replace function public.record_return_loop_api_e2e_result_v1(
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
  recorded private.return_loop_api_e2e_runs_v1%rowtype;
begin
  if p_status not in ('passed', 'failed') then
    raise exception 'Invalid API-mode E2E status'
      using errcode = '22023', detail = 'validation_failed';
  end if;
  if p_completed_at < p_started_at then
    raise exception 'API-mode E2E completion precedes start'
      using errcode = '22023', detail = 'validation_failed';
  end if;
  if jsonb_typeof(p_report) <> 'object' then
    raise exception 'API-mode E2E report must be an object'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  insert into private.return_loop_api_e2e_runs_v1 (
    run_id,
    status,
    started_at,
    completed_at,
    report
  ) values (
    p_run_id,
    p_status::private.return_loop_api_e2e_status_v1,
    p_started_at,
    p_completed_at,
    p_report
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
    'report', recorded.report
  );
end;
$$;

create or replace function public.get_return_loop_release_readiness_without_match_guard_v1(
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
  config_json jsonb;
  core_loop_enabled boolean;
  home_reads_enabled boolean;
  inbox_enabled boolean;
  push_enabled boolean;
  deep_link_enabled boolean;
  duplicate_notification_count integer;
  deep_link_attempt_count integer;
  deep_link_available_count integer;
  deep_link_success_rate numeric;
  push_delivery_count integer;
  push_provider_error_count integer;
  stale_push_job_count integer;
  latest_e2e private.return_loop_api_e2e_runs_v1%rowtype;
  duplicate_notifications_healthy boolean;
  deep_link_slo_healthy boolean;
  push_provider_observed boolean;
  push_backlog_healthy boolean;
  api_mode_e2e_fresh boolean;
  ready boolean;
begin
  if p_window <= interval '0 seconds' or p_window > interval '30 days' then
    raise exception 'Invalid release readiness window'
      using errcode = '22023', detail = 'validation_failed';
  end if;
  window_started_at := generated_at - p_window;

  select to_jsonb(config) into config_json
  from private.return_loop_config_v1 as config
  where config.singleton;

  core_loop_enabled := coalesce(
    (config_json ->> 'core_loop_enabled')::boolean,
    false
  );
  home_reads_enabled := coalesce(
    (config_json ->> 'home_reads_enabled')::boolean,
    true
  );
  inbox_enabled := coalesce(
    (config_json ->> 'notification_inbox_enabled')::boolean,
    (config_json ->> 'inbox_enabled')::boolean,
    true
  );
  push_enabled := coalesce(
    (config_json ->> 'push_enabled')::boolean,
    false
  );
  deep_link_enabled := coalesce(
    (config_json ->> 'deep_links_enabled')::boolean,
    (config_json ->> 'deep_link_enabled')::boolean,
    false
  );

  select coalesce(sum(duplicate_count - 1), 0)::integer
  into duplicate_notification_count
  from (
    select count(*)::integer as duplicate_count
    from public.notifications_v1 as notification
    group by notification.source_event_id
    having count(*) > 1
  ) as duplicates;

  select
    count(*) filter (
      where attempt.status in (
        'available',
        'expired',
        'not_found',
        'player_unavailable',
        'provider_unavailable'
      )
    )::integer,
    count(*) filter (where attempt.status = 'available')::integer
  into deep_link_attempt_count, deep_link_available_count
  from private.notification_deep_link_attempts_v1 as attempt
  where attempt.resolved_at >= window_started_at;

  deep_link_success_rate := case
    when deep_link_attempt_count = 0 then null
    else deep_link_available_count::numeric / deep_link_attempt_count::numeric
  end;

  select
    count(*)::integer,
    count(*) filter (
      where delivery.status in ('ticket_error', 'receipt_error')
    )::integer
  into push_delivery_count, push_provider_error_count
  from private.notification_push_deliveries_v1 as delivery
  where delivery.created_at >= window_started_at;

  select count(*)::integer into stale_push_job_count
  from private.notification_push_jobs_v1 as job
  where (
      job.status = 'processing'
      and job.claimed_at < generated_at - interval '15 minutes'
    ) or (
      job.status = 'pending'
      and job.available_at < generated_at - interval '15 minutes'
      and job.expires_at > generated_at
    );

  select * into latest_e2e
  from private.return_loop_api_e2e_runs_v1 as run
  order by run.completed_at desc,
           run.recorded_at desc,
           run.run_id desc
  limit 1;

  duplicate_notifications_healthy := duplicate_notification_count = 0;
  deep_link_slo_healthy :=
    deep_link_success_rate is null or deep_link_success_rate >= 0.99;
  push_provider_observed :=
    not push_enabled
    or push_delivery_count > 0
    or coalesce(
      (latest_e2e.report ->> 'pushObserved')::boolean,
      false
    );
  push_backlog_healthy := stale_push_job_count = 0;
  api_mode_e2e_fresh :=
    latest_e2e.status = 'passed'
    and latest_e2e.completed_at >= generated_at - interval '24 hours';
  ready :=
    core_loop_enabled
    and home_reads_enabled
    and inbox_enabled
    and push_enabled
    and deep_link_enabled
    and duplicate_notifications_healthy
    and deep_link_slo_healthy
    and push_provider_observed
    and push_backlog_healthy
    and api_mode_e2e_fresh;

  return jsonb_build_object(
    'windowStartedAt', window_started_at,
    'generatedAt', generated_at,
    'flags', jsonb_build_object(
      'coreLoopEnabled', core_loop_enabled,
      'homeEnabled', home_reads_enabled,
      'inboxEnabled', inbox_enabled,
      'pushEnabled', push_enabled,
      'deepLinkEnabled', deep_link_enabled
    ),
    'metrics', jsonb_build_object(
      'duplicateNotificationCount', duplicate_notification_count,
      'deepLinkAttemptCount', deep_link_attempt_count,
      'deepLinkAvailableCount', deep_link_available_count,
      'deepLinkSuccessRate', deep_link_success_rate,
      'pushDeliveryCount', push_delivery_count,
      'pushProviderErrorCount', push_provider_error_count,
      'stalePushJobCount', stale_push_job_count
    ),
    'apiModeE2e', jsonb_build_object(
      'lastRunId', latest_e2e.run_id,
      'lastStatus', latest_e2e.status,
      'lastCompletedAt', latest_e2e.completed_at
    ),
    'checks', jsonb_build_object(
      'duplicateNotificationsHealthy', duplicate_notifications_healthy,
      'deepLinkSloHealthy', deep_link_slo_healthy,
      'pushProviderObserved', push_provider_observed,
      'pushBacklogHealthy', push_backlog_healthy,
      'apiModeE2eFresh', api_mode_e2e_fresh
    ),
    'ready', ready
  );
end;
$$;

revoke all on function public.record_return_loop_api_e2e_result_v1(
  uuid, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.get_return_loop_release_readiness_without_match_guard_v1(interval)
  from public, anon, authenticated;
grant execute on function public.record_return_loop_api_e2e_result_v1(
  uuid, text, timestamptz, timestamptz, jsonb
) to service_role;
grant execute on function public.get_return_loop_release_readiness_without_match_guard_v1(interval)
  to service_role;
