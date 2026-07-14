-- Return Loop Authority v1
--
-- Mission 4 owns persisted notification attention, Home projections, push
-- delivery state and rollout controls. Producer domain commands remain isolated:
-- they only append versioned outbox events. This consumer is replayable and
-- never participates in the producer transaction.

create type public.notification_kind_v1 as enum (
  'match_created',
  'message_received',
  'set_invite',
  'join_request',
  'system'
);

create type private.notification_push_status_v1 as enum (
  'pending',
  'processing',
  'suppressed',
  'delivered',
  'failed'
);

create type private.return_loop_player_snapshot_v1 as (
  account_id uuid,
  player_id uuid,
  profile_id uuid,
  state text,
  discoverable boolean,
  messaging_allowed boolean,
  profile_version integer,
  lifecycle_version integer,
  updated_at timestamptz
);

create table private.return_loop_config_v1 (
  singleton boolean primary key default true check (singleton),
  event_consumer_enabled boolean not null default false,
  home_reads_enabled boolean not null default false,
  notification_inbox_enabled boolean not null default false,
  push_enabled boolean not null default false,
  deep_links_enabled boolean not null default false,
  minimal_safe_dashboard_enabled boolean not null default true,
  home_rollout_percent smallint not null default 0 check (home_rollout_percent between 0 and 100),
  inbox_rollout_percent smallint not null default 0 check (inbox_rollout_percent between 0 and 100),
  push_rollout_percent smallint not null default 0 check (push_rollout_percent between 0 and 100),
  deep_link_rollout_percent smallint not null default 0 check (deep_link_rollout_percent between 0 and 100),
  cohort_salt text not null default 'return-loop-v1' check (char_length(cohort_salt) between 8 and 120),
  updated_at timestamptz not null default now()
);

insert into private.return_loop_config_v1 (singleton)
values (true)
on conflict (singleton) do nothing;

create table public.notifications_v1 (
  id uuid primary key default gen_random_uuid(),
  recipient_player_id uuid not null,
  kind public.notification_kind_v1 not null,
  source_event_id uuid not null unique,
  occurred_at timestamptz not null,
  seen_at timestamptz,
  read_at timestamptz,
  deep_link jsonb not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 240),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (read_at is null or seen_at is not null),
  check (read_at is null or read_at >= seen_at),
  check (
    (deep_link ->> 'target' = 'match' and deep_link ? 'matchId')
    or (deep_link ->> 'target' = 'conversation' and deep_link ? 'conversationId')
    or (deep_link ->> 'target' = 'set' and deep_link ? 'setId')
    or (deep_link ->> 'target' = 'profile' and deep_link ? 'playerId')
  )
);

create index notifications_v1_recipient_occurred_idx
  on public.notifications_v1 (recipient_player_id, occurred_at desc, id desc);
create index notifications_v1_recipient_unseen_idx
  on public.notifications_v1 (recipient_player_id, occurred_at desc)
  where seen_at is null;

create table private.notification_push_jobs_v1 (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications_v1(id) on delete cascade,
  recipient_player_id uuid not null,
  foreground_policy text not null default 'allow_push'
    check (foreground_policy in ('allow_push', 'suppress_push')),
  status private.notification_push_status_v1 not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  claimed_at timestamptz,
  completed_at timestamptz,
  provider_ticket_id text,
  provider_receipt jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_push_jobs_v1_claim_idx
  on private.notification_push_jobs_v1 (status, available_at, created_at)
  where status = 'pending';

create table private.notification_delivery_errors_v1 (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications_v1(id) on delete cascade,
  stage text not null,
  error_message text not null,
  created_at timestamptz not null default now()
);

create table private.push_devices_v1 (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null,
  device_installation_id text not null check (char_length(device_installation_id) between 16 and 180),
  expo_push_token text not null unique check (char_length(expo_push_token) between 20 and 240),
  platform text not null check (platform in ('android', 'ios')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, device_installation_id)
);

create index push_devices_v1_player_enabled_idx
  on private.push_devices_v1 (player_id, enabled)
  where enabled;

create table private.home_conversation_projection_v1 (
  player_id uuid not null,
  conversation_id uuid not null,
  match_id uuid,
  participant_player_id uuid,
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 240),
  last_message_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_attention_event_id uuid,
  last_attention_occurred_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (player_id, conversation_id)
);

create index home_conversation_projection_v1_player_recent_idx
  on private.home_conversation_projection_v1 (player_id, last_message_at desc nulls last, updated_at desc);
create unique index home_conversation_projection_v1_player_match_key
  on private.home_conversation_projection_v1 (player_id, match_id)
  where match_id is not null;

create table private.home_profile_projection_watermarks_v1 (
  player_id uuid primary key,
  profile_id uuid not null unique,
  profile_version bigint not null check (profile_version >= 0),
  source_event_id uuid not null unique,
  occurred_at timestamptz not null,
  invalidated_at timestamptz not null default now()
);

create table private.return_loop_processed_events_v1 (
  event_id uuid primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  processed_at timestamptz not null default now()
);

create table private.return_loop_suppressed_events_v1 (
  event_id uuid primary key,
  event_type text not null,
  recipient_player_id uuid,
  reason text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create trigger notification_push_jobs_v1_set_updated_at
before update on private.notification_push_jobs_v1
for each row execute function public.set_updated_at();

create trigger push_devices_v1_set_updated_at
before update on private.push_devices_v1
for each row execute function public.set_updated_at();

create or replace function private.require_return_loop_player_snapshot_by_account_v1(
  p_account_id uuid,
  p_lock boolean default false
)
returns private.return_loop_player_snapshot_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_mapping jsonb;
  lifecycle_snapshot jsonb;
  profile_version jsonb;
  resolved_player_id uuid;
  resolved_profile_id uuid;
  snapshot private.return_loop_player_snapshot_v1;
begin
  identity_mapping := public.resolve_player_identity_v1(p_account_id, p_lock);
  if identity_mapping is null then
    raise exception 'Player identity mapping not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  begin
    resolved_player_id := (identity_mapping ->> 'playerId')::uuid;
    resolved_profile_id := (identity_mapping ->> 'profileId')::uuid;
  exception
    when others then
      raise exception 'Invalid PlayerIdentityMappingV1 payload'
        using errcode = '22023', detail = 'identity_contract_violation';
  end;

  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
    resolved_player_id,
    p_lock
  );
  profile_version := public.get_player_profile_version_v1(
    resolved_profile_id,
    p_lock
  );

  begin
    snapshot := row(
      (identity_mapping ->> 'accountId')::uuid,
      resolved_player_id,
      resolved_profile_id,
      lifecycle_snapshot ->> 'state',
      (lifecycle_snapshot ->> 'discoverable')::boolean,
      (lifecycle_snapshot ->> 'messagingAllowed')::boolean,
      (profile_version ->> 'version')::integer,
      (lifecycle_snapshot ->> 'version')::integer,
      (lifecycle_snapshot ->> 'updatedAt')::timestamptz
    )::private.return_loop_player_snapshot_v1;
  exception
    when others then
      raise exception 'Invalid identity/lifecycle/profile provider payload'
        using errcode = '22023', detail = 'provider_contract_violation';
  end;

  if snapshot.account_id is distinct from p_account_id
    or (lifecycle_snapshot ->> 'playerId')::uuid is distinct from snapshot.player_id
    or (lifecycle_snapshot ->> 'profileId')::uuid is distinct from snapshot.profile_id
    or (profile_version ->> 'profileId')::uuid is distinct from snapshot.profile_id
    or snapshot.state is null
    or snapshot.messaging_allowed is null
  then
    raise exception 'Provider seams returned inconsistent player identity'
      using errcode = '22023', detail = 'provider_contract_violation';
  end if;

  return snapshot;
end;
$$;

create or replace function private.require_return_loop_player_snapshot_by_player_v1(
  p_player_id uuid,
  p_lock boolean default false
)
returns private.return_loop_player_snapshot_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  lifecycle_snapshot jsonb;
  profile_version jsonb;
  resolved_profile_id uuid;
  snapshot private.return_loop_player_snapshot_v1;
begin
  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
    p_player_id,
    p_lock
  );
  if lifecycle_snapshot is null then
    raise exception 'Player lifecycle snapshot not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  begin
    resolved_profile_id := (lifecycle_snapshot ->> 'profileId')::uuid;
  exception
    when others then
      raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
        using errcode = '22023', detail = 'lifecycle_contract_violation';
  end;

  profile_version := public.get_player_profile_version_v1(
    resolved_profile_id,
    p_lock
  );

  begin
    snapshot := row(
      null,
      (lifecycle_snapshot ->> 'playerId')::uuid,
      resolved_profile_id,
      lifecycle_snapshot ->> 'state',
      (lifecycle_snapshot ->> 'discoverable')::boolean,
      (lifecycle_snapshot ->> 'messagingAllowed')::boolean,
      (profile_version ->> 'version')::integer,
      (lifecycle_snapshot ->> 'version')::integer,
      (lifecycle_snapshot ->> 'updatedAt')::timestamptz
    )::private.return_loop_player_snapshot_v1;
  exception
    when others then
      raise exception 'Invalid lifecycle/profile provider payload'
        using errcode = '22023', detail = 'provider_contract_violation';
  end;

  if snapshot.player_id is distinct from p_player_id
    or (profile_version ->> 'profileId')::uuid is distinct from snapshot.profile_id
    or snapshot.state is null
    or snapshot.messaging_allowed is null
  then
    raise exception 'Provider seams returned inconsistent player snapshot'
      using errcode = '22023', detail = 'provider_contract_violation';
  end if;

  return snapshot;
end;
$$;

create or replace function private.current_return_loop_player_id_v1()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then return null; end if;
  return (private.require_return_loop_player_snapshot_by_account_v1(account_id, false)).player_id;
end;
$$;

create or replace function private.return_loop_feature_enabled_v1(
  p_capability text,
  p_account_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config private.return_loop_config_v1%rowtype;
  globally_enabled boolean;
  rollout_percent integer;
  cohort_bucket integer;
begin
  select * into config
  from private.return_loop_config_v1
  where singleton;

  if p_capability = 'home' then
    globally_enabled := config.home_reads_enabled;
    rollout_percent := config.home_rollout_percent;
  elsif p_capability = 'inbox' then
    globally_enabled := config.notification_inbox_enabled;
    rollout_percent := config.inbox_rollout_percent;
  elsif p_capability = 'push' then
    globally_enabled := config.push_enabled;
    rollout_percent := config.push_rollout_percent;
  elsif p_capability = 'deep_link' then
    globally_enabled := config.deep_links_enabled;
    rollout_percent := config.deep_link_rollout_percent;
  else
    raise exception 'Unknown return-loop capability'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  if not globally_enabled or p_account_id is null then return false; end if;
  if rollout_percent = 100 then return true; end if;
  if rollout_percent = 0 then return false; end if;

  cohort_bucket := (
    ('x' || substr(md5(p_account_id::text || ':' || config.cohort_salt), 1, 8))::bit(32)::bigint % 100
  )::integer;
  return cohort_bucket < rollout_percent;
end;
$$;

create or replace function private.notification_to_json_v1(
  p_notification public.notifications_v1
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'notificationId', p_notification.id,
    'recipientPlayerId', p_notification.recipient_player_id,
    'kind', p_notification.kind,
    'sourceEventId', p_notification.source_event_id,
    'occurredAt', p_notification.occurred_at,
    'seenAt', p_notification.seen_at,
    'readAt', p_notification.read_at,
    'deepLink', p_notification.deep_link
  )
$$;

create or replace function private.notification_summary_for_player_v1(
  p_player_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'latestWatermark', (
      select jsonb_build_object(
        'notificationId', latest.id,
        'occurredAt', latest.occurred_at
      )
      from public.notifications_v1 as latest
      where latest.recipient_player_id = p_player_id
      order by latest.occurred_at desc, latest.id desc
      limit 1
    ),
    'unseenCount', (
      select count(*)::integer
      from public.notifications_v1 as unseen
      where unseen.recipient_player_id = p_player_id
        and unseen.seen_at is null
    ),
    'updatedAt', now()
  )
$$;

create or replace function private.home_player_summary_v1(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot private.return_loop_player_snapshot_v1;
  display_name text;
begin
  snapshot := private.require_return_loop_player_snapshot_by_player_v1(p_player_id, false);

  select legacy_profile.display_name into display_name
  from public.player_profiles_v1 as canonical_profile
  join public.profiles as legacy_profile
    on legacy_profile.id = canonical_profile.legacy_profile_id
  where canonical_profile.id = snapshot.profile_id
    and canonical_profile.player_id = snapshot.player_id
    and legacy_profile.deleted_at is null;

  if display_name is null then
    raise exception 'Profile summary is unavailable'
      using errcode = 'P0002', detail = 'profile_not_found';
  end if;

  return jsonb_build_object(
    'playerId', snapshot.player_id,
    'profileId', snapshot.profile_id,
    'displayName', display_name,
    'avatarUrl', null
  );
end;
$$;

create or replace function private.persist_notification_requested_v1(p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := (p_event ->> 'eventId')::uuid;
  occurred_at timestamptz := (p_event ->> 'occurredAt')::timestamptz;
  event_data jsonb := p_event -> 'data';
  target jsonb := event_data -> 'target';
  recipient_player_id uuid := (event_data ->> 'recipientPlayerId')::uuid;
  reason_code text := event_data ->> 'reasonCode';
  recipient_snapshot private.return_loop_player_snapshot_v1;
  notification_kind public.notification_kind_v1;
  deep_link jsonb;
  notification_title text;
  notification_body text;
  foreground_policy text := 'allow_push';
  notification_id uuid;
  existing public.notifications_v1%rowtype;
begin
  recipient_snapshot := private.require_return_loop_player_snapshot_by_player_v1(
    recipient_player_id,
    false
  );

  if recipient_snapshot.state <> 'active' then
    insert into private.return_loop_suppressed_events_v1 (
      event_id,
      event_type,
      recipient_player_id,
      reason,
      occurred_at
    ) values (
      event_id,
      'notification.requested.v1',
      recipient_player_id,
      'recipient_lifecycle_' || recipient_snapshot.state,
      occurred_at
    )
    on conflict (event_id) do nothing;
    return null;
  end if;

  if reason_code = 'match_created' and target ->> 'kind' = 'match' then
    notification_kind := 'match_created';
    deep_link := jsonb_build_object('target', 'match', 'matchId', target ->> 'matchId');
    notification_title := 'Bạn có một match mới';
    notification_body := 'Mở Liqi để xem người chơi vừa match với bạn.';
  elsif reason_code = 'message_received' and target ->> 'kind' = 'conversation' then
    notification_kind := 'message_received';
    deep_link := jsonb_build_object(
      'target', 'conversation',
      'conversationId', target ->> 'conversationId'
    );
    notification_title := 'Bạn có tin nhắn mới';
    notification_body := 'Mở cuộc trò chuyện để tiếp tục kết nối.';
  elsif reason_code = 'set_invite_created' and target ->> 'kind' = 'set_invite' then
    notification_kind := 'set_invite';
    deep_link := jsonb_build_object('target', 'set', 'setId', target ->> 'setId');
    notification_title := 'Bạn có lời mời vào set';
    notification_body := 'Mở Liqi để xem lời mời mới.';
  elsif reason_code = 'set_join_requested' and target ->> 'kind' = 'set_join_request' then
    notification_kind := 'join_request';
    deep_link := jsonb_build_object('target', 'set', 'setId', target ->> 'setId');
    notification_title := 'Có yêu cầu tham gia set';
    notification_body := 'Mở Liqi để xem yêu cầu mới.';
  else
    raise exception 'Unsupported notification.requested.v1 payload'
      using errcode = '22023', detail = 'contract_validation_failed';
  end if;

  insert into public.notifications_v1 (
    recipient_player_id,
    kind,
    source_event_id,
    occurred_at,
    deep_link,
    title,
    body,
    metadata
  ) values (
    recipient_player_id,
    notification_kind,
    event_id,
    occurred_at,
    deep_link,
    notification_title,
    notification_body,
    jsonb_build_object(
      'reasonCode', reason_code,
      'target', target,
      'correlationId', p_event ->> 'correlationId',
      'causationId', p_event ->> 'causationId'
    )
  )
  on conflict (source_event_id) do nothing
  returning id into notification_id;

  if notification_id is null then
    select * into existing
    from public.notifications_v1
    where source_event_id = event_id;

    if existing.recipient_player_id is distinct from recipient_player_id
      or existing.kind is distinct from notification_kind
      or existing.deep_link is distinct from deep_link
      or existing.occurred_at is distinct from occurred_at
    then
      raise exception 'Source event was reused with different notification semantics'
        using errcode = '23505', detail = 'source_event_conflict';
    end if;
    return existing.id;
  end if;

  if notification_kind = 'message_received' then
    insert into private.home_conversation_projection_v1 (
      player_id,
      conversation_id,
      unread_count,
      last_attention_event_id,
      last_attention_occurred_at,
      updated_at
    ) values (
      recipient_player_id,
      (target ->> 'conversationId')::uuid,
      (target ->> 'authoritativeUnreadCount')::integer,
      event_id,
      occurred_at,
      now()
    )
    on conflict (player_id, conversation_id) do update
      set unread_count = excluded.unread_count,
          last_attention_event_id = excluded.last_attention_event_id,
          last_attention_occurred_at = excluded.last_attention_occurred_at,
          updated_at = now()
      where private.home_conversation_projection_v1.last_attention_occurred_at is null
        or private.home_conversation_projection_v1.last_attention_occurred_at <= excluded.last_attention_occurred_at;
  end if;

  begin
    insert into private.notification_push_jobs_v1 (
      notification_id,
      recipient_player_id,
      foreground_policy,
      status
    ) values (
      notification_id,
      recipient_player_id,
      foreground_policy,
      case
        when foreground_policy = 'suppress_push'
          then 'suppressed'::private.notification_push_status_v1
        else 'pending'::private.notification_push_status_v1
      end
    )
    on conflict (notification_id) do nothing;
  exception
    when others then
      insert into private.notification_delivery_errors_v1 (
        notification_id,
        stage,
        error_message
      ) values (
        notification_id,
        'enqueue',
        sqlerrm
      );
  end;

  return notification_id;
end;
$$;

create or replace function private.consume_conversation_ready_v1(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_data jsonb := p_event #> '{data,conversation}';
  projection_receipt jsonb;
  match_id uuid := (conversation_data ->> 'matchId')::uuid;
  conversation_id uuid := (conversation_data ->> 'conversationId')::uuid;
  low_player_id uuid := least(
    (conversation_data #>> '{participantIds,0}')::uuid,
    (conversation_data #>> '{participantIds,1}')::uuid
  );
  high_player_id uuid := greatest(
    (conversation_data #>> '{participantIds,0}')::uuid,
    (conversation_data #>> '{participantIds,1}')::uuid
  );
begin
  projection_receipt := public.apply_conversation_created_to_match_v1(p_event);
  if projection_receipt ->> 'matchId' is distinct from match_id::text
    or projection_receipt ->> 'conversationId' is distinct from conversation_id::text
    or projection_receipt ->> 'homeStatus' is distinct from 'conversation_ready'
  then
    raise exception 'Match conversation projection returned an invalid receipt'
      using errcode = '22023', detail = 'match_projection_contract_violation';
  end if;

  insert into private.home_conversation_projection_v1 (
    player_id,
    conversation_id,
    match_id,
    participant_player_id,
    updated_at
  ) values
    (low_player_id, conversation_id, match_id, high_player_id, now()),
    (high_player_id, conversation_id, match_id, low_player_id, now())
  on conflict (player_id, conversation_id) do update
    set match_id = excluded.match_id,
        participant_player_id = excluded.participant_player_id,
        updated_at = now();
end;
$$;

create or replace function private.consume_message_sent_v1(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_data jsonb := p_event -> 'data';
  message_data jsonb := event_data -> 'message';
  content_data jsonb := message_data -> 'content';
  conversation_id uuid := (message_data ->> 'conversationId')::uuid;
  sender_player_id uuid := (message_data ->> 'senderPlayerId')::uuid;
  message_created_at timestamptz := (message_data ->> 'createdAt')::timestamptz;
  preview text := left(
    case content_data ->> 'kind'
      when 'text' then content_data ->> 'text'
      when 'media' then coalesce(content_data ->> 'caption', 'Đã gửi một tệp đính kèm')
      when 'system' then content_data ->> 'eventType'
      else null
    end,
    240
  );
  recipient_id_text text;
  first_recipient_id uuid;
begin
  for recipient_id_text in
    select jsonb_array_elements_text(coalesce(event_data -> 'recipientPlayerIds', '[]'::jsonb))
  loop
    if first_recipient_id is null then first_recipient_id := recipient_id_text::uuid; end if;

    insert into private.home_conversation_projection_v1 (
      player_id,
      conversation_id,
      participant_player_id,
      last_message_preview,
      last_message_at,
      updated_at
    ) values (
      recipient_id_text::uuid,
      conversation_id,
      sender_player_id,
      preview,
      message_created_at,
      now()
    )
    on conflict (player_id, conversation_id) do update
      set participant_player_id = coalesce(
            private.home_conversation_projection_v1.participant_player_id,
            excluded.participant_player_id
          ),
          last_message_preview = excluded.last_message_preview,
          last_message_at = excluded.last_message_at,
          updated_at = now()
      where private.home_conversation_projection_v1.last_message_at is null
        or private.home_conversation_projection_v1.last_message_at <= excluded.last_message_at;
  end loop;

  if first_recipient_id is not null then
    insert into private.home_conversation_projection_v1 (
      player_id,
      conversation_id,
      participant_player_id,
      last_message_preview,
      last_message_at,
      updated_at
    ) values (
      sender_player_id,
      conversation_id,
      first_recipient_id,
      preview,
      message_created_at,
      now()
    )
    on conflict (player_id, conversation_id) do update
      set participant_player_id = coalesce(
            private.home_conversation_projection_v1.participant_player_id,
            excluded.participant_player_id
          ),
          last_message_preview = excluded.last_message_preview,
          last_message_at = excluded.last_message_at,
          updated_at = now()
      where private.home_conversation_projection_v1.last_message_at is null
        or private.home_conversation_projection_v1.last_message_at <= excluded.last_message_at;
  end if;
end;
$$;

create or replace function private.consume_conversation_read_advanced_v1(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := (p_event ->> 'eventId')::uuid;
  read_state jsonb := p_event #> '{data,readState}';
  read_updated_at timestamptz := (read_state ->> 'updatedAt')::timestamptz;
begin
  insert into private.home_conversation_projection_v1 (
    player_id,
    conversation_id,
    unread_count,
    last_attention_event_id,
    last_attention_occurred_at,
    updated_at
  ) values (
    (read_state ->> 'playerId')::uuid,
    (read_state ->> 'conversationId')::uuid,
    (read_state ->> 'unreadCount')::integer,
    event_id,
    read_updated_at,
    now()
  )
  on conflict (player_id, conversation_id) do update
    set unread_count = excluded.unread_count,
        last_attention_event_id = excluded.last_attention_event_id,
        last_attention_occurred_at = excluded.last_attention_occurred_at,
        updated_at = now()
    where private.home_conversation_projection_v1.last_attention_occurred_at is null
      or private.home_conversation_projection_v1.last_attention_occurred_at <= excluded.last_attention_occurred_at;
end;
$$;

create or replace function private.consume_player_profile_updated_v1(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := (p_event ->> 'eventId')::uuid;
  occurred_at timestamptz := (p_event ->> 'occurredAt')::timestamptz;
  event_data jsonb := p_event -> 'data';
  account_id uuid := (event_data ->> 'accountId')::uuid;
  event_player_id uuid := (event_data ->> 'playerId')::uuid;
  event_profile_id uuid := (event_data ->> 'profileId')::uuid;
  event_lifecycle_version bigint := (event_data ->> 'lifecycleVersion')::bigint;
  event_profile_version bigint := (event_data ->> 'profileVersion')::bigint;
  identity_mapping jsonb;
  lifecycle_snapshot jsonb;
  profile_version_snapshot jsonb;
  affected integer;
begin
  if (p_event ->> 'aggregateId')::uuid is distinct from event_player_id then
    raise exception 'Profile update aggregate identity is inconsistent'
      using errcode = '22023', detail = 'identity_contract_violation';
  end if;

  identity_mapping := public.resolve_player_identity_v1(account_id, false);
  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(event_player_id, false);
  profile_version_snapshot := public.get_player_profile_version_v1(
    event_profile_id,
    false
  );

  if identity_mapping is null
    or lifecycle_snapshot is null
    or profile_version_snapshot is null
    or (identity_mapping ->> 'playerId')::uuid is distinct from event_player_id
    or (identity_mapping ->> 'profileId')::uuid is distinct from event_profile_id
    or (lifecycle_snapshot ->> 'playerId')::uuid is distinct from event_player_id
    or (lifecycle_snapshot ->> 'profileId')::uuid is distinct from event_profile_id
    or (profile_version_snapshot ->> 'profileId')::uuid is distinct from event_profile_id
    or (lifecycle_snapshot ->> 'version')::bigint < event_lifecycle_version
    or (profile_version_snapshot ->> 'version')::bigint < event_profile_version
  then
    raise exception 'Profile update provider seams are inconsistent'
      using errcode = '22023', detail = 'provider_contract_violation';
  end if;

  insert into private.home_profile_projection_watermarks_v1 (
    player_id,
    profile_id,
    profile_version,
    source_event_id,
    occurred_at,
    invalidated_at
  ) values (
    event_player_id,
    event_profile_id,
    event_profile_version,
    event_id,
    occurred_at,
    now()
  )
  on conflict (player_id) do update
    set profile_id = excluded.profile_id,
        profile_version = excluded.profile_version,
        source_event_id = excluded.source_event_id,
        occurred_at = excluded.occurred_at,
        invalidated_at = now()
    where private.home_profile_projection_watermarks_v1.profile_version < excluded.profile_version
      or (
        private.home_profile_projection_watermarks_v1.profile_version = excluded.profile_version
        and private.home_profile_projection_watermarks_v1.occurred_at <= excluded.occurred_at
      );

  get diagnostics affected = row_count;
  if affected = 1 then
    update private.home_conversation_projection_v1
    set updated_at = now()
    where player_id = event_player_id
      or participant_player_id = event_player_id;
  end if;
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
  occurred_at timestamptz := (p_event ->> 'occurredAt')::timestamptz;
  config private.return_loop_config_v1%rowtype;
  notification_id uuid;
  lifecycle_player_id uuid;
begin
  if event_id is null or event_type is null or occurred_at is null then
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
    where processed.event_id = event_id
  ) then
    return jsonb_build_object(
      'eventId', event_id,
      'processed', true,
      'repeated', true
    );
  end if;

  if event_type = 'notification.requested.v1' then
    notification_id := private.persist_notification_requested_v1(p_event);
  elsif event_type = 'conversation.created.v1' then
    perform private.consume_conversation_ready_v1(p_event);
  elsif event_type = 'message.sent.v1' then
    perform private.consume_message_sent_v1(p_event);
  elsif event_type = 'conversation.read_advanced.v1' then
    perform private.consume_conversation_read_advanced_v1(p_event);
  elsif event_type = 'player.profile_updated.v1' then
    perform private.consume_player_profile_updated_v1(p_event);
  elsif event_type in (
    'match.created.v1',
    'player.activated.v1'
  ) then
    null;
  elsif event_type in (
    'player.suspended.v1',
    'player.deletion_requested.v1',
    'player.deleted.v1'
  ) then
    lifecycle_player_id := (p_event -> 'data' ->> 'playerId')::uuid;

    update private.push_devices_v1
    set enabled = false,
        disabled_at = coalesce(disabled_at, now())
    where player_id = lifecycle_player_id
      and enabled;

    if event_type = 'player.deleted.v1' then
      delete from public.notifications_v1
      where recipient_player_id = lifecycle_player_id;

      delete from private.home_conversation_projection_v1
      where player_id = lifecycle_player_id
        or participant_player_id = lifecycle_player_id;

      delete from private.home_profile_projection_watermarks_v1
      where player_id = lifecycle_player_id;
    end if;
  else
    return jsonb_build_object(
      'eventId', event_id,
      'processed', false,
      'reason', 'unsupported_event_type'
    );
  end if;

  insert into private.return_loop_processed_events_v1 (
    event_id,
    event_type,
    occurred_at
  ) values (
    event_id,
    event_type,
    occurred_at
  );

  return jsonb_build_object(
    'eventId', event_id,
    'notificationId', notification_id,
    'processed', true,
    'repeated', false
  );
end;
$$;

create or replace function public.get_notification_summary_v1()
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

  if not private.return_loop_feature_enabled_v1('inbox', account_id) then
    raise exception 'Notification inbox is disabled for this cohort'
      using errcode = '55000', detail = 'notification_inbox_disabled';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(account_id, false);
  return private.notification_summary_for_player_v1(snapshot.player_id);
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
declare
  account_id uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
  cursor_value jsonb;
  cursor_occurred_at timestamptz;
  cursor_notification_id uuid;
  page_items jsonb;
  next_cursor text;
  latest_watermark jsonb;
  unseen_count integer;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_limit not between 1 and 100 then
    raise exception 'Invalid notification page size'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  if not private.return_loop_feature_enabled_v1('inbox', account_id) then
    raise exception 'Notification inbox is disabled for this cohort'
      using errcode = '55000', detail = 'notification_inbox_disabled';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(account_id, false);

  if p_cursor is not null then
    begin
      cursor_value := p_cursor::jsonb;
      cursor_occurred_at := (cursor_value ->> 'occurredAt')::timestamptz;
      cursor_notification_id := (cursor_value ->> 'notificationId')::uuid;
    exception
      when others then
        raise exception 'Invalid notification cursor'
          using errcode = '22023', detail = 'stale_cursor';
    end;
  end if;

  with page as (
    select notification.*
    from public.notifications_v1 as notification
    where notification.recipient_player_id = snapshot.player_id
      and (
        cursor_occurred_at is null
        or (notification.occurred_at, notification.id) < (cursor_occurred_at, cursor_notification_id)
      )
    order by notification.occurred_at desc, notification.id desc
    limit p_limit + 1
  ), limited as (
    select *
    from page
    order by occurred_at desc, id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'notificationId', limited.id,
      'recipientPlayerId', limited.recipient_player_id,
      'kind', limited.kind,
      'sourceEventId', limited.source_event_id,
      'occurredAt', limited.occurred_at,
      'seenAt', limited.seen_at,
      'readAt', limited.read_at,
      'deepLink', limited.deep_link
    ) order by occurred_at desc, id desc), '[]'::jsonb),
    case
      when (select count(*) from page) > p_limit then (
        select jsonb_build_object(
          'occurredAt', tail.occurred_at,
          'notificationId', tail.id
        )::text
        from limited as tail
        order by tail.occurred_at asc, tail.id asc
        limit 1
      )
      else null
    end
  into page_items, next_cursor
  from limited;

  select jsonb_build_object(
    'notificationId', latest.id,
    'occurredAt', latest.occurred_at
  ) into latest_watermark
  from public.notifications_v1 as latest
  where latest.recipient_player_id = snapshot.player_id
  order by latest.occurred_at desc, latest.id desc
  limit 1;

  select count(*)::integer into unseen_count
  from public.notifications_v1 as unseen
  where unseen.recipient_player_id = snapshot.player_id
    and unseen.seen_at is null;

  return jsonb_build_object(
    'items', page_items,
    'nextCursor', next_cursor,
    'latestWatermark', latest_watermark,
    'unseenCount', unseen_count
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
declare
  account_id uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
  target public.notifications_v1%rowtype;
  seen_time timestamptz := clock_timestamp();
  unseen_count integer;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if not private.return_loop_feature_enabled_v1('inbox', account_id) then
    raise exception 'Notification inbox is disabled for this cohort'
      using errcode = '55000', detail = 'notification_inbox_disabled';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(account_id, false);

  select * into target
  from public.notifications_v1
  where id = p_notification_id
    and recipient_player_id = snapshot.player_id;

  if target.id is null then
    raise exception 'Notification not found'
      using errcode = 'P0002', detail = 'not_found';
  end if;

  update public.notifications_v1
  set seen_at = coalesce(seen_at, seen_time)
  where recipient_player_id = snapshot.player_id
    and (occurred_at, id) <= (target.occurred_at, target.id)
    and seen_at is null;

  select count(*)::integer into unseen_count
  from public.notifications_v1 as unseen
  where unseen.recipient_player_id = snapshot.player_id
    and unseen.seen_at is null;

  return jsonb_build_object(
    'seenAt', seen_time,
    'seenThrough', jsonb_build_object(
      'notificationId', target.id,
      'occurredAt', target.occurred_at
    ),
    'unseenCount', unseen_count
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
declare
  account_id uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
  notification public.notifications_v1%rowtype;
  transition_time timestamptz := clock_timestamp();
  unseen_count integer;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if not private.return_loop_feature_enabled_v1('inbox', account_id) then
    raise exception 'Notification inbox is disabled for this cohort'
      using errcode = '55000', detail = 'notification_inbox_disabled';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(account_id, false);

  update public.notifications_v1
  set seen_at = coalesce(seen_at, transition_time),
      read_at = coalesce(read_at, greatest(transition_time, coalesce(seen_at, transition_time)))
  where id = p_notification_id
    and recipient_player_id = snapshot.player_id
  returning * into notification;

  if notification.id is null then
    raise exception 'Notification not found'
      using errcode = 'P0002', detail = 'not_found';
  end if;

  select count(*)::integer into unseen_count
  from public.notifications_v1 as unseen
  where unseen.recipient_player_id = snapshot.player_id
    and unseen.seen_at is null;

  return jsonb_build_object(
    'notification', private.notification_to_json_v1(notification),
    'unseenCount', unseen_count
  );
end;
$$;

create or replace function public.register_push_device_v1(
  p_device_installation_id text,
  p_expo_push_token text,
  p_platform text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
  existing_owner uuid;
  device private.push_devices_v1%rowtype;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_device_installation_id is null
    or char_length(p_device_installation_id) not between 16 and 180
    or p_expo_push_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$'
    or p_platform not in ('android', 'ios')
  then
    raise exception 'Invalid push device registration'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(account_id, false);
  if snapshot.state <> 'active' then
    raise exception 'Only active players may register push devices'
      using errcode = '42501', detail = 'lifecycle_not_active';
  end if;

  select registered.account_id into existing_owner
  from private.push_devices_v1 as registered
  where registered.expo_push_token = p_expo_push_token
    and registered.account_id <> account_id;

  if existing_owner is not null then
    raise exception 'Push token is owned by another account'
      using errcode = '23505', detail = 'push_token_ownership_conflict';
  end if;

  insert into private.push_devices_v1 (
    account_id,
    player_id,
    device_installation_id,
    expo_push_token,
    platform,
    enabled,
    last_seen_at,
    disabled_at
  ) values (
    account_id,
    snapshot.player_id,
    p_device_installation_id,
    p_expo_push_token,
    p_platform,
    true,
    now(),
    null
  )
  on conflict (account_id, device_installation_id) do update
    set player_id = excluded.player_id,
        expo_push_token = excluded.expo_push_token,
        platform = excluded.platform,
        enabled = true,
        last_seen_at = now(),
        disabled_at = null
  returning * into device;

  return jsonb_build_object(
    'deviceInstallationId', device.device_installation_id,
    'playerId', device.player_id,
    'platform', device.platform,
    'enabled', device.enabled,
    'updatedAt', device.updated_at
  );
end;
$$;

create or replace function public.unregister_push_device_v1(
  p_device_installation_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  affected integer;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  update private.push_devices_v1
  set enabled = false,
      disabled_at = coalesce(disabled_at, now())
  where account_id = actor_account_id
    and device_installation_id = p_device_installation_id
    and enabled;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function public.get_home_current_profile_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  snapshot private.return_loop_player_snapshot_v1;
  profile_projection jsonb;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(account_id, false);

  select jsonb_build_object(
    'playerId', snapshot.player_id,
    'profileId', snapshot.profile_id,
    'displayName', legacy_profile.display_name,
    'avatarMediaId', legacy_profile.avatar_media_id,
    'handle', game_profile.handle,
    'rankName', rank.name,
    'roleNames', coalesce((
      select jsonb_agg(role.name order by role.name)
      from public.profile_roles as profile_role
      join public.roles as role
        on role.id = profile_role.role_id
      where profile_role.profile_id = legacy_profile.id
    ), '[]'::jsonb),
    'onlineTimePreset', profile_habit.online_time_presets[1]
  ) into profile_projection
  from public.player_profiles_v1 as canonical_profile
  join public.profiles as legacy_profile
    on legacy_profile.id = canonical_profile.legacy_profile_id
  left join public.game_profiles as game_profile
    on game_profile.profile_id = legacy_profile.id
  left join public.ranks as rank
    on rank.id = game_profile.rank_id
  left join public.profile_habits as profile_habit
    on profile_habit.profile_id = legacy_profile.id
  where canonical_profile.id = snapshot.profile_id
    and canonical_profile.player_id = snapshot.player_id
    and legacy_profile.deleted_at is null;

  if profile_projection is null then
    raise exception 'Home profile projection is unavailable'
      using errcode = 'P0002', detail = 'profile_not_found';
  end if;

  return profile_projection;
end;
$$;

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
  config private.return_loop_config_v1%rowtype;
  home_enabled boolean;
  active_intent jsonb;
  recent_matches jsonb;
  conversations jsonb;
  unseen_count integer;
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  snapshot := private.require_return_loop_player_snapshot_by_account_v1(account_id, false);
  home_enabled := private.return_loop_feature_enabled_v1('home', account_id);

  select * into config
  from private.return_loop_config_v1
  where singleton;

  select count(*)::integer into unseen_count
  from public.notifications_v1 as notification
  where notification.recipient_player_id = snapshot.player_id
    and notification.seen_at is null;

  if not home_enabled then
    if not config.minimal_safe_dashboard_enabled then
      raise exception 'Home dashboard is disabled for this cohort'
        using errcode = '55000', detail = 'home_dashboard_disabled';
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
      'notificationSummary', jsonb_build_object('unseenCount', unseen_count),
      'capabilities', jsonb_build_object(
        'canDiscover', false,
        'canMessage', false
      ),
      'generatedAt', now()
    );
  end if;

  select jsonb_build_object(
    'matchIntentId', intent.id,
    'lifecycle', intent.state,
    'mode', intent.filters ->> 'mode',
    'activatedAt', intent.activated_at,
    'expiresAt', intent.expires_at
  ) into active_intent
  from public.match_intents_v1 as intent
  where intent.player_id = snapshot.player_id
    and intent.state = 'active'
  limit 1;

  select coalesce(jsonb_agg(match_summary order by match_created_at desc), '[]'::jsonb)
    into recent_matches
  from (
    select
      match.created_at as match_created_at,
      jsonb_build_object(
        'matchId', match.id,
        'matchedPlayer', private.home_player_summary_v1(
          case
            when match.player_low_id = snapshot.player_id then match.player_high_id
            else match.player_low_id
          end
        ),
        'conversationId', projection.conversation_id,
        'kind', match.home_kind_v1,
        'status', match.home_status_v1,
        'createdAt', match.created_at
      ) as match_summary
    from public.matches as match
    left join private.home_conversation_projection_v1 as projection
      on projection.player_id = snapshot.player_id
      and projection.match_id = match.id
    where snapshot.player_id in (match.player_low_id, match.player_high_id)
      and match.unmatched_at is null
      and match.home_kind_v1 is not null
      and match.home_status_v1 is not null
    order by match.created_at desc
    limit 20
  ) as matches_for_home;

  select coalesce(jsonb_agg(conversation_summary order by sort_at desc), '[]'::jsonb)
    into conversations
  from (
    select
      coalesce(projection.last_message_at, projection.updated_at) as sort_at,
      jsonb_build_object(
        'conversationId', projection.conversation_id,
        'matchId', projection.match_id,
        'participant', private.home_player_summary_v1(projection.participant_player_id),
        'lastMessagePreview', projection.last_message_preview,
        'lastMessageAt', projection.last_message_at,
        'unreadCount', projection.unread_count
      ) as conversation_summary
    from private.home_conversation_projection_v1 as projection
    where projection.player_id = snapshot.player_id
      and projection.match_id is not null
      and projection.participant_player_id is not null
    order by coalesce(projection.last_message_at, projection.updated_at) desc
    limit 20
  ) as conversations_for_home;

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
    'activeMatchIntent', active_intent,
    'recentMatches', recent_matches,
    'conversations', conversations,
    'notificationSummary', jsonb_build_object('unseenCount', unseen_count),
    'capabilities', jsonb_build_object(
      'canDiscover', snapshot.state = 'active' and snapshot.discoverable,
      'canMessage', snapshot.state = 'active' and snapshot.messaging_allowed
    ),
    'generatedAt', now()
  );
end;
$$;

create or replace function public.get_return_loop_capabilities_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  return jsonb_build_object(
    'home', private.return_loop_feature_enabled_v1('home', account_id),
    'notificationInbox', private.return_loop_feature_enabled_v1('inbox', account_id),
    'push', private.return_loop_feature_enabled_v1('push', account_id),
    'deepLinks', private.return_loop_feature_enabled_v1('deep_link', account_id)
  );
end;
$$;

create or replace function public.consume_return_loop_event_v1(p_event jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.consume_return_loop_event_v1(p_event)
$$;

create or replace function public.process_pending_return_loop_events_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  consumer_response jsonb;
  selected_count integer := 0;
  processed_count integer := 0;
  repeated_count integer := 0;
  deferred_count integer := 0;
  failed_count integer := 0;
  processed_event_ids jsonb := '[]'::jsonb;
  failures jsonb := '[]'::jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid Return Loop dispatch size'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  for event_row in
    select event.id, event.payload
    from private.outbox_events as event
    where event.available_at <= now()
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
      and not exists (
        select 1
        from private.return_loop_processed_events_v1 as processed
        where processed.event_id = event.id
      )
    order by event.available_at, event.created_at, event.id
    limit p_limit
    for update of event skip locked
  loop
    selected_count := selected_count + 1;
    begin
      consumer_response := private.consume_return_loop_event_v1(event_row.payload);
      if coalesce((consumer_response ->> 'processed')::boolean, false) then
        processed_count := processed_count + 1;
        repeated_count := repeated_count + case
          when coalesce((consumer_response ->> 'repeated')::boolean, false)
          then 1 else 0 end;
        processed_event_ids := processed_event_ids || jsonb_build_array(event_row.id);
      else
        deferred_count := deferred_count + 1;
      end if;
    exception when others then
      failed_count := failed_count + 1;
      failures := failures || jsonb_build_array(jsonb_build_object(
        'eventId', event_row.id,
        'message', sqlerrm,
        'sqlstate', sqlstate
      ));
    end;
  end loop;

  return jsonb_build_object(
    'deferredCount', deferred_count,
    'failedCount', failed_count,
    'failures', failures,
    'processedCount', processed_count,
    'processedEventIds', processed_event_ids,
    'repeatedCount', repeated_count,
    'selectedCount', selected_count
  );
end;
$$;

comment on function public.process_pending_return_loop_events_v1(integer) is
  'Processes Return Loop events with per-consumer EventId receipts and never changes shared outbox status or processed_at.';

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
    'recipientPlayerId', claimed.recipient_player_id,
    'title', notification.title,
    'body', notification.body,
    'deepLink', notification.deep_link,
    'tokens', coalesce((
      select jsonb_agg(device.expo_push_token order by device.created_at)
      from private.push_devices_v1 as device
      where device.player_id = claimed.recipient_player_id
        and device.enabled
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

create or replace function public.complete_notification_push_job_v1(
  p_job_id uuid,
  p_provider_ticket_id text,
  p_provider_receipt jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update private.notification_push_jobs_v1
  set status = 'delivered',
      provider_ticket_id = p_provider_ticket_id,
      provider_receipt = p_provider_receipt,
      completed_at = now(),
      last_error = null
  where id = p_job_id
    and status = 'processing';

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.fail_notification_push_job_v1(
  p_job_id uuid,
  p_error text,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update private.notification_push_jobs_v1
  set status = case
        when p_retryable and attempt_count < 5
          then 'pending'::private.notification_push_status_v1
        else 'failed'::private.notification_push_status_v1
      end,
      available_at = case
        when p_retryable and attempt_count < 5
          then now() + make_interval(mins => least(60, (2 ^ attempt_count)::integer))
        else available_at
      end,
      claimed_at = null,
      completed_at = case
        when p_retryable and attempt_count < 5 then null
        else now()
      end,
      last_error = left(coalesce(p_error, 'unknown push failure'), 1000)
  where id = p_job_id
    and status = 'processing';

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

alter table public.notifications_v1 enable row level security;

create policy notifications_v1_select_own
on public.notifications_v1
for select
to authenticated
using (recipient_player_id = private.current_return_loop_player_id_v1());

revoke all on public.notifications_v1 from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on function private.consume_return_loop_event_v1(jsonb) from public, anon, authenticated;
revoke all on function public.consume_return_loop_event_v1(jsonb) from public, anon, authenticated;
revoke all on function public.process_pending_return_loop_events_v1(integer) from public, anon, authenticated;
revoke all on function public.claim_notification_push_jobs_v1(integer) from public, anon, authenticated;
revoke all on function public.complete_notification_push_job_v1(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_notification_push_job_v1(uuid, text, boolean) from public, anon, authenticated;

revoke all on function public.get_notification_summary_v1() from public, anon;
revoke all on function public.list_notifications_v1(text, integer) from public, anon;
revoke all on function public.mark_notifications_seen_through_v1(uuid) from public, anon;
revoke all on function public.mark_notification_read_v1(uuid) from public, anon;
revoke all on function public.register_push_device_v1(text, text, text) from public, anon;
revoke all on function public.unregister_push_device_v1(text) from public, anon;
revoke all on function public.get_home_current_profile_v1() from public, anon;
revoke all on function public.get_home_dashboard_v1() from public, anon;
revoke all on function public.get_return_loop_capabilities_v1() from public, anon;
grant execute on function public.get_notification_summary_v1() to authenticated;
grant execute on function public.list_notifications_v1(text, integer) to authenticated;
grant execute on function public.mark_notifications_seen_through_v1(uuid) to authenticated;
grant execute on function public.mark_notification_read_v1(uuid) to authenticated;
grant execute on function public.register_push_device_v1(text, text, text) to authenticated;
grant execute on function public.unregister_push_device_v1(text) to authenticated;
grant execute on function public.get_home_current_profile_v1() to authenticated;
grant execute on function public.get_home_dashboard_v1() to authenticated;
grant execute on function public.get_return_loop_capabilities_v1() to authenticated;
grant execute on function private.consume_return_loop_event_v1(jsonb) to service_role;
grant execute on function public.consume_return_loop_event_v1(jsonb) to service_role;
grant execute on function public.process_pending_return_loop_events_v1(integer) to service_role;
grant execute on function public.claim_notification_push_jobs_v1(integer) to service_role;
grant execute on function public.complete_notification_push_job_v1(uuid, text, jsonb) to service_role;
grant execute on function public.fail_notification_push_job_v1(uuid, text, boolean) to service_role;
