-- Mission 4 consumes authoritative player suspension/resume events without
-- changing lifecycle semantics. Persisted notifications remain durable; only
-- attention delivery and authenticated presentation are suppressed.

create table private.home_lifecycle_projection_watermarks_v1 (
  player_id uuid primary key,
  profile_id uuid not null,
  lifecycle_state text not null
    check (lifecycle_state in ('suspended', 'active')),
  lifecycle_version bigint not null check (lifecycle_version > 0),
  reason_code text not null,
  source_event_id uuid not null unique,
  occurred_at timestamptz not null,
  invalidated_at timestamptz not null default now()
);

alter function private.consume_return_loop_event_v1(jsonb)
  rename to consume_return_loop_event_without_suspension_v1;

create or replace function private.consume_return_loop_suspension_event_v1(
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := (p_event ->> 'eventId')::uuid;
  event_type text := p_event ->> 'eventType';
  event_data jsonb := p_event -> 'data';
  event_account_id uuid := (event_data ->> 'accountId')::uuid;
  event_player_id uuid := (event_data ->> 'playerId')::uuid;
  event_profile_id uuid := (event_data ->> 'profileId')::uuid;
  event_lifecycle_version bigint := (event_data ->> 'lifecycleVersion')::bigint;
  event_reason_code text := event_data ->> 'reasonCode';
  event_occurred_at timestamptz := (p_event ->> 'occurredAt')::timestamptz;
  expected_state text := case
    when event_type = 'player.suspended.v1' then 'suspended'
    when event_type = 'player.resumed.v1' then 'active'
    else null
  end;
  snapshot private.return_loop_player_snapshot_v1;
  existing private.home_lifecycle_projection_watermarks_v1%rowtype;
  affected integer;
begin
  if event_id is null
    or expected_state is null
    or event_account_id is null
    or event_player_id is null
    or event_profile_id is null
    or event_lifecycle_version is null
    or event_reason_code is null
    or event_occurred_at is null
    or (p_event ->> 'aggregateId')::uuid is distinct from event_player_id
  then
    raise exception 'Invalid suspension lifecycle event'
      using errcode = '22023', detail = 'contract_validation_failed';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(
    event_account_id,
    false
  );
  if snapshot.player_id is distinct from event_player_id
    or snapshot.profile_id is distinct from event_profile_id
    or snapshot.lifecycle_version < event_lifecycle_version
  then
    raise exception 'Suspension event provider seams are inconsistent'
      using errcode = '22023', detail = 'provider_contract_violation';
  end if;

  -- A later authoritative transition already exists. The delayed event is
  -- acknowledged but must not regress attention state.
  if snapshot.lifecycle_version > event_lifecycle_version then
    return jsonb_build_object(
      'eventId', event_id,
      'processed', true,
      'repeated', false,
      'stale', true
    );
  end if;
  if snapshot.state is distinct from expected_state then
    raise exception 'Suspension event state disagrees with lifecycle authority'
      using errcode = '22023', detail = 'provider_contract_violation';
  end if;

  insert into private.home_lifecycle_projection_watermarks_v1 (
    player_id,
    profile_id,
    lifecycle_state,
    lifecycle_version,
    reason_code,
    source_event_id,
    occurred_at,
    invalidated_at
  ) values (
    event_player_id,
    event_profile_id,
    expected_state,
    event_lifecycle_version,
    event_reason_code,
    event_id,
    event_occurred_at,
    now()
  )
  on conflict (player_id) do update
    set profile_id = excluded.profile_id,
        lifecycle_state = excluded.lifecycle_state,
        lifecycle_version = excluded.lifecycle_version,
        reason_code = excluded.reason_code,
        source_event_id = excluded.source_event_id,
        occurred_at = excluded.occurred_at,
        invalidated_at = now()
    where private.home_lifecycle_projection_watermarks_v1.lifecycle_version
      < excluded.lifecycle_version;

  get diagnostics affected = row_count;
  if affected = 0 then
    select * into existing
    from private.home_lifecycle_projection_watermarks_v1 as watermark
    where watermark.player_id = event_player_id;

    if existing.lifecycle_version = event_lifecycle_version
      and existing.source_event_id is distinct from event_id
    then
      raise exception 'Lifecycle version was reused by a different event'
        using errcode = '23505', detail = 'source_event_conflict';
    end if;
    return jsonb_build_object(
      'eventId', event_id,
      'processed', true,
      'repeated', true
    );
  end if;

  -- Presence is ephemeral. Resume requires a fresh active session heartbeat and
  -- push registration; old devices and jobs are never silently re-enabled.
  delete from private.notification_presence_v1 as presence
  where presence.player_id = event_player_id;

  update private.home_conversation_projection_v1 as projection
  set updated_at = now()
  where projection.player_id = event_player_id
    or projection.participant_player_id = event_player_id;

  if expected_state = 'suspended' then
    update private.push_devices_v1 as device
    set enabled = false,
        disabled_at = coalesce(device.disabled_at, now())
    where device.player_id = event_player_id
      and device.enabled;

    update private.notification_push_jobs_v1 as job
    set status = 'suppressed',
        completed_at = coalesce(job.completed_at, now()),
        claimed_at = null,
        last_error = 'recipient_lifecycle_suspended'
    where job.recipient_player_id = event_player_id
      and job.status in ('pending', 'processing');
  end if;

  return jsonb_build_object(
    'eventId', event_id,
    'processed', true,
    'repeated', false,
    'stale', false
  );
end;
$$;

create or replace function private.consume_return_loop_event_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := (p_event ->> 'eventId')::uuid;
  event_type text := p_event ->> 'eventType';
  config private.return_loop_config_v1%rowtype;
  result jsonb;
begin
  if event_type not in ('player.suspended.v1', 'player.resumed.v1') then
    result := private.consume_return_loop_event_without_suspension_v1(p_event);
    if event_type = 'player.deleted.v1'
      and coalesce((result ->> 'processed')::boolean, false)
    then
      delete from private.notification_presence_v1
      where player_id = (p_event -> 'data' ->> 'playerId')::uuid;
      delete from private.home_lifecycle_projection_watermarks_v1
      where player_id = (p_event -> 'data' ->> 'playerId')::uuid;
    end if;
    return result;
  end if;

  if event_id is null then
    raise exception 'Invalid CoreEventV1 envelope'
      using errcode = '22023', detail = 'contract_validation_failed';
  end if;
  select * into config
  from private.return_loop_config_v1
  where singleton;
  if not config.event_consumer_enabled then
    return jsonb_build_object(
      'eventId', event_id,
      'processed', false,
      'reason', 'event_consumer_disabled'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(event_id::text, 0));
  if exists (
    select 1
    from private.return_loop_processed_events_v1 as processed
    where processed.event_id = consume_return_loop_event_v1.event_id
  ) then
    return jsonb_build_object(
      'eventId', event_id,
      'processed', true,
      'repeated', true
    );
  end if;

  result := private.consume_return_loop_suspension_event_v1(p_event);
  insert into private.return_loop_processed_events_v1 (
    event_id,
    event_type,
    occurred_at
  ) values (
    event_id,
    event_type,
    (p_event ->> 'occurredAt')::timestamptz
  );
  return result;
end;
$$;


-- Replace the outbox claimer so authoritative resume events cannot remain pending.
create or replace function public.claim_return_loop_events_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_events jsonb;
begin
  if p_limit not between 1 and 500 then
    raise exception 'Invalid event claim size'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  with candidates as (
    select event.id
    from private.outbox_events as event
    where event.status = 'pending'
      and event.available_at <= now()
      and event.contract_version = 1
      and event.event_type in (
        'player.activated.v1',
        'player.profile_updated.v1',
        'player.suspended.v1',
        'player.resumed.v1',
        'player.deletion_requested.v1',
        'player.deleted.v1',
        'match.created.v1',
        'notification.requested.v1',
        'conversation.created.v1',
        'message.sent.v1',
        'conversation.read_advanced.v1'
      )
    order by event.available_at, event.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.outbox_events as event
    set status = 'processing',
        attempt_count = event.attempt_count + 1,
        last_error = null
    from candidates
    where event.id = candidates.id
    returning event.id, event.payload, event.attempt_count
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'outboxId', claimed.id,
    'event', claimed.payload,
    'attempt', claimed.attempt_count
  ) order by claimed.id), '[]'::jsonb)
  into claimed_events
  from claimed;

  return claimed_events;
end;
$$;

create or replace function private.require_active_return_loop_player_v1()
returns private.return_loop_player_snapshot_v1
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;
  snapshot := private.require_return_loop_player_snapshot_by_account_v1(
    account_id,
    false
  );
  if snapshot.state <> 'active' then
    raise exception 'Player lifecycle does not allow this attention surface'
      using errcode = '42501', detail = 'player_unavailable';
  end if;
  return snapshot;
end;
$$;

alter function public.get_home_dashboard_v1()
  rename to get_home_dashboard_without_lifecycle_guard_v1;

create or replace function public.get_home_dashboard_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;
  snapshot := private.require_return_loop_player_snapshot_by_account_v1(
    account_id,
    false
  );
  if snapshot.state = 'active' then
    return public.get_home_dashboard_without_lifecycle_guard_v1();
  end if;
  return jsonb_build_object(
    'playerLifecycle', jsonb_build_object(
      'playerId', snapshot.player_id,
      'profileId', snapshot.profile_id,
      'state', snapshot.state,
      'discoverable', snapshot.discoverable,
      'messagingAllowed', snapshot.messaging_allowed,
      'version', snapshot.lifecycle_version,
      'updatedAt', snapshot.updated_at
    ),
    'activeMatchIntent', null,
    'recentMatches', '[]'::jsonb,
    'conversations', '[]'::jsonb,
    'notificationSummary', jsonb_build_object('unseenCount', 0),
    'capabilities', jsonb_build_object(
      'canDiscover', false,
      'canMessage', false
    ),
    'generatedAt', now()
  );
end;
$$;

alter function public.get_notification_summary_v1()
  rename to get_notification_summary_without_lifecycle_guard_v1;
alter function public.list_notifications_v1(text, integer)
  rename to list_notifications_without_lifecycle_guard_v1;
alter function public.mark_notifications_seen_through_v1(uuid)
  rename to mark_notifications_seen_through_without_lifecycle_guard_v1;
alter function public.mark_notification_read_v1(uuid)
  rename to mark_notification_read_without_lifecycle_guard_v1;

create or replace function public.get_notification_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_return_loop_player_v1();
  return public.get_notification_summary_without_lifecycle_guard_v1();
end;
$$;

create or replace function public.list_notifications_v1(
  p_cursor text default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_return_loop_player_v1();
  return public.list_notifications_without_lifecycle_guard_v1(
    p_cursor,
    p_limit
  );
end;
$$;

create or replace function public.mark_notifications_seen_through_v1(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_return_loop_player_v1();
  return public.mark_notifications_seen_through_without_lifecycle_guard_v1(
    p_notification_id
  );
end;
$$;

create or replace function public.mark_notification_read_v1(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_return_loop_player_v1();
  return public.mark_notification_read_without_lifecycle_guard_v1(
    p_notification_id
  );
end;
$$;

revoke all on function private.consume_return_loop_event_v1(jsonb)
  from public, anon, authenticated;
revoke all on function private.consume_return_loop_event_without_suspension_v1(jsonb)
  from public, anon, authenticated;
revoke all on function private.consume_return_loop_suspension_event_v1(jsonb)
  from public, anon, authenticated;
revoke all on function private.require_active_return_loop_player_v1()
  from public, anon, authenticated;
revoke all on function public.get_home_dashboard_without_lifecycle_guard_v1()
  from public, anon, authenticated;
revoke all on function public.get_notification_summary_without_lifecycle_guard_v1()
  from public, anon, authenticated;
revoke all on function public.list_notifications_without_lifecycle_guard_v1(text, integer)
  from public, anon, authenticated;
revoke all on function public.mark_notifications_seen_through_without_lifecycle_guard_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.mark_notification_read_without_lifecycle_guard_v1(uuid)
  from public, anon, authenticated;

revoke all on function public.get_home_dashboard_v1() from public, anon;
revoke all on function public.get_notification_summary_v1() from public, anon;
revoke all on function public.list_notifications_v1(text, integer) from public, anon;
revoke all on function public.mark_notifications_seen_through_v1(uuid) from public, anon;
revoke all on function public.mark_notification_read_v1(uuid) from public, anon;

grant execute on function private.consume_return_loop_event_v1(jsonb)
  to service_role;
grant execute on function public.get_home_dashboard_v1() to authenticated;
grant execute on function public.get_notification_summary_v1() to authenticated;
grant execute on function public.list_notifications_v1(text, integer)
  to authenticated;
grant execute on function public.mark_notifications_seen_through_v1(uuid)
  to authenticated;
grant execute on function public.mark_notification_read_v1(uuid)
  to authenticated;

revoke all on function public.claim_return_loop_events_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_return_loop_events_v1(integer)
  to service_role;
