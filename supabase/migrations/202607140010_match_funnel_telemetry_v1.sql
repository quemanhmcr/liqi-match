-- Operational telemetry for Production Match Loop v1.
-- Events are append-only projections of authoritative state transitions. They
-- never decide lifecycle, relationship, Match, conversation, or notification
-- semantics.

create table private.match_funnel_events_v1 (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in (
    'match_intent_activated',
    'discovery_snapshot_created',
    'player_liked',
    'player_passed',
    'match_created',
    'conversation_ready'
  )),
  player_id uuid references public.players(id) on delete set null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null default 1 check (aggregate_version > 0),
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (event_name, aggregate_id, aggregate_version)
);

create index match_funnel_events_name_time_v1_idx
  on private.match_funnel_events_v1 (event_name, occurred_at desc);
create index match_funnel_events_player_time_v1_idx
  on private.match_funnel_events_v1 (player_id, occurred_at desc)
  where player_id is not null;

create or replace function private.capture_match_intent_funnel_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = 'active'
    and (
      tg_op = 'INSERT'
      or old.state is distinct from new.state
      or old.version is distinct from new.version
    )
  then
    insert into private.match_funnel_events_v1 (
      event_name,
      player_id,
      aggregate_type,
      aggregate_id,
      aggregate_version,
      metadata
    ) values (
      'match_intent_activated',
      new.player_id,
      'match_intent',
      new.id,
      new.version,
      jsonb_build_object(
        'intentKind', new.filters ->> 'intentKind',
        'mode', new.filters ->> 'mode'
      )
    )
    on conflict (event_name, aggregate_id, aggregate_version) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.capture_discovery_snapshot_funnel_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.match_funnel_events_v1 (
    event_name,
    player_id,
    aggregate_type,
    aggregate_id,
    aggregate_version,
    metadata
  ) values (
    'discovery_snapshot_created',
    new.viewer_player_id,
    'discovery_snapshot',
    new.id,
    new.intent_version,
    jsonb_build_object('candidateCount', new.total_candidates)
  )
  on conflict (event_name, aggregate_id, aggregate_version) do nothing;
  return new;
end;
$$;

create or replace function private.capture_relationship_funnel_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.match_funnel_events_v1 (
    event_name,
    player_id,
    aggregate_type,
    aggregate_id,
    aggregate_version,
    metadata
  ) values (
    case new.decision
      when 'like' then 'player_liked'
      else 'player_passed'
    end,
    new.actor_player_id,
    'relationship',
    new.id,
    new.version,
    jsonb_build_object('targetPlayerId', new.target_player_id)
  )
  on conflict (event_name, aggregate_id, aggregate_version) do nothing;
  return new;
end;
$$;

create or replace function private.capture_match_funnel_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.player_low_id is not null
    and new.player_high_id is not null
    and (
      tg_op = 'INSERT'
      or old.player_low_id is null
      or old.player_high_id is null
    )
  then
    insert into private.match_funnel_events_v1 (
      event_name,
      aggregate_type,
      aggregate_id,
      correlation_id,
      metadata
    ) values (
      'match_created',
      'match',
      new.id,
      new.correlation_id_v1,
      jsonb_build_object(
        'participantIds', jsonb_build_array(
          new.player_low_id,
          new.player_high_id
        ),
        'source', new.source_v1
      )
    )
    on conflict (event_name, aggregate_id, aggregate_version) do nothing;
  end if;

  if new.home_status_v1 = 'conversation_ready'
    and (
      tg_op = 'INSERT'
      or old.home_status_v1 is distinct from new.home_status_v1
    )
  then
    insert into private.match_funnel_events_v1 (
      event_name,
      aggregate_type,
      aggregate_id,
      correlation_id
    ) values (
      'conversation_ready',
      'match',
      new.id,
      new.correlation_id_v1
    )
    on conflict (event_name, aggregate_id, aggregate_version) do nothing;
  end if;

  return new;
end;
$$;

create trigger match_intents_v1_capture_funnel
after insert or update on public.match_intents_v1
for each row execute function private.capture_match_intent_funnel_v1();

create trigger discovery_snapshots_v1_capture_funnel
after update of total_candidates on private.discovery_snapshots_v1
for each row execute function private.capture_discovery_snapshot_funnel_v1();

create trigger relationship_decisions_v1_capture_funnel
after insert or update on public.relationship_decisions_v1
for each row execute function private.capture_relationship_funnel_v1();

create trigger matches_capture_funnel_v1
after insert or update on public.matches
for each row execute function private.capture_match_funnel_v1();

create or replace function public.get_match_funnel_metrics_v1(
  p_window_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  window_started_at timestamptz;
  counts jsonb;
  like_command_p95_ms numeric;
  pending_match_events integer;
  pending_bootstrap_events integer;
  oldest_pending_seconds numeric;
begin
  if p_window_minutes is null
    or p_window_minutes < 1
    or p_window_minutes > 10080
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Metrics window must be between 1 minute and 7 days.'
    );
  end if;

  window_started_at := now() - make_interval(mins => p_window_minutes);

  select coalesce(jsonb_object_agg(event_name, event_count), '{}'::jsonb)
  into counts
  from (
    select event_name, count(*)::integer as event_count
    from private.match_funnel_events_v1
    where occurred_at >= window_started_at
    group by event_name
  ) grouped;

  select round(
    percentile_cont(0.95) within group (
      order by extract(epoch from (completed_at - created_at)) * 1000
    )::numeric,
    2
  )
  into like_command_p95_ms
  from private.command_receipts_v1
  where command_name = 'record_player_decision_v1'
    and completed_at is not null
    and created_at >= window_started_at;

  select
    count(*) filter (
      where event_type = 'match.created.v1'
        and status::text = 'pending'
    )::integer,
    count(*) filter (
      where event_type = 'conversation.bootstrap_requested.v1'
        and status::text = 'pending'
    )::integer,
    round(
      coalesce(
        max(
          extract(epoch from (now() - created_at))
        ) filter (
          where event_type in (
            'match.created.v1',
            'conversation.bootstrap_requested.v1'
          )
            and status::text = 'pending'
        ),
        0
      )::numeric,
      2
    )
  into pending_match_events, pending_bootstrap_events, oldest_pending_seconds
  from private.outbox_events
  where created_at >= window_started_at;

  return jsonb_build_object(
    'windowMinutes', p_window_minutes,
    'windowStartedAt', window_started_at,
    'generatedAt', now(),
    'funnelCounts', counts,
    'likeCommandP95Ms', like_command_p95_ms,
    'outbox', jsonb_build_object(
      'pendingMatchCreated', pending_match_events,
      'pendingConversationBootstrap', pending_bootstrap_events,
      'oldestPendingSeconds', oldest_pending_seconds
    )
  );
end;
$$;

revoke all on table private.match_funnel_events_v1
  from public, anon, authenticated;
grant select on table private.match_funnel_events_v1 to service_role;

revoke execute on function private.capture_match_intent_funnel_v1()
  from public, anon, authenticated;
revoke execute on function private.capture_discovery_snapshot_funnel_v1()
  from public, anon, authenticated;
revoke execute on function private.capture_relationship_funnel_v1()
  from public, anon, authenticated;
revoke execute on function private.capture_match_funnel_v1()
  from public, anon, authenticated;
revoke execute on function public.get_match_funnel_metrics_v1(integer)
  from public, anon, authenticated;
grant execute on function public.get_match_funnel_metrics_v1(integer)
  to service_role;
