-- Push Delivery & Foreground Presence v1
--
-- Notification persistence is authoritative and precedes this transport layer.
-- Foreground suppression is evaluated at claim time from recipient presence,
-- never inside message persistence or notification creation.

create type private.notification_presence_state_v1 as enum (
  'foreground',
  'background'
);

create type private.notification_push_delivery_status_v1 as enum (
  'ticket_pending',
  'ticket_ok',
  'ticket_error',
  'receipt_ok',
  'receipt_error'
);

create table private.notification_presence_v1 (
  account_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null,
  device_installation_id text not null,
  state private.notification_presence_state_v1 not null,
  active_conversation_id uuid,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (account_id, device_installation_id),
  foreign key (account_id, device_installation_id)
    references private.push_devices_v1(account_id, device_installation_id)
    on delete cascade
);

create index notification_presence_v1_active_conversation_idx
  on private.notification_presence_v1 (
    player_id,
    active_conversation_id,
    expires_at
  )
  where state = 'foreground' and active_conversation_id is not null;

create table private.notification_push_deliveries_v1 (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.notification_push_jobs_v1(id) on delete cascade,
  device_id uuid not null references private.push_devices_v1(id) on delete cascade,
  status private.notification_push_delivery_status_v1 not null default 'ticket_pending',
  ticket_id text,
  ticket_error_code text,
  ticket_message text,
  receipt_error_code text,
  receipt_message text,
  receipt_available_at timestamptz,
  receipt_claimed_at timestamptz,
  receipt_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, device_id),
  unique (ticket_id)
);

create index notification_push_deliveries_v1_receipt_claim_idx
  on private.notification_push_deliveries_v1 (
    status,
    receipt_available_at,
    created_at
  )
  where status = 'ticket_ok' and receipt_checked_at is null;

create trigger notification_presence_v1_set_updated_at
before update on private.notification_presence_v1
for each row execute function public.set_updated_at();

create trigger notification_push_deliveries_v1_set_updated_at
before update on private.notification_push_deliveries_v1
for each row execute function public.set_updated_at();

create or replace function public.upsert_notification_presence_v1(
  p_device_installation_id text,
  p_state text,
  p_active_conversation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.return_loop_player_snapshot_v1;
  device private.push_devices_v1%rowtype;
  conversation_allowed boolean;
  presence_expires_at timestamptz;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;
  if p_state not in ('foreground', 'background') then
    raise exception 'Invalid notification presence state'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  actor_snapshot := private.require_return_loop_player_snapshot_by_account_v1(
    actor_account_id,
    false
  );

  select registered.* into device
  from private.push_devices_v1 as registered
  where registered.account_id = actor_account_id
    and registered.device_installation_id = p_device_installation_id
    and registered.enabled;

  if device.id is null then
    raise exception 'Push device is not registered for this account'
      using errcode = 'P0002', detail = 'push_device_not_found';
  end if;

  if p_state = 'foreground' and p_active_conversation_id is not null then
    select exists (
      select 1
      from private.home_conversation_projection_v1 as projection
      where projection.player_id = actor_snapshot.player_id
        and projection.conversation_id = p_active_conversation_id
    ) into conversation_allowed;

    if not conversation_allowed then
      raise exception 'Conversation presence is not authorized'
        using errcode = '42501', detail = 'conversation_forbidden';
    end if;
  end if;

  presence_expires_at := case
    when p_state = 'foreground' then now() + interval '90 seconds'
    else now()
  end;

  insert into private.notification_presence_v1 (
    account_id,
    player_id,
    device_installation_id,
    state,
    active_conversation_id,
    expires_at
  ) values (
    actor_account_id,
    actor_snapshot.player_id,
    p_device_installation_id,
    p_state::private.notification_presence_state_v1,
    case when p_state = 'foreground' then p_active_conversation_id else null end,
    presence_expires_at
  )
  on conflict (account_id, device_installation_id) do update
    set player_id = excluded.player_id,
        state = excluded.state,
        active_conversation_id = excluded.active_conversation_id,
        expires_at = excluded.expires_at,
        updated_at = now();

  return jsonb_build_object(
    'deviceInstallationId', p_device_installation_id,
    'playerId', actor_snapshot.player_id,
    'state', p_state,
    'activeConversationId', case
      when p_state = 'foreground' then p_active_conversation_id
      else null
    end,
    'expiresAt', presence_expires_at
  );
end;
$$;

create or replace function public.claim_notification_push_jobs_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  push_enabled boolean;
  jobs jsonb;
begin
  if p_limit not between 1 and 500 then
    raise exception 'Invalid push claim size'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  select config.push_enabled into push_enabled
  from private.return_loop_config_v1 as config
  where config.singleton;

  if not push_enabled then return '[]'::jsonb; end if;

  update private.notification_push_jobs_v1
  set status = 'suppressed',
      completed_at = now(),
      last_error = 'push_delivery_expired'
  where status = 'pending'
    and expires_at <= now();

  update private.notification_push_jobs_v1 as job
  set status = 'suppressed',
      completed_at = now(),
      last_error = 'foreground_conversation_suppressed'
  from public.notifications_v1 as notification
  where job.notification_id = notification.id
    and job.status = 'pending'
    and notification.kind = 'message_received'
    and notification.deep_link ->> 'target' = 'conversation'
    and exists (
      select 1
      from private.notification_presence_v1 as presence
      where presence.player_id = job.recipient_player_id
        and presence.state = 'foreground'
        and presence.expires_at > now()
        and presence.active_conversation_id =
          (notification.deep_link ->> 'conversationId')::uuid
    );

  with candidates as (
    select job.id
    from private.notification_push_jobs_v1 as job
    where job.status = 'pending'
      and job.available_at <= now()
      and job.expires_at > now()
      and exists (
        select 1
        from private.push_devices_v1 as device
        where device.player_id = job.recipient_player_id
          and device.enabled
          and private.return_loop_feature_enabled_v1('push', device.account_id)
      )
    order by job.available_at, job.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.notification_push_jobs_v1 as job
    set status = 'processing',
        attempt_count = job.attempt_count + 1,
        claimed_at = now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId', claimed.id,
    'notificationId', notification.id,
    'sourceEventId', notification.source_event_id,
    'recipientPlayerId', claimed.recipient_player_id,
    'kind', notification.kind,
    'title', notification.title,
    'body', notification.body,
    'deepLink', notification.deep_link,
    'tokens', coalesce((
      select jsonb_agg(device.expo_push_token order by device.created_at)
      from private.push_devices_v1 as device
      where device.player_id = claimed.recipient_player_id
        and device.enabled
        and private.return_loop_feature_enabled_v1('push', device.account_id)
    ), '[]'::jsonb),
    'attempt', claimed.attempt_count
  ) order by claimed.created_at), '[]'::jsonb)
  into jobs
  from claimed
  join public.notifications_v1 as notification
    on notification.id = claimed.notification_id;

  return jobs;
end;
$$;

create or replace function public.record_notification_push_tickets_v1(
  p_job_id uuid,
  p_tickets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.notification_push_jobs_v1%rowtype;
  ticket jsonb;
  device private.push_devices_v1%rowtype;
  ok_count integer := 0;
  error_count integer := 0;
begin
  if jsonb_typeof(p_tickets) <> 'array' or jsonb_array_length(p_tickets) = 0 then
    raise exception 'Push tickets must be a non-empty array'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  select * into job
  from private.notification_push_jobs_v1
  where id = p_job_id
    and status = 'processing'
  for update;

  if job.id is null then
    raise exception 'Push job is not processing'
      using errcode = 'P0002', detail = 'push_job_not_processing';
  end if;

  for ticket in select value from jsonb_array_elements(p_tickets)
  loop
    select registered.* into device
    from private.push_devices_v1 as registered
    where registered.player_id = job.recipient_player_id
      and registered.expo_push_token = ticket ->> 'token';

    if device.id is null then
      raise exception 'Push ticket references an unknown recipient device'
        using errcode = '22023', detail = 'push_device_mismatch';
    end if;

    insert into private.notification_push_deliveries_v1 (
      job_id,
      device_id,
      status,
      ticket_id,
      ticket_error_code,
      ticket_message,
      receipt_available_at
    ) values (
      job.id,
      device.id,
      case
        when ticket ->> 'status' = 'ok'
          then 'ticket_ok'::private.notification_push_delivery_status_v1
        else 'ticket_error'::private.notification_push_delivery_status_v1
      end,
      nullif(ticket ->> 'ticketId', ''),
      nullif(ticket ->> 'errorCode', ''),
      nullif(ticket ->> 'message', ''),
      case
        when ticket ->> 'status' = 'ok' then now() + interval '15 minutes'
        else null
      end
    )
    on conflict (job_id, device_id) do update
      set status = excluded.status,
          ticket_id = excluded.ticket_id,
          ticket_error_code = excluded.ticket_error_code,
          ticket_message = excluded.ticket_message,
          receipt_available_at = excluded.receipt_available_at,
          receipt_claimed_at = null,
          receipt_checked_at = null,
          updated_at = now();

    if ticket ->> 'status' = 'ok' then
      ok_count := ok_count + 1;
    else
      error_count := error_count + 1;
      if ticket ->> 'errorCode' = 'DeviceNotRegistered' then
        update private.push_devices_v1
        set enabled = false,
            disabled_at = coalesce(disabled_at, now())
        where id = device.id;
      end if;
    end if;
  end loop;

  update private.notification_push_jobs_v1
  set status = case
        when ok_count > 0 then 'delivered'::private.notification_push_status_v1
        else 'failed'::private.notification_push_status_v1
      end,
      completed_at = now(),
      provider_ticket_id = (
        select delivery.ticket_id
        from private.notification_push_deliveries_v1 as delivery
        where delivery.job_id = job.id
          and delivery.ticket_id is not null
        order by delivery.created_at
        limit 1
      ),
      provider_receipt = p_tickets,
      last_error = case
        when ok_count > 0 then null
        else 'expo_push_ticket_error'
      end
  where id = job.id;

  return jsonb_build_object(
    'jobId', job.id,
    'acceptedCount', ok_count,
    'errorCount', error_count
  );
end;
$$;

create or replace function public.claim_notification_push_receipts_v1(
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipts jsonb;
begin
  if p_limit not between 1 and 1000 then
    raise exception 'Invalid receipt claim size'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  with candidates as (
    select delivery.id
    from private.notification_push_deliveries_v1 as delivery
    where delivery.status = 'ticket_ok'
      and delivery.ticket_id is not null
      and delivery.receipt_checked_at is null
      and delivery.receipt_available_at <= now()
      and (
        delivery.receipt_claimed_at is null
        or delivery.receipt_claimed_at < now() - interval '5 minutes'
      )
    order by delivery.receipt_available_at, delivery.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.notification_push_deliveries_v1 as delivery
    set receipt_claimed_at = now()
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.ticket_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId', claimed.id,
    'ticketId', claimed.ticket_id
  )), '[]'::jsonb)
  into receipts
  from claimed;

  return receipts;
end;
$$;

create or replace function public.record_notification_push_receipts_v1(
  p_receipts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt jsonb;
  delivery private.notification_push_deliveries_v1%rowtype;
  ok_count integer := 0;
  error_count integer := 0;
begin
  if jsonb_typeof(p_receipts) <> 'array' then
    raise exception 'Push receipts must be an array'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  for receipt in select value from jsonb_array_elements(p_receipts)
  loop
    select * into delivery
    from private.notification_push_deliveries_v1
    where id = (receipt ->> 'deliveryId')::uuid
      and ticket_id = receipt ->> 'ticketId'
      and status = 'ticket_ok'
    for update;

    if delivery.id is null then
      raise exception 'Push receipt does not match a pending delivery'
        using errcode = '22023', detail = 'push_receipt_mismatch';
    end if;

    update private.notification_push_deliveries_v1
    set status = case
          when receipt ->> 'status' = 'ok'
            then 'receipt_ok'::private.notification_push_delivery_status_v1
          else 'receipt_error'::private.notification_push_delivery_status_v1
        end,
        receipt_error_code = nullif(receipt ->> 'errorCode', ''),
        receipt_message = nullif(receipt ->> 'message', ''),
        receipt_claimed_at = null,
        receipt_checked_at = now()
    where id = delivery.id;

    if receipt ->> 'status' = 'ok' then
      ok_count := ok_count + 1;
    else
      error_count := error_count + 1;
      if receipt ->> 'errorCode' = 'DeviceNotRegistered' then
        update private.push_devices_v1
        set enabled = false,
            disabled_at = coalesce(disabled_at, now())
        where id = delivery.device_id;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'deliveredCount', ok_count,
    'errorCount', error_count
  );
end;
$$;

revoke all on table private.notification_presence_v1
  from public, anon, authenticated;
revoke all on table private.notification_push_deliveries_v1
  from public, anon, authenticated;
revoke all on function public.upsert_notification_presence_v1(text, text, uuid)
  from public, anon;
revoke all on function public.claim_notification_push_jobs_v1(integer)
  from public, anon, authenticated;
revoke all on function public.record_notification_push_tickets_v1(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_notification_push_receipts_v1(integer)
  from public, anon, authenticated;
revoke all on function public.record_notification_push_receipts_v1(jsonb)
  from public, anon, authenticated;

grant execute on function public.upsert_notification_presence_v1(text, text, uuid)
  to authenticated;
grant execute on function public.claim_notification_push_jobs_v1(integer)
  to service_role;
grant execute on function public.record_notification_push_tickets_v1(uuid, jsonb)
  to service_role;
grant execute on function public.claim_notification_push_receipts_v1(integer)
  to service_role;
grant execute on function public.record_notification_push_receipts_v1(jsonb)
  to service_role;
