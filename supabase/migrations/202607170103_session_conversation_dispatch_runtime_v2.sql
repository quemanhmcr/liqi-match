-- Production dispatcher for the existing Session V2 -> Conversation V2 consumer.
--
-- Session commands publish immutable contract events into the shared outbox.
-- Conversation owns its own replay ledger, so this worker must not mutate the
-- shared outbox status or prevent other independent consumers from observing
-- the same event.

create table private.session_conversation_event_failures_v2 (
  event_id uuid primary key references private.outbox_events(id) on delete restrict,
  attempt_count integer not null default 1 check (attempt_count > 0),
  available_at timestamptz not null default now(),
  last_error text not null,
  updated_at timestamptz not null default now()
);

create index session_conversation_event_failures_v2_available_idx
  on private.session_conversation_event_failures_v2 (available_at, event_id);

create or replace function private.assert_session_conversation_worker_v2()
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
      'Session Conversation processing requires service role.'
    );
  end if;
end;
$$;

create or replace function public.process_pending_session_conversation_events_v2(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  result_value jsonb;
  results_value jsonb := '[]'::jsonb;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  processed_count integer := 0;
  failed_count integer := 0;
  failure_attempt_count integer;
  previous_claim_role text := current_setting('request.jwt.claim.role', true);
begin
  perform private.assert_session_conversation_worker_v2();

  -- pg_cron runs without an HTTP JWT. The canonical consumer deliberately
  -- requires the service role, so establish that claim only inside this
  -- privileged transaction and restore the previous value before returning.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  for event_row in
    select
      events.id,
      events.aggregate_id,
      events.event_type,
      events.payload
    from private.outbox_events events
    left join private.session_conversation_event_failures_v2 failures
      on failures.event_id = events.id
    where events.aggregate_type = 'play_session'
      and events.contract_version = 2
      and events.event_type in (
        'session.created.v2',
        'session.member_joined.v2',
        'session.member_left.v2',
        'session.role_assigned.v2',
        'session.ready_check_opened.v2',
        'session.ready_check_expired.v2',
        'session.member_not_ready.v2',
        'session.member_ready.v2',
        'session.ready_check_passed.v2',
        'session.scheduled.v2',
        'session.started.v2',
        'session.completion_proposed.v2',
        'session.completed.v2',
        'session.cancelled.v2',
        'session.disputed.v2'
      )
      and not exists (
        select 1
        from private.conversation_consumed_events_v2 consumed
        where consumed.event_id = events.id
      )
      and coalesce(failures.available_at, '-infinity'::timestamptz) <= now()
    order by events.created_at, events.id
    limit safe_limit
    for update of events skip locked
  loop
    begin
      result_value := public.consume_session_conversation_event_v2(
        event_row.payload
      );

      delete from private.session_conversation_event_failures_v2
      where event_id = event_row.id;

      processed_count := processed_count + 1;
      results_value := results_value || jsonb_build_array(
        jsonb_build_object(
          'eventType', event_row.event_type,
          'result', result_value,
          'sourceEventId', event_row.id,
          'status', 'processed'
        )
      );
    exception when others then
      insert into private.session_conversation_event_failures_v2 (
        event_id,
        attempt_count,
        available_at,
        last_error
      ) values (
        event_row.id,
        1,
        now() + interval '5 seconds',
        left(sqlerrm, 2000)
      )
      on conflict (event_id) do update
      set attempt_count =
            private.session_conversation_event_failures_v2.attempt_count + 1,
          available_at = now() + make_interval(
            secs => least(
              3600::bigint,
              greatest(
                5::bigint,
                (
                  private.session_conversation_event_failures_v2.attempt_count + 1
                )::bigint * (
                  private.session_conversation_event_failures_v2.attempt_count + 1
                )::bigint * 5::bigint
              )
            )::double precision
          ),
          last_error = excluded.last_error,
          updated_at = now()
      returning attempt_count into failure_attempt_count;

      if failure_attempt_count >= 3 then
        update private.play_session_conversation_projection_v2
        set state = 'degraded',
            last_error_code = coalesce(nullif(sqlstate, ''), 'unknown'),
            updated_at = now()
        where session_id = event_row.aggregate_id;
      end if;

      failed_count := failed_count + 1;
      results_value := results_value || jsonb_build_array(
        jsonb_build_object(
          'attemptCount', failure_attempt_count,
          'errorCode', coalesce(nullif(sqlstate, ''), 'unknown'),
          'eventType', event_row.event_type,
          'sourceEventId', event_row.id,
          'status', 'retry_scheduled'
        )
      );
    end;
  end loop;

  perform set_config(
    'request.jwt.claim.role',
    coalesce(previous_claim_role, ''),
    true
  );

  return jsonb_build_object(
    'attemptedCount', processed_count + failed_count,
    'failedCount', failed_count,
    'processedCount', processed_count,
    'results', results_value
  );
end;
$$;

create or replace function public.dispatch_session_conversation_events_v2(
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.process_pending_session_conversation_events_v2(
    greatest(1, least(coalesce(p_limit, 50), 100))
  );
$$;

create or replace function public.get_session_conversation_dispatch_health_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  generated_at timestamptz := clock_timestamp();
begin
  perform private.assert_party_session_operator_v2();

  return jsonb_build_object(
    'checkedAt', generated_at,
    'cronActive', exists (
      select 1
      from cron.job jobs
      where jobs.jobname = 'session-conversation-events-v2'
        and jobs.active
        and jobs.command =
          'select public.dispatch_session_conversation_events_v2(50);'
    ),
    'degradedProjectionCount', (
      select count(*)::integer
      from private.play_session_conversation_projection_v2 projections
      where projections.state = 'degraded'
    ),
    'dueEventCount', (
      select count(*)::integer
      from private.outbox_events events
      left join private.session_conversation_event_failures_v2 failures
        on failures.event_id = events.id
      where events.aggregate_type = 'play_session'
        and events.contract_version = 2
        and events.event_type in (
          'session.created.v2',
          'session.member_joined.v2',
          'session.member_left.v2',
          'session.role_assigned.v2',
          'session.ready_check_opened.v2',
          'session.ready_check_expired.v2',
          'session.member_not_ready.v2',
          'session.member_ready.v2',
          'session.ready_check_passed.v2',
          'session.scheduled.v2',
          'session.started.v2',
          'session.completion_proposed.v2',
          'session.completed.v2',
          'session.cancelled.v2',
          'session.disputed.v2'
        )
        and not exists (
          select 1
          from private.conversation_consumed_events_v2 consumed
          where consumed.event_id = events.id
        )
        and coalesce(failures.available_at, '-infinity'::timestamptz)
          <= generated_at
    ),
    'failedEventCount', (
      select count(*)::integer
      from private.session_conversation_event_failures_v2 failures
      where not exists (
        select 1
        from private.conversation_consumed_events_v2 consumed
        where consumed.event_id = failures.event_id
      )
    ),
    'oldestPendingAt', (
      select min(events.created_at)
      from private.outbox_events events
      where events.aggregate_type = 'play_session'
        and events.contract_version = 2
        and events.event_type in (
          'session.created.v2',
          'session.member_joined.v2',
          'session.member_left.v2',
          'session.role_assigned.v2',
          'session.ready_check_opened.v2',
          'session.ready_check_expired.v2',
          'session.member_not_ready.v2',
          'session.member_ready.v2',
          'session.ready_check_passed.v2',
          'session.scheduled.v2',
          'session.started.v2',
          'session.completion_proposed.v2',
          'session.completed.v2',
          'session.cancelled.v2',
          'session.disputed.v2'
        )
        and not exists (
          select 1
          from private.conversation_consumed_events_v2 consumed
          where consumed.event_id = events.id
        )
    ),
    'pendingEventCount', (
      select count(*)::integer
      from private.outbox_events events
      where events.aggregate_type = 'play_session'
        and events.contract_version = 2
        and events.event_type in (
          'session.created.v2',
          'session.member_joined.v2',
          'session.member_left.v2',
          'session.role_assigned.v2',
          'session.ready_check_opened.v2',
          'session.ready_check_expired.v2',
          'session.member_not_ready.v2',
          'session.member_ready.v2',
          'session.ready_check_passed.v2',
          'session.scheduled.v2',
          'session.started.v2',
          'session.completion_proposed.v2',
          'session.completed.v2',
          'session.cancelled.v2',
          'session.disputed.v2'
        )
        and not exists (
          select 1
          from private.conversation_consumed_events_v2 consumed
          where consumed.event_id = events.id
        )
    ),
    'pendingProjectionCount', (
      select count(*)::integer
      from private.play_session_conversation_projection_v2 projections
      where projections.state = 'pending'
    ),
    'readyProjectionCount', (
      select count(*)::integer
      from private.play_session_conversation_projection_v2 projections
      where projections.state = 'ready'
    )
  );
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pg_cron'
  ) then
    raise exception
      'Supabase Cron must be enabled before Session Conversation cutover'
      using errcode = '55000', detail = 'pg_cron_required';
  end if;
end;
$$;

select cron.schedule(
  'session-conversation-events-v2',
  '5 seconds',
  $job$select public.dispatch_session_conversation_events_v2(50);$job$
);

revoke all on private.session_conversation_event_failures_v2
  from public, anon, authenticated;
grant all on private.session_conversation_event_failures_v2 to service_role;

revoke execute on function private.assert_session_conversation_worker_v2()
  from public, anon, authenticated;
grant execute on function private.assert_session_conversation_worker_v2()
  to service_role;

revoke execute on function public.process_pending_session_conversation_events_v2(integer)
  from public, anon, authenticated;
revoke execute on function public.dispatch_session_conversation_events_v2(integer)
  from public, anon, authenticated;
revoke execute on function public.get_session_conversation_dispatch_health_v2()
  from public, anon, authenticated;
grant execute on function public.process_pending_session_conversation_events_v2(integer)
  to service_role;
grant execute on function public.dispatch_session_conversation_events_v2(integer)
  to service_role;
grant execute on function public.get_session_conversation_dispatch_health_v2()
  to service_role;

comment on table private.session_conversation_event_failures_v2 is
  'Retry and backoff state for Session V2 events consumed by Conversation V2.';
comment on function public.process_pending_session_conversation_events_v2(integer) is
  'Replay-safe Session V2 outbox processing through the canonical Conversation V2 consumer.';
comment on function public.dispatch_session_conversation_events_v2(integer) is
  'Service-role and pg_cron entrypoint for Session V2 Conversation provisioning and reconciliation.';
comment on function public.get_session_conversation_dispatch_health_v2() is
  'Service-role health projection for Session V2 Conversation dispatch lag, failures, cron, and projection state.';
