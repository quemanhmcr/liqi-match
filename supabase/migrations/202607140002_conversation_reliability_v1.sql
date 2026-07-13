-- Conversation Reliability v1
--
-- Mission 3 owns canonical match-to-conversation mapping, immutable message
-- ordering, send idempotency, read watermarks, unread aggregation and realtime
-- recovery. The migration expands the legacy tables in place; it does not
-- create a second message store and never queries relationship/swipe tables to
-- decide whether a conversation should exist.

create type public.conversation_state_v1 as enum ('open', 'archived', 'closed');
create type public.message_content_kind_v1 as enum ('text', 'media', 'system');

create type private.messaging_player_snapshot_v1 as (
  account_id uuid,
  player_id uuid,
  profile_id uuid,
  state text,
  messaging_allowed boolean,
  lifecycle_version integer,
  updated_at timestamptz
);

create table private.conversation_authority_config_v1 (
  singleton boolean primary key default true check (singleton),
  bootstrap_enabled boolean not null default false,
  reads_enabled boolean not null default false,
  writes_enabled boolean not null default false,
  realtime_enabled boolean not null default false,
  image_messages_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.conversation_authority_config_v1 (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.conversations
  add column state_v1 public.conversation_state_v1 not null default 'open',
  add column version_v1 integer not null default 1 check (version_v1 > 0),
  add column last_sequence_v1 bigint not null default 0 check (last_sequence_v1 >= 0),
  add column bootstrap_event_id_v1 uuid,
  add column closed_at_v1 timestamptz;

alter table public.conversation_members
  add column player_id_v1 uuid,
  add column last_read_sequence_v1 bigint not null default 0
    check (last_read_sequence_v1 >= 0),
  add column read_version_v1 integer not null default 1
    check (read_version_v1 > 0);

alter table public.messages
  add column schema_version_v1 integer not null default 0
    check (schema_version_v1 in (0, 1)),
  add column sender_account_id_v1 uuid,
  add column sender_player_id_v1 uuid,
  add column client_message_id_v1 text,
  add column sequence_v1 bigint,
  add column content_kind_v1 public.message_content_kind_v1,
  add column content_v1 jsonb,
  add column media_asset_id_v1 uuid references public.media_assets(id) on delete restrict,
  add column correlation_id_v1 uuid,
  add column request_fingerprint_v1 text;

alter table public.messages
  add constraint messages_v1_shape_check check (
    schema_version_v1 = 0
    or (
      sender_account_id_v1 is not null
      and sender_player_id_v1 is not null
      and client_message_id_v1 is not null
      and char_length(client_message_id_v1) between 16 and 128
      and sequence_v1 is not null
      and sequence_v1 > 0
      and content_kind_v1 is not null
      and content_v1 is not null
      and jsonb_typeof(content_v1) = 'object'
      and correlation_id_v1 is not null
      and request_fingerprint_v1 is not null
      and (
        (
          content_kind_v1 = 'text'
          and content_v1 ->> 'kind' = 'text'
          and char_length(content_v1 ->> 'text') between 1 and 4000
          and media_asset_id_v1 is null
        )
        or (
          content_kind_v1 = 'media'
          and content_v1 ->> 'kind' = 'media'
          and content_v1 ->> 'assetId' = media_asset_id_v1::text
          and media_asset_id_v1 is not null
          and (
            content_v1 ->> 'caption' is null
            or char_length(content_v1 ->> 'caption') between 1 and 4000
          )
        )
        or (
          content_kind_v1 = 'system'
          and content_v1 ->> 'kind' = 'system'
          and char_length(content_v1 ->> 'eventType') between 1 and 120
          and media_asset_id_v1 is null
        )
      )
    )
  );

create unique index conversation_members_player_v1_key
  on public.conversation_members (conversation_id, player_id_v1)
  where player_id_v1 is not null;

create unique index messages_client_id_v1_key
  on public.messages (
    conversation_id,
    sender_account_id_v1,
    client_message_id_v1
  )
  where schema_version_v1 = 1;

create unique index messages_sequence_v1_key
  on public.messages (conversation_id, sequence_v1)
  where schema_version_v1 = 1;

create index messages_timeline_v1_idx
  on public.messages (conversation_id, sequence_v1 desc)
  where schema_version_v1 = 1 and deleted_at is null;

create index conversation_members_inbox_v1_idx
  on public.conversation_members (player_id_v1, conversation_id)
  where player_id_v1 is not null;

create table private.conversation_bootstrap_receipts_v1 (
  match_id uuid primary key references public.matches(id) on delete cascade,
  bootstrap_event_id uuid not null unique,
  participant_low_id uuid not null,
  participant_high_id uuid not null,
  request_fingerprint text not null,
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  conversation_created_event_id uuid not null,
  processed_at timestamptz not null default now(),
  check (participant_low_id < participant_high_id)
);

alter table private.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table private.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'media_uploaded',
      'media_delete_requested',
      'media_processing_requested',
      'push_notification_requested',
      'account_deletion_requested',
      'match_intent.activated.v1',
      'player.liked.v1',
      'set.join_requested.v1',
      'set.invite_created.v1',
      'match.created.v1',
      'conversation.bootstrap_requested.v1',
      'conversation.created.v1',
      'message.sent.v1',
      'conversation.read_advanced.v1',
      'conversation.closed.v1',
      'notification.requested.v1'
    )
  );

create or replace function private.conversation_bootstrap_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select config.bootstrap_enabled
  from private.conversation_authority_config_v1 as config
  where config.singleton
$$;

create or replace function private.conversation_reads_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select config.reads_enabled
  from private.conversation_authority_config_v1 as config
  where config.singleton
$$;

create or replace function private.conversation_writes_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select config.writes_enabled
  from private.conversation_authority_config_v1 as config
  where config.singleton
$$;

create or replace function private.conversation_realtime_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select config.realtime_enabled
  from private.conversation_authority_config_v1 as config
  where config.singleton
$$;

create or replace function private.image_messages_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select config.image_messages_enabled
  from private.conversation_authority_config_v1 as config
  where config.singleton
$$;

create or replace function private.require_messaging_snapshot_by_account_v1(
  p_account_id uuid,
  p_lock boolean default false
)
returns private.messaging_player_snapshot_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_snapshot jsonb;
  snapshot private.messaging_player_snapshot_v1;
begin
  begin
    execute 'select public.get_player_lifecycle_snapshot_v1($1, $2)'
      into raw_snapshot
      using p_account_id, p_lock;
  exception
    when undefined_function then
      raise exception 'Player lifecycle provider is unavailable'
        using errcode = '55000', detail = 'lifecycle_provider_unavailable';
  end;

  if raw_snapshot is null then
    raise exception 'Player lifecycle snapshot not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  begin
    snapshot := row(
      (raw_snapshot ->> 'accountId')::uuid,
      (raw_snapshot ->> 'playerId')::uuid,
      (raw_snapshot ->> 'profileId')::uuid,
      raw_snapshot ->> 'state',
      (raw_snapshot ->> 'messagingAllowed')::boolean,
      (raw_snapshot ->> 'version')::integer,
      (raw_snapshot ->> 'updatedAt')::timestamptz
    )::private.messaging_player_snapshot_v1;
  exception
    when others then
      raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
        using errcode = '22023', detail = 'lifecycle_contract_violation';
  end;

  if snapshot.account_id is distinct from p_account_id
    or snapshot.player_id is null
    or snapshot.profile_id is null
    or snapshot.state is null
    or snapshot.messaging_allowed is null
    or snapshot.lifecycle_version is null
    or snapshot.updated_at is null
  then
    raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
      using errcode = '22023', detail = 'lifecycle_contract_violation';
  end if;

  return snapshot;
end;
$$;

create or replace function private.require_messaging_snapshot_by_player_v1(
  p_player_id uuid,
  p_lock boolean default false
)
returns private.messaging_player_snapshot_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_snapshot jsonb;
  snapshot private.messaging_player_snapshot_v1;
begin
  begin
    execute 'select public.get_player_lifecycle_snapshot_by_player_v1($1, $2)'
      into raw_snapshot
      using p_player_id, p_lock;
  exception
    when undefined_function then
      raise exception 'Player lifecycle provider is unavailable'
        using errcode = '55000', detail = 'lifecycle_provider_unavailable';
  end;

  if raw_snapshot is null then
    raise exception 'Player lifecycle snapshot not found'
      using errcode = 'P0002', detail = 'player_not_found';
  end if;

  begin
    snapshot := row(
      (raw_snapshot ->> 'accountId')::uuid,
      (raw_snapshot ->> 'playerId')::uuid,
      (raw_snapshot ->> 'profileId')::uuid,
      raw_snapshot ->> 'state',
      (raw_snapshot ->> 'messagingAllowed')::boolean,
      (raw_snapshot ->> 'version')::integer,
      (raw_snapshot ->> 'updatedAt')::timestamptz
    )::private.messaging_player_snapshot_v1;
  exception
    when others then
      raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
        using errcode = '22023', detail = 'lifecycle_contract_violation';
  end;

  if snapshot.player_id is distinct from p_player_id
    or snapshot.account_id is null
    or snapshot.profile_id is null
    or snapshot.state is null
    or snapshot.messaging_allowed is null
    or snapshot.lifecycle_version is null
    or snapshot.updated_at is null
  then
    raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
      using errcode = '22023', detail = 'lifecycle_contract_violation';
  end if;

  return snapshot;
end;
$$;

create or replace function private.assert_messaging_allowed_v1(
  p_snapshot private.messaging_player_snapshot_v1
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_snapshot.state is distinct from 'active'
    or not coalesce(p_snapshot.messaging_allowed, false)
  then
    case p_snapshot.state
      when 'suspended' then
        raise exception 'Suspended players cannot send messages'
          using errcode = '42501', detail = 'player_suspended';
      when 'deleting' then
        raise exception 'Players pending deletion cannot send messages'
          using errcode = '42501', detail = 'player_deleting';
      when 'deleted' then
        raise exception 'Deleted players cannot send messages'
          using errcode = '42501', detail = 'player_deleted';
      else
        raise exception 'Player lifecycle does not allow messaging'
          using errcode = '42501', detail = 'lifecycle_not_active';
    end case;
  end if;
end;
$$;

create or replace function private.is_conversation_player_member_v1(
  p_conversation_id uuid,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members as member
    where member.conversation_id = p_conversation_id
      and member.player_id_v1 = p_player_id
  )
$$;

create or replace function private.message_json_v1(p_message public.messages)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'messageId', p_message.id,
    'conversationId', p_message.conversation_id,
    'senderPlayerId', p_message.sender_player_id_v1,
    'clientMessageId', p_message.client_message_id_v1,
    'sequence', p_message.sequence_v1,
    'content', p_message.content_v1,
    'createdAt', p_message.created_at
  )
$$;

create or replace function private.message_summary_json_v1(p_message public.messages)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'messageId', p_message.id,
    'senderPlayerId', p_message.sender_player_id_v1,
    'sequence', p_message.sequence_v1,
    'kind', p_message.content_kind_v1,
    'preview', case p_message.content_kind_v1
      when 'text' then left(p_message.content_v1 ->> 'text', 240)
      when 'media' then left(coalesce(p_message.content_v1 ->> 'caption', 'Hình ảnh'), 240)
      else left(coalesce(p_message.content_v1 ->> 'eventType', 'system'), 240)
    end,
    'createdAt', p_message.created_at
  )
$$;

create or replace function private.conversation_unread_count_v1(
  p_conversation_id uuid,
  p_player_id uuid,
  p_last_read_sequence bigint
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.messages as message
  where message.conversation_id = p_conversation_id
    and message.schema_version_v1 = 1
    and message.deleted_at is null
    and message.sequence_v1 > p_last_read_sequence
    and message.sender_player_id_v1 <> p_player_id
$$;

create or replace function private.conversation_snapshot_json_v1(
  p_conversation_id uuid,
  p_viewer_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conversation public.conversations%rowtype;
  member public.conversation_members%rowtype;
  last_message public.messages%rowtype;
  participant_ids jsonb;
  unread_count integer;
begin
  select * into conversation
  from public.conversations
  where id = p_conversation_id;

  if conversation.id is null then
    raise exception 'Conversation not found'
      using errcode = 'P0002', detail = 'conversation_not_found';
  end if;

  select * into member
  from public.conversation_members
  where conversation_id = p_conversation_id
    and player_id_v1 = p_viewer_player_id;

  if member.conversation_id is null then
    raise exception 'Conversation membership required'
      using errcode = '42501', detail = 'conversation_forbidden';
  end if;

  select coalesce(jsonb_agg(player_id_v1 order by player_id_v1), '[]'::jsonb)
    into participant_ids
  from public.conversation_members
  where conversation_id = p_conversation_id
    and player_id_v1 is not null;

  select * into last_message
  from public.messages
  where conversation_id = p_conversation_id
    and schema_version_v1 = 1
    and deleted_at is null
  order by sequence_v1 desc
  limit 1;

  unread_count := private.conversation_unread_count_v1(
    p_conversation_id,
    p_viewer_player_id,
    member.last_read_sequence_v1
  );

  return jsonb_build_object(
    'conversationId', conversation.id,
    'matchId', conversation.match_id,
    'participantIds', participant_ids,
    'state', conversation.state_v1,
    'lastMessage', case
      when last_message.id is null then null
      else private.message_summary_json_v1(last_message)
    end,
    'unreadCount', unread_count,
    'version', conversation.version_v1
  );
end;
$$;

create or replace function private.consume_conversation_bootstrap_event_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event private.outbox_events%rowtype;
  match_row public.matches%rowtype;
  existing_receipt private.conversation_bootstrap_receipts_v1%rowtype;
  low_snapshot private.messaging_player_snapshot_v1;
  high_snapshot private.messaging_player_snapshot_v1;
  participant_one uuid;
  participant_two uuid;
  participant_low uuid;
  participant_high uuid;
  request_fingerprint text;
  conversation public.conversations%rowtype;
  created_event_id uuid;
  conversation_data jsonb;
  receipt jsonb;
begin
  select * into event
  from private.outbox_events
  where id = p_event_id
    and event_type = 'conversation.bootstrap_requested.v1'
    and contract_version = 1
  for update;

  if event.id is null then
    raise exception 'Conversation bootstrap event not found'
      using errcode = 'P0002', detail = 'bootstrap_event_not_found';
  end if;

  if not private.conversation_bootstrap_enabled_v1() then
    raise exception 'Conversation bootstrap is disabled'
      using errcode = '55000', detail = 'conversation_bootstrap_disabled';
  end if;

  begin
    participant_one := (event.payload #>> '{data,participantIds,0}')::uuid;
    participant_two := (event.payload #>> '{data,participantIds,1}')::uuid;
  exception
    when others then
      raise exception 'Invalid conversation.bootstrap_requested.v1 payload'
        using errcode = '22023', detail = 'bootstrap_contract_violation';
  end;

  if (event.payload #>> '{data,matchId}')::uuid is distinct from event.aggregate_id
    or event.aggregate_type is distinct from 'match'
    or participant_one is null
    or participant_two is null
    or participant_one = participant_two
  then
    raise exception 'Invalid conversation.bootstrap_requested.v1 payload'
      using errcode = '22023', detail = 'bootstrap_contract_violation';
  end if;

  participant_low := least(participant_one, participant_two);
  participant_high := greatest(participant_one, participant_two);
  request_fingerprint := private.request_fingerprint_v1(
    jsonb_build_object(
      'matchId', event.aggregate_id,
      'participantIds', jsonb_build_array(participant_low, participant_high)
    )
  );

  select * into match_row
  from public.matches
  where id = event.aggregate_id
  for update;

  if match_row.id is null then
    raise exception 'Authoritative match not found'
      using errcode = 'P0002', detail = 'match_not_found';
  end if;

  if match_row.player_low_id is distinct from participant_low
    or match_row.player_high_id is distinct from participant_high
  then
    raise exception 'Bootstrap participants conflict with authoritative match'
      using errcode = '23505', detail = 'conversation_bootstrap_conflict';
  end if;

  select * into existing_receipt
  from private.conversation_bootstrap_receipts_v1
  where match_id = match_row.id;

  if existing_receipt.match_id is not null then
    if existing_receipt.request_fingerprint is distinct from request_fingerprint then
      raise exception 'Bootstrap retry conflicts with existing conversation'
        using errcode = '23505', detail = 'conversation_bootstrap_conflict';
    end if;

    update private.outbox_events
    set status = 'processed',
        processed_at = coalesce(processed_at, now()),
        last_error = null
    where id = event.id;

    return jsonb_build_object(
      'conversationId', existing_receipt.conversation_id,
      'matchId', existing_receipt.match_id,
      'repeated', true
    );
  end if;

  low_snapshot := private.require_messaging_snapshot_by_player_v1(participant_low, false);
  high_snapshot := private.require_messaging_snapshot_by_player_v1(participant_high, false);

  insert into public.conversations (
    match_id,
    state_v1,
    version_v1,
    last_sequence_v1,
    bootstrap_event_id_v1
  )
  values (match_row.id, 'open', 1, 0, event.id)
  on conflict (match_id) do update
    set match_id = excluded.match_id
  returning * into conversation;

  if conversation.bootstrap_event_id_v1 is not null
    and conversation.bootstrap_event_id_v1 <> event.id
  then
    if not exists (
      select 1
      from public.conversation_members as existing_member
      where existing_member.conversation_id = conversation.id
        and existing_member.player_id_v1 in (participant_low, participant_high)
      group by existing_member.conversation_id
      having count(*) = 2
    ) then
      raise exception 'Existing conversation conflicts with bootstrap participants'
        using errcode = '23505', detail = 'conversation_bootstrap_conflict';
    end if;
  else
    update public.conversations
    set bootstrap_event_id_v1 = event.id
    where id = conversation.id
      and bootstrap_event_id_v1 is null;
  end if;

  insert into public.conversation_members (
    conversation_id,
    profile_id,
    player_id_v1,
    last_read_sequence_v1,
    read_version_v1
  )
  values
    (conversation.id, low_snapshot.profile_id, low_snapshot.player_id, 0, 1),
    (conversation.id, high_snapshot.profile_id, high_snapshot.player_id, 0, 1)
  on conflict (conversation_id, profile_id) do update
    set player_id_v1 = excluded.player_id_v1
  where conversation_members.player_id_v1 is null
     or conversation_members.player_id_v1 = excluded.player_id_v1;

  if (
    select count(*)
    from public.conversation_members
    where conversation_id = conversation.id
      and player_id_v1 in (participant_low, participant_high)
  ) <> 2 then
    raise exception 'Conversation participant mapping conflict'
      using errcode = '23505', detail = 'conversation_bootstrap_conflict';
  end if;

  conversation_data := jsonb_build_object(
    'conversationId', conversation.id,
    'matchId', match_row.id,
    'participantIds', jsonb_build_array(participant_low, participant_high),
    'state', conversation.state_v1,
    'lastMessage', null,
    'unreadCount', 0,
    'version', conversation.version_v1
  );

  created_event_id := private.enqueue_contract_event_v1(
    'conversation.created.v1',
    'conversation',
    conversation.id,
    event.correlation_id,
    event.id,
    jsonb_build_object(
      'conversation', conversation_data,
      'bootstrapEventId', event.id
    ),
    format('conversation.created.v1:%s', conversation.id)
  );

  insert into private.conversation_bootstrap_receipts_v1 (
    match_id,
    bootstrap_event_id,
    participant_low_id,
    participant_high_id,
    request_fingerprint,
    conversation_id,
    conversation_created_event_id
  )
  values (
    match_row.id,
    event.id,
    participant_low,
    participant_high,
    request_fingerprint,
    conversation.id,
    created_event_id
  );

  update public.matches
  set home_status_v1 = 'conversation_ready'
  where id = match_row.id
    and home_status_v1 = 'conversation_pending';

  update private.outbox_events
  set status = 'processed',
      processed_at = now(),
      last_error = null
  where id = event.id;

  receipt := jsonb_build_object(
    'conversationId', conversation.id,
    'matchId', match_row.id,
    'repeated', false
  );
  return receipt;
end;
$$;

create or replace function public.consume_conversation_bootstrap_event_v1(
  p_event_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.consume_conversation_bootstrap_event_v1(p_event_id)
$$;

create or replace function public.process_pending_conversation_bootstraps_v1(
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record record;
  result jsonb;
  results jsonb := '[]'::jsonb;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  for event_record in
    select event.id
    from private.outbox_events as event
    where event.event_type = 'conversation.bootstrap_requested.v1'
      and event.contract_version = 1
      and event.status in ('pending', 'failed')
      and event.available_at <= now()
    order by event.created_at, event.id
    limit safe_limit
    for update skip locked
  loop
    begin
      update private.outbox_events
      set status = 'processing',
          attempt_count = attempt_count + 1,
          last_error = null
      where id = event_record.id;

      result := private.consume_conversation_bootstrap_event_v1(event_record.id);
      results := results || jsonb_build_array(result);
    exception
      when others then
        update private.outbox_events
        set status = 'failed',
            attempt_count = attempt_count + 1,
            last_error = left(sqlerrm, 2000),
            available_at = now() + make_interval(
              secs => least(3600, greatest(5, attempt_count * attempt_count * 5))
            )
        where id = event_record.id;

        results := results || jsonb_build_array(
          jsonb_build_object(
            'eventId', event_record.id,
            'error', sqlerrm,
            'processed', false
          )
        );
    end;
  end loop;

  return results;
end;
$$;

create or replace function public.send_message_v1(
  p_conversation_id uuid,
  p_client_message_id text,
  p_content jsonb,
  p_client_created_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.messaging_player_snapshot_v1;
  conversation public.conversations%rowtype;
  existing_message public.messages%rowtype;
  created_message public.messages%rowtype;
  media_asset public.media_assets%rowtype;
  recipient_player_id uuid;
  recipient_member public.conversation_members%rowtype;
  content_kind public.message_content_kind_v1;
  canonical_content jsonb;
  compatibility_body text;
  media_asset_id uuid;
  request_fingerprint text;
  next_sequence bigint;
  message_event_id uuid;
  unread_count integer;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_conversation_id is null
    or p_correlation_id is null
    or p_client_created_at is null
    or p_client_message_id is null
    or char_length(p_client_message_id) not between 16 and 128
    or p_client_message_id !~ '^[A-Za-z0-9._:-]+$'
    or jsonb_typeof(p_content) is distinct from 'object'
  then
    raise exception 'Invalid send-message command'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  content_kind := (p_content ->> 'kind')::public.message_content_kind_v1;

  case content_kind
    when 'text' then
      compatibility_body := btrim(coalesce(p_content ->> 'text', ''));
      if char_length(compatibility_body) not between 1 and 4000 then
        raise exception 'Text message must contain 1 to 4000 characters'
          using errcode = '22023', detail = 'validation_failed';
      end if;
      canonical_content := jsonb_build_object(
        'kind', 'text',
        'text', compatibility_body
      );
    when 'media' then
      if not private.image_messages_enabled_v1() then
        raise exception 'Image messages are disabled'
          using errcode = '55000', detail = 'image_messages_disabled';
      end if;

      begin
        media_asset_id := (p_content ->> 'assetId')::uuid;
      exception
        when others then
          raise exception 'Invalid media asset identifier'
            using errcode = '22023', detail = 'validation_failed';
      end;

      compatibility_body := nullif(btrim(coalesce(p_content ->> 'caption', '')), '');
      if compatibility_body is not null and char_length(compatibility_body) > 4000 then
        raise exception 'Media caption is too long'
          using errcode = '22023', detail = 'validation_failed';
      end if;

      canonical_content := jsonb_strip_nulls(
        jsonb_build_object(
          'kind', 'media',
          'assetId', media_asset_id,
          'caption', compatibility_body
        )
      );
      compatibility_body := coalesce(
        compatibility_body,
        format('[media:%s]', media_asset_id)
      );
    else
      raise exception 'Clients may send only text or media messages'
        using errcode = '22023', detail = 'validation_failed';
  end case;

  request_fingerprint := private.request_fingerprint_v1(
    jsonb_build_object(
      'conversationId', p_conversation_id,
      'content', canonical_content
    )
  );

  select * into existing_message
  from public.messages
  where conversation_id = p_conversation_id
    and sender_account_id_v1 = actor_account_id
    and client_message_id_v1 = p_client_message_id
    and schema_version_v1 = 1;

  if existing_message.id is not null then
    if existing_message.request_fingerprint_v1 is distinct from request_fingerprint then
      raise exception 'Client message ID was reused with different content'
        using errcode = '23505', detail = 'idempotency_conflict';
    end if;

    return jsonb_build_object(
      'message', private.message_json_v1(existing_message),
      'repeated', true
    );
  end if;

  actor_snapshot := private.require_messaging_snapshot_by_account_v1(
    actor_account_id,
    true
  );

  if not private.conversation_writes_enabled_v1() then
    raise exception 'Conversation writes are disabled'
      using errcode = '55000', detail = 'conversation_writes_disabled';
  end if;

  perform private.assert_messaging_allowed_v1(actor_snapshot);

  select * into conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if conversation.id is null then
    raise exception 'Conversation not found'
      using errcode = 'P0002', detail = 'conversation_not_found';
  end if;

  if conversation.state_v1 is distinct from 'open' then
    raise exception 'Conversation is not open'
      using errcode = '42501', detail = 'conversation_closed';
  end if;

  if not private.is_conversation_player_member_v1(
    conversation.id,
    actor_snapshot.player_id
  ) then
    raise exception 'Conversation membership required'
      using errcode = '42501', detail = 'conversation_forbidden';
  end if;

  select * into existing_message
  from public.messages
  where conversation_id = p_conversation_id
    and sender_account_id_v1 = actor_account_id
    and client_message_id_v1 = p_client_message_id
    and schema_version_v1 = 1;

  if existing_message.id is not null then
    if existing_message.request_fingerprint_v1 is distinct from request_fingerprint then
      raise exception 'Client message ID was reused with different content'
        using errcode = '23505', detail = 'idempotency_conflict';
    end if;

    return jsonb_build_object(
      'message', private.message_json_v1(existing_message),
      'repeated', true
    );
  end if;

  if content_kind = 'media' then
    select * into media_asset
    from public.media_assets
    where id = media_asset_id
    for share;

    if media_asset.id is null
      or media_asset.owner_id is distinct from actor_snapshot.profile_id
      or media_asset.purpose is distinct from 'chat_attachment'
      or media_asset.visibility is distinct from 'conversation_members'
      or media_asset.status is distinct from 'ready'
      or media_asset.moderation_status is distinct from 'approved'
      or media_asset.deleted_at is not null
    then
      raise exception 'Media asset is not ready for this conversation'
        using errcode = '42501', detail = 'media_asset_unavailable';
    end if;
  end if;

  select member.player_id_v1 into recipient_player_id
  from public.conversation_members as member
  where member.conversation_id = conversation.id
    and member.player_id_v1 is not null
    and member.player_id_v1 <> actor_snapshot.player_id;

  if recipient_player_id is null then
    raise exception 'Conversation requires exactly one recipient'
      using errcode = '22023', detail = 'conversation_contract_violation';
  end if;

  select * into recipient_member
  from public.conversation_members
  where conversation_id = conversation.id
    and player_id_v1 = recipient_player_id
  for update;

  next_sequence := conversation.last_sequence_v1 + 1;

  insert into public.messages (
    conversation_id,
    sender_id,
    body,
    schema_version_v1,
    sender_account_id_v1,
    sender_player_id_v1,
    client_message_id_v1,
    sequence_v1,
    content_kind_v1,
    content_v1,
    media_asset_id_v1,
    correlation_id_v1,
    request_fingerprint_v1
  )
  values (
    conversation.id,
    actor_snapshot.profile_id,
    compatibility_body,
    1,
    actor_account_id,
    actor_snapshot.player_id,
    p_client_message_id,
    next_sequence,
    content_kind,
    canonical_content,
    media_asset_id,
    p_correlation_id,
    request_fingerprint
  )
  returning * into created_message;

  update public.conversations
  set last_sequence_v1 = next_sequence,
      last_message_at = created_message.created_at,
      version_v1 = version_v1 + 1
  where id = conversation.id;

  unread_count := private.conversation_unread_count_v1(
    conversation.id,
    recipient_player_id,
    recipient_member.last_read_sequence_v1
  );

  message_event_id := private.enqueue_contract_event_v1(
    'message.sent.v1',
    'conversation',
    conversation.id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'message', private.message_json_v1(created_message),
      'recipientPlayerIds', jsonb_build_array(recipient_player_id)
    ),
    format('message.sent.v1:%s', created_message.id)
  );

  perform private.enqueue_contract_event_v1(
    'notification.requested.v1',
    'player',
    recipient_player_id,
    p_correlation_id,
    message_event_id,
    jsonb_build_object(
      'recipientPlayerId', recipient_player_id,
      'reasonCode', 'message_received',
      'target', jsonb_build_object(
        'kind', 'conversation',
        'conversationId', conversation.id,
        'messageId', created_message.id,
        'senderPlayerId', actor_snapshot.player_id,
        'authoritativeUnreadCount', unread_count,
        'foregroundPolicy', 'allow_push'
      )
    ),
    format(
      'notification.requested.v1:message_received:%s:%s',
      created_message.id,
      recipient_player_id
    )
  );

  return jsonb_build_object(
    'message', private.message_json_v1(created_message),
    'repeated', false
  );
exception
  when invalid_text_representation then
    raise exception 'Invalid send-message content kind'
      using errcode = '22023', detail = 'validation_failed';
end;
$$;

create or replace function public.advance_conversation_read_v1(
  p_conversation_id uuid,
  p_last_read_sequence bigint,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.messaging_player_snapshot_v1;
  conversation public.conversations%rowtype;
  member public.conversation_members%rowtype;
  unread_count integer;
  updated_at timestamptz;
  event_id uuid;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_conversation_id is null
    or p_last_read_sequence is null
    or p_last_read_sequence < 0
    or p_correlation_id is null
  then
    raise exception 'Invalid read-watermark command'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  if not private.conversation_reads_enabled_v1() then
    raise exception 'Conversation reads are disabled'
      using errcode = '55000', detail = 'conversation_reads_disabled';
  end if;

  actor_snapshot := private.require_messaging_snapshot_by_account_v1(
    actor_account_id,
    false
  );

  select * into conversation
  from public.conversations
  where id = p_conversation_id;

  if conversation.id is null then
    raise exception 'Conversation not found'
      using errcode = 'P0002', detail = 'conversation_not_found';
  end if;

  if p_last_read_sequence > conversation.last_sequence_v1 then
    raise exception 'Read watermark exceeds the conversation sequence'
      using errcode = '22023', detail = 'read_sequence_invalid';
  end if;

  select * into member
  from public.conversation_members
  where conversation_id = conversation.id
    and player_id_v1 = actor_snapshot.player_id
  for update;

  if member.conversation_id is null then
    raise exception 'Conversation membership required'
      using errcode = '42501', detail = 'conversation_forbidden';
  end if;

  if p_last_read_sequence <= member.last_read_sequence_v1 then
    unread_count := private.conversation_unread_count_v1(
      conversation.id,
      actor_snapshot.player_id,
      member.last_read_sequence_v1
    );

    return jsonb_build_object(
      'readState', jsonb_build_object(
        'conversationId', conversation.id,
        'playerId', actor_snapshot.player_id,
        'lastReadSequence', member.last_read_sequence_v1,
        'unreadCount', unread_count,
        'updatedAt', coalesce(member.last_read_at, member.created_at)
      ),
      'repeated', true
    );
  end if;

  updated_at := now();
  update public.conversation_members
  set last_read_sequence_v1 = p_last_read_sequence,
      last_read_at = updated_at,
      read_version_v1 = read_version_v1 + 1
  where conversation_id = conversation.id
    and player_id_v1 = actor_snapshot.player_id
  returning * into member;

  unread_count := private.conversation_unread_count_v1(
    conversation.id,
    actor_snapshot.player_id,
    member.last_read_sequence_v1
  );

  event_id := private.enqueue_contract_event_v1(
    'conversation.read_advanced.v1',
    'conversation',
    conversation.id,
    p_correlation_id,
    null,
    jsonb_build_object(
      'readState', jsonb_build_object(
        'conversationId', conversation.id,
        'playerId', actor_snapshot.player_id,
        'lastReadSequence', member.last_read_sequence_v1,
        'unreadCount', unread_count,
        'updatedAt', updated_at
      )
    ),
    format(
      'conversation.read_advanced.v1:%s:%s:%s',
      conversation.id,
      actor_snapshot.player_id,
      member.last_read_sequence_v1
    )
  );

  return jsonb_build_object(
    'readState', jsonb_build_object(
      'conversationId', conversation.id,
      'playerId', actor_snapshot.player_id,
      'lastReadSequence', member.last_read_sequence_v1,
      'unreadCount', unread_count,
      'updatedAt', updated_at
    ),
    'eventId', event_id,
    'repeated', false
  );
end;
$$;

create or replace function public.get_conversation_inbox_v1(
  p_limit integer default 30,
  p_before_last_message_at timestamptz default null,
  p_before_conversation_id uuid default null
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.messaging_player_snapshot_v1;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if not private.conversation_reads_enabled_v1() then
    raise exception 'Conversation reads are disabled'
      using errcode = '55000', detail = 'conversation_reads_disabled';
  end if;

  actor_snapshot := private.require_messaging_snapshot_by_account_v1(
    actor_account_id,
    false
  );

  return query
  select private.conversation_snapshot_json_v1(
    conversation.id,
    actor_snapshot.player_id
  )
  from public.conversation_members as member
  join public.conversations as conversation
    on conversation.id = member.conversation_id
  where member.player_id_v1 = actor_snapshot.player_id
    and (
      p_before_last_message_at is null
      or (
        coalesce(conversation.last_message_at, conversation.created_at),
        conversation.id
      ) < (p_before_last_message_at, p_before_conversation_id)
    )
  order by
    coalesce(conversation.last_message_at, conversation.created_at) desc,
    conversation.id desc
  limit safe_limit;
end;
$$;

create or replace function public.get_conversation_timeline_v1(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before_sequence bigint default null,
  p_after_sequence bigint default null
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.messaging_player_snapshot_v1;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_before_sequence is not null and p_after_sequence is not null then
    raise exception 'Choose either beforeSequence or afterSequence'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  if not private.conversation_reads_enabled_v1() then
    raise exception 'Conversation reads are disabled'
      using errcode = '55000', detail = 'conversation_reads_disabled';
  end if;

  actor_snapshot := private.require_messaging_snapshot_by_account_v1(
    actor_account_id,
    false
  );

  if not private.is_conversation_player_member_v1(
    p_conversation_id,
    actor_snapshot.player_id
  ) then
    raise exception 'Conversation membership required'
      using errcode = '42501', detail = 'conversation_forbidden';
  end if;

  if p_after_sequence is not null then
    return query
    select private.message_json_v1(message)
    from public.messages as message
    where message.conversation_id = p_conversation_id
      and message.schema_version_v1 = 1
      and message.deleted_at is null
      and message.sequence_v1 > p_after_sequence
    order by message.sequence_v1
    limit safe_limit;
    return;
  end if;

  return query
  select page.message_json
  from (
    select
      private.message_json_v1(message) as message_json,
      message.sequence_v1
    from public.messages as message
    where message.conversation_id = p_conversation_id
      and message.schema_version_v1 = 1
      and message.deleted_at is null
      and (
        p_before_sequence is null
        or message.sequence_v1 < p_before_sequence
      )
    order by message.sequence_v1 desc
    limit safe_limit
  ) as page
  order by page.sequence_v1;
end;
$$;

create or replace function public.get_conversation_read_state_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.messaging_player_snapshot_v1;
  member public.conversation_members%rowtype;
  unread_count integer;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if not private.conversation_reads_enabled_v1() then
    raise exception 'Conversation reads are disabled'
      using errcode = '55000', detail = 'conversation_reads_disabled';
  end if;

  actor_snapshot := private.require_messaging_snapshot_by_account_v1(
    actor_account_id,
    false
  );

  select * into member
  from public.conversation_members
  where conversation_id = p_conversation_id
    and player_id_v1 = actor_snapshot.player_id;

  if member.conversation_id is null then
    raise exception 'Conversation membership required'
      using errcode = '42501', detail = 'conversation_forbidden';
  end if;

  unread_count := private.conversation_unread_count_v1(
    p_conversation_id,
    actor_snapshot.player_id,
    member.last_read_sequence_v1
  );

  return jsonb_build_object(
    'conversationId', p_conversation_id,
    'playerId', actor_snapshot.player_id,
    'lastReadSequence', member.last_read_sequence_v1,
    'unreadCount', unread_count,
    'updatedAt', coalesce(member.last_read_at, member.created_at)
  );
end;
$$;

create or replace function public.get_conversation_unread_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.messaging_player_snapshot_v1;
  conversation_count integer;
  unread_count integer;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if not private.conversation_reads_enabled_v1() then
    raise exception 'Conversation reads are disabled'
      using errcode = '55000', detail = 'conversation_reads_disabled';
  end if;

  actor_snapshot := private.require_messaging_snapshot_by_account_v1(
    actor_account_id,
    false
  );

  select
    count(*) filter (where member_unread.unread_count > 0)::integer,
    coalesce(sum(member_unread.unread_count), 0)::integer
  into conversation_count, unread_count
  from (
    select private.conversation_unread_count_v1(
      member.conversation_id,
      actor_snapshot.player_id,
      member.last_read_sequence_v1
    ) as unread_count
    from public.conversation_members as member
    where member.player_id_v1 = actor_snapshot.player_id
  ) as member_unread;

  return jsonb_build_object(
    'conversationCount', conversation_count,
    'unreadCount', unread_count
  );
end;
$$;

create or replace function public.can_access_conversation_media_v1(
  p_media_asset_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.messaging_player_snapshot_v1;
begin
  if actor_account_id is null then return false; end if;

  begin
    actor_snapshot := private.require_messaging_snapshot_by_account_v1(
      actor_account_id,
      false
    );
  exception
    when others then return false;
  end;

  return exists (
    select 1
    from public.messages as message
    where message.media_asset_id_v1 = p_media_asset_id
      and message.schema_version_v1 = 1
      and message.deleted_at is null
      and private.is_conversation_player_member_v1(
        message.conversation_id,
        actor_snapshot.player_id
      )
  );
end;
$$;

create or replace function public.can_subscribe_conversation_v1(
  p_topic text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.messaging_player_snapshot_v1;
  conversation_id uuid;
begin
  if actor_account_id is null
    or not private.conversation_realtime_enabled_v1()
    or p_topic !~ '^conversation:[0-9a-fA-F-]{36}$'
  then
    return false;
  end if;

  begin
    conversation_id := substring(p_topic from 14)::uuid;
    actor_snapshot := private.require_messaging_snapshot_by_account_v1(
      actor_account_id,
      false
    );
  exception
    when others then return false;
  end;

  return private.is_conversation_player_member_v1(
    conversation_id,
    actor_snapshot.player_id
  );
end;
$$;

create or replace function private.broadcast_conversation_message_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.schema_version_v1 = 1
    and private.conversation_realtime_enabled_v1()
  then
    perform realtime.broadcast_changes(
      'conversation:' || new.conversation_id::text,
      'message.changed',
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  end if;
  return null;
end;
$$;

create trigger messages_broadcast_v1
  after insert or update on public.messages
  for each row execute function private.broadcast_conversation_message_v1();

drop policy if exists "Conversation members can insert own messages" on public.messages;
revoke insert on public.messages from authenticated;

-- Replace the legacy body-string media association with an authoritative FK.
drop policy if exists "Conversation members can read ready conversation media metadata"
  on public.media_assets;
create policy "Conversation members can read ready conversation media metadata v1"
on public.media_assets for select
to authenticated
using (
  visibility = 'conversation_members'
  and status = 'ready'
  and moderation_status = 'approved'
  and deleted_at is null
  and public.can_access_conversation_media_v1(id)
);

-- Realtime Broadcast authorization is evaluated against authoritative player
-- membership. Clients must subscribe with private=true and refresh the JWT on
-- the realtime socket when the application session changes.
drop policy if exists "Conversation members receive v1 broadcasts"
  on realtime.messages;
create policy "Conversation members receive v1 broadcasts"
on realtime.messages for select
to authenticated
using (
  extension = 'broadcast'
  and public.can_subscribe_conversation_v1(realtime.topic())
);

revoke execute on function public.consume_conversation_bootstrap_event_v1(uuid)
  from public, anon, authenticated;
revoke execute on function public.process_pending_conversation_bootstraps_v1(integer)
  from public, anon, authenticated;
grant execute on function public.consume_conversation_bootstrap_event_v1(uuid)
  to service_role;
grant execute on function public.process_pending_conversation_bootstraps_v1(integer)
  to service_role;

revoke execute on function public.send_message_v1(uuid, text, jsonb, timestamptz, uuid)
  from public, anon;
revoke execute on function public.advance_conversation_read_v1(uuid, bigint, uuid)
  from public, anon;
revoke execute on function public.get_conversation_inbox_v1(integer, timestamptz, uuid)
  from public, anon;
revoke execute on function public.get_conversation_timeline_v1(uuid, integer, bigint, bigint)
  from public, anon;
revoke execute on function public.get_conversation_read_state_v1(uuid)
  from public, anon;
revoke execute on function public.get_conversation_unread_summary_v1()
  from public, anon;
revoke execute on function public.can_access_conversation_media_v1(uuid)
  from public, anon;
revoke execute on function public.can_subscribe_conversation_v1(text)
  from public, anon;

grant execute on function public.send_message_v1(uuid, text, jsonb, timestamptz, uuid)
  to authenticated;
grant execute on function public.advance_conversation_read_v1(uuid, bigint, uuid)
  to authenticated;
grant execute on function public.get_conversation_inbox_v1(integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.get_conversation_timeline_v1(uuid, integer, bigint, bigint)
  to authenticated;
grant execute on function public.get_conversation_read_state_v1(uuid)
  to authenticated;
grant execute on function public.get_conversation_unread_summary_v1()
  to authenticated;
grant execute on function public.can_access_conversation_media_v1(uuid)
  to authenticated;
grant execute on function public.can_subscribe_conversation_v1(text)
  to authenticated;

comment on function public.consume_conversation_bootstrap_event_v1(uuid) is
  'Service-role consumer for conversation.bootstrap_requested.v1. Idempotent by authoritative MatchId.';
comment on function public.send_message_v1(uuid, text, jsonb, timestamptz, uuid) is
  'Authoritative text/media message append. Idempotent by conversation, sender PlayerId and clientMessageId.';
comment on function public.advance_conversation_read_v1(uuid, bigint, uuid) is
  'Monotonically advances the authoritative per-player read sequence and emits conversation.read_advanced.v1 once.';
comment on function public.get_conversation_timeline_v1(uuid, integer, bigint, bigint) is
  'Canonical sequence timeline query. afterSequence is the realtime reconnect and gap-recovery path.';
