-- Core V2 Conversation Authority
--
-- Additive production authority for direct and play-session conversations.
-- Core V1 PlayerId/lifecycle remains the only identity authority. V1 direct
-- conversation history is mapped in place and is never rewritten or deleted.

create type public.conversation_kind_v2 as enum ('direct', 'group', 'system');
create type public.conversation_state_v2 as enum ('open', 'tombstoned');
create type public.conversation_source_type_v2 as enum (
  'direct_match',
  'friendship',
  'play_session',
  'system'
);
create type public.conversation_member_role_v2 as enum ('owner', 'member', 'system');
create type public.conversation_member_state_v2 as enum ('active', 'revoked');
create type public.conversation_access_reason_v2 as enum (
  'active_member',
  'blocked',
  'lifecycle_forbidden',
  'not_a_member',
  'source_membership_revoked',
  'conversation_tombstoned'
);
create type public.message_kind_v2 as enum ('text', 'media', 'system');
create type public.message_receipt_state_v2 as enum ('queued', 'delivered', 'read');

create table public.conversations_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  kind public.conversation_kind_v2 not null,
  state public.conversation_state_v2 not null default 'open',
  title text check (title is null or char_length(btrim(title)) between 1 and 160),
  version bigint not null default 1 check (version > 0),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  legacy_conversation_id uuid unique references public.conversations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tombstoned_at timestamptz,
  constraint conversations_v2_state_timestamp_check check (
    (state = 'open' and tombstoned_at is null)
    or (state = 'tombstoned' and tombstoned_at is not null)
  )
);

create table public.conversation_sources_v2 (
  conversation_id uuid not null references public.conversations_v2(id) on delete restrict,
  source_type public.conversation_source_type_v2 not null,
  source_id uuid not null,
  source_aggregate_version bigint not null check (source_aggregate_version > 0),
  bound_at timestamptz not null default now(),
  primary key (conversation_id, source_type, source_id),
  unique (source_type, source_id)
);

create table public.conversation_members_v2 (
  conversation_id uuid not null references public.conversations_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  role public.conversation_member_role_v2 not null default 'member',
  state public.conversation_member_state_v2 not null default 'active',
  can_message boolean not null default true,
  can_view_conversation boolean not null default true,
  membership_version bigint not null check (membership_version > 0),
  version bigint not null default 1 check (version > 0),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason public.conversation_access_reason_v2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, player_id),
  constraint conversation_members_v2_state_check check (
    (
      state = 'active'
      and revoked_at is null
      and revocation_reason is null
    )
    or (
      state = 'revoked'
      and revoked_at is not null
      and revocation_reason in ('blocked', 'source_membership_revoked')
      and can_message = false
    )
  )
);

create table public.messages_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.conversations_v2(id) on delete restrict,
  sender_player_id uuid references public.players(id) on delete restrict,
  client_message_id text not null check (
    char_length(client_message_id) between 16 and 128
    and client_message_id ~ '^[A-Za-z0-9._:-]+$'
  ),
  sequence bigint not null check (sequence > 0),
  kind public.message_kind_v2 not null,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  content_fingerprint text not null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  source_event_id uuid,
  source_event_type text,
  source_event_version integer,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  tombstoned_at timestamptz,
  constraint messages_v2_content_shape_check check (
    (
      kind = 'text'
      and sender_player_id is not null
      and content ->> 'kind' = 'text'
      and char_length(content ->> 'text') between 1 and 4000
      and media_asset_id is null
      and source_event_id is null
    )
    or (
      kind = 'media'
      and sender_player_id is not null
      and content ->> 'kind' = 'media'
      and nullif(content ->> 'assetId', '') is not null
      and media_asset_id is not null
      and source_event_id is null
    )
    or (
      kind = 'system'
      and sender_player_id is null
      and content ->> 'kind' = 'system'
      and source_event_id is not null
      and source_event_type is not null
      and source_event_version is not null
      and source_event_version > 0
      and media_asset_id is null
    )
  ),
  unique (conversation_id, sequence),
  unique (conversation_id, sender_player_id, client_message_id),
  unique (conversation_id, source_event_id)
);

create table public.message_receipts_v2 (
  message_id uuid not null references public.messages_v2(id) on delete restrict,
  recipient_player_id uuid not null references public.players(id) on delete restrict,
  state public.message_receipt_state_v2 not null default 'queued',
  version bigint not null default 1 check (version > 0),
  queued_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (message_id, recipient_player_id),
  constraint message_receipts_v2_state_time_check check (
    (state = 'queued' and delivered_at is null and read_at is null)
    or (state = 'delivered' and delivered_at is not null and read_at is null)
    or (state = 'read' and delivered_at is not null and read_at is not null)
  )
);

create table public.conversation_read_cursors_v2 (
  conversation_id uuid not null references public.conversations_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  last_read_sequence bigint not null default 0 check (last_read_sequence >= 0),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, player_id)
);

create table public.conversation_mutes_v2 (
  conversation_id uuid not null references public.conversations_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  muted boolean not null default true,
  relationship_muted boolean not null default false,
  version bigint not null default 1 check (version > 0),
  muted_at timestamptz,
  relationship_muted_at timestamptz,
  unmuted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, player_id),
  constraint conversation_mutes_v2_time_check check (
    (muted and muted_at is not null and unmuted_at is null)
    or (not muted and unmuted_at is not null)
  )
);

create table public.message_report_evidence_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  report_id uuid not null unique references public.reports_v2(id) on delete restrict,
  conversation_id uuid not null references public.conversations_v2(id) on delete restrict,
  message_id uuid not null references public.messages_v2(id) on delete restrict,
  reporter_player_id uuid not null references public.players(id) on delete restrict,
  sender_player_id uuid references public.players(id) on delete restrict,
  message_sequence bigint not null check (message_sequence > 0),
  content_kind public.message_kind_v2 not null,
  content_snapshot jsonb not null check (jsonb_typeof(content_snapshot) = 'object'),
  content_fingerprint text not null,
  message_created_at timestamptz not null,
  message_tombstoned_at timestamptz,
  captured_at timestamptz not null default now()
);

create table private.conversation_direct_pairs_v2 (
  player_low_id uuid not null references public.players(id) on delete restrict,
  player_high_id uuid not null references public.players(id) on delete restrict,
  conversation_id uuid not null unique references public.conversations_v2(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (player_low_id, player_high_id),
  check (player_low_id < player_high_id)
);

create table private.conversation_service_command_receipts_v2 (
  command_name text not null,
  idempotency_key text not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (command_name, idempotency_key),
  check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  )
);

create table private.conversation_consumed_events_v2 (
  event_id uuid primary key,
  event_type text not null,
  event_version integer not null check (event_version = 2),
  payload_fingerprint text not null,
  response jsonb not null,
  processed_at timestamptz not null default now()
);

create table private.conversation_relationship_versions_v2 (
  relationship_id uuid primary key,
  observed_version bigint not null check (observed_version >= 0),
  updated_at timestamptz not null default now()
);

create table private.conversation_authority_config_v2 (
  singleton boolean primary key default true check (singleton),
  reads_enabled boolean not null default true,
  writes_enabled boolean not null default true,
  provisioning_enabled boolean not null default true,
  realtime_enabled boolean not null default true,
  notifications_enabled boolean not null default false,
  shadow_inbox_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into private.conversation_authority_config_v2 (singleton) values (true);

create table private.conversation_authority_metrics_v2 (
  id bigint generated always as identity primary key,
  metric_name text not null,
  conversation_id uuid,
  actor_player_id uuid,
  value integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index conversation_members_v2_active_owner_idx
  on public.conversation_members_v2 (conversation_id)
  where state = 'active' and role = 'owner';
create index conversation_members_v2_player_inbox_idx
  on public.conversation_members_v2 (player_id, conversation_id)
  where state = 'active' and can_view_conversation;
create index messages_v2_timeline_idx
  on public.messages_v2 (conversation_id, sequence desc);
create index message_receipts_v2_recipient_state_idx
  on public.message_receipts_v2 (recipient_player_id, state, updated_at desc);
create index message_report_evidence_v2_message_idx
  on public.message_report_evidence_v2 (message_id, captured_at desc);
create index conversation_authority_metrics_v2_name_time_idx
  on private.conversation_authority_metrics_v2 (metric_name, occurred_at desc);

alter table public.conversations_v2 enable row level security;
alter table public.conversation_sources_v2 enable row level security;
alter table public.conversation_members_v2 enable row level security;
alter table public.messages_v2 enable row level security;
alter table public.message_receipts_v2 enable row level security;
alter table public.conversation_read_cursors_v2 enable row level security;
alter table public.conversation_mutes_v2 enable row level security;
alter table public.message_report_evidence_v2 enable row level security;

revoke all on public.conversations_v2 from public, anon, authenticated;
revoke all on public.conversation_sources_v2 from public, anon, authenticated;
revoke all on public.conversation_members_v2 from public, anon, authenticated;
revoke all on public.messages_v2 from public, anon, authenticated;
revoke all on public.message_receipts_v2 from public, anon, authenticated;
revoke all on public.conversation_read_cursors_v2 from public, anon, authenticated;
revoke all on public.conversation_mutes_v2 from public, anon, authenticated;
revoke all on public.message_report_evidence_v2 from public, anon, authenticated;
revoke all on private.conversation_direct_pairs_v2 from public, anon, authenticated;
revoke all on private.conversation_service_command_receipts_v2 from public, anon, authenticated;
revoke all on private.conversation_consumed_events_v2 from public, anon, authenticated;
revoke all on private.conversation_relationship_versions_v2 from public, anon, authenticated;
revoke all on private.conversation_authority_config_v2 from public, anon, authenticated;
revoke all on private.conversation_authority_metrics_v2 from public, anon, authenticated;

grant all on public.conversations_v2 to service_role;
grant all on public.conversation_sources_v2 to service_role;
grant all on public.conversation_members_v2 to service_role;
grant all on public.messages_v2 to service_role;
grant all on public.message_receipts_v2 to service_role;
grant all on public.conversation_read_cursors_v2 to service_role;
grant all on public.conversation_mutes_v2 to service_role;
grant all on public.message_report_evidence_v2 to service_role;
grant all on private.conversation_direct_pairs_v2 to service_role;
grant all on private.conversation_service_command_receipts_v2 to service_role;
grant all on private.conversation_consumed_events_v2 to service_role;
grant all on private.conversation_relationship_versions_v2 to service_role;
grant all on private.conversation_authority_config_v2 to service_role;
grant all on private.conversation_authority_metrics_v2 to service_role;

create trigger conversations_v2_set_updated_at
before update on public.conversations_v2
for each row execute function public.set_updated_at();
create trigger conversation_members_v2_set_updated_at
before update on public.conversation_members_v2
for each row execute function public.set_updated_at();
create trigger message_receipts_v2_set_updated_at
before update on public.message_receipts_v2
for each row execute function public.set_updated_at();
create trigger conversation_authority_config_v2_set_updated_at
before update on private.conversation_authority_config_v2
for each row execute function public.set_updated_at();

create or replace function private.assert_conversation_feature_v2(p_feature text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config private.conversation_authority_config_v2%rowtype;
  enabled boolean;
begin
  select * into config
  from private.conversation_authority_config_v2
  where singleton;

  enabled := case p_feature
    when 'read' then config.reads_enabled
    when 'write' then config.writes_enabled
    when 'provision' then config.provisioning_enabled
    when 'realtime' then config.realtime_enabled
    when 'notification' then config.notifications_enabled
    when 'shadow_inbox' then config.shadow_inbox_enabled
    else false
  end;
  if not coalesce(enabled, false) then
    perform private.raise_core_error_v1(
      'conversation_feature_disabled',
      'The requested Conversation V2 capability is disabled.',
      true,
      jsonb_build_object('feature', p_feature)
    );
  end if;
end;
$$;

create or replace function private.resolve_conversation_actor_v2(
  p_require_send boolean default false,
  p_lock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  lifecycle jsonb;
begin
  actor := private.resolve_social_actor_v2(true, p_lock);
  lifecycle := actor -> 'lifecycle';
  if p_require_send and coalesce((lifecycle ->> 'messagingAllowed')::boolean, false) is not true then
    perform private.raise_core_error_v1(
      'conversation_lifecycle_forbidden',
      'The authenticated player is not allowed to send messages.',
      false,
      jsonb_build_object(
        'state', lifecycle ->> 'state',
        'lifecycleVersion', lifecycle ->> 'version'
      )
    );
  end if;
  return actor;
end;
$$;

create or replace function private.require_conversation_service_v2()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    perform private.raise_core_error_v1(
      'conversation_service_forbidden',
      'Conversation provisioning and source reconciliation require service role.'
    );
  end if;
end;
$$;

create or replace function private.validate_conversation_metadata_v2(
  p_metadata jsonb,
  p_creation boolean default false
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  expected_version bigint;
  correlation_id uuid;
  causation_id uuid;
  audit jsonb;
begin
  if jsonb_typeof(p_metadata) is distinct from 'object'
    or nullif(p_metadata ->> 'idempotencyKey', '') is null
    or nullif(p_metadata ->> 'correlationId', '') is null
    or not (p_metadata ? 'expectedAggregateVersion')
    or jsonb_typeof(p_metadata -> 'audit') is distinct from 'object'
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation command metadata is incomplete.'
    );
  end if;

  begin
    correlation_id := (p_metadata ->> 'correlationId')::uuid;
    causation_id := nullif(p_metadata ->> 'causationId', '')::uuid;
    expected_version := (p_metadata ->> 'expectedAggregateVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation command metadata contains invalid identifiers or versions.'
    );
  end;
  if expected_version < 0 or (p_creation and expected_version <> 0) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation expectedAggregateVersion is invalid.'
    );
  end if;

  audit := p_metadata -> 'audit';
  if nullif(audit ->> 'requestId', '') is null
    or nullif(audit ->> 'clientCreatedAt', '') is null
    or audit ->> 'clientPlatform' not in ('android', 'ios', 'web', 'service', 'simulation')
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation audit metadata is incomplete.'
    );
  end if;
  begin
    perform (audit ->> 'clientCreatedAt')::timestamptz;
    if nullif(audit ->> 'installationId', '') is not null then
      perform (audit ->> 'installationId')::uuid;
    end if;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation audit metadata contains invalid timestamps or identifiers.'
    );
  end;

  return jsonb_build_object(
    'idempotencyKey', p_metadata ->> 'idempotencyKey',
    'correlationId', correlation_id,
    'causationId', causation_id,
    'expectedAggregateVersion', expected_version,
    'audit', audit
  );
end;
$$;

create or replace function private.begin_conversation_command_v2(
  p_command_name text,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  metadata jsonb;
  receipt record;
  account_id uuid;
  request_hash text;
begin
  perform private.assert_conversation_feature_v2('write');
  metadata := private.validate_conversation_metadata_v2(p_command -> 'metadata', false);
  actor := private.resolve_conversation_actor_v2(false, true);
  account_id := (actor ->> 'accountId')::uuid;
  request_hash := private.command_request_hash_v1(p_command);

  select * into receipt
  from private.begin_command_v1(
    p_command_name,
    account_id,
    metadata ->> 'idempotencyKey',
    request_hash
  );

  return actor || jsonb_build_object(
    'metadata', metadata,
    'accountId', account_id,
    'playerId', actor ->> 'playerId',
    'repeated', receipt.repeated,
    'response', receipt.response
  );
end;
$$;

create or replace function private.finish_conversation_command_v2(
  p_command_name text,
  p_context jsonb,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.finish_command_v1(
    p_command_name,
    (p_context ->> 'accountId')::uuid,
    p_context #>> '{metadata,idempotencyKey}',
    p_response
  );
  insert into private.audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    (p_context ->> 'accountId')::uuid,
    p_command_name,
    'conversation_v2',
    nullif(p_response ->> 'conversationId', '')::uuid,
    jsonb_build_object(
      'actorPlayerId', p_context ->> 'playerId',
      'correlationId', p_context #>> '{metadata,correlationId}',
      'causationId', p_context #>> '{metadata,causationId}',
      'audit', p_context #> '{metadata,audit}',
      'receipt', p_response
    )
  );
  return p_response;
end;
$$;

create or replace function private.begin_conversation_service_command_v2(
  p_command_name text,
  p_command jsonb,
  p_creation boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb;
  request_hash text;
  inserted_count integer;
  existing_hash text;
  existing_response jsonb;
begin
  perform private.require_conversation_service_v2();
  perform private.assert_conversation_feature_v2('provision');
  metadata := private.validate_conversation_metadata_v2(p_command -> 'metadata', p_creation);
  request_hash := private.command_request_hash_v1(p_command);

  insert into private.conversation_service_command_receipts_v2 (
    command_name,
    idempotency_key,
    request_hash
  ) values (
    p_command_name,
    metadata ->> 'idempotencyKey',
    request_hash
  ) on conflict (command_name, idempotency_key) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select receipts.request_hash, receipts.response
      into existing_hash, existing_response
    from private.conversation_service_command_receipts_v2 receipts
    where receipts.command_name = p_command_name
      and receipts.idempotency_key = metadata ->> 'idempotencyKey'
    for update;
    if existing_hash is distinct from request_hash then
      perform private.raise_core_error_v1(
        'idempotency_key_reused',
        'The service idempotency key was already used with different facts.'
      );
    end if;
    if existing_response is null then
      perform private.raise_core_error_v1(
        'service_unavailable',
        'The original service command has no durable receipt yet.',
        true
      );
    end if;
    return jsonb_build_object(
      'metadata', metadata,
      'repeated', true,
      'response', jsonb_set(existing_response, '{repeated}', 'true'::jsonb, true)
    );
  end if;

  return jsonb_build_object('metadata', metadata, 'repeated', false, 'response', null);
end;
$$;

create or replace function private.finish_conversation_service_command_v2(
  p_command_name text,
  p_context jsonb,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.conversation_service_command_receipts_v2
  set response = p_response,
      completed_at = now()
  where command_name = p_command_name
    and idempotency_key = p_context #>> '{metadata,idempotencyKey}';

  insert into private.audit_logs (action, target_type, target_id, metadata)
  values (
    p_command_name,
    'conversation_v2',
    nullif(p_response ->> 'conversationId', '')::uuid,
    jsonb_build_object(
      'actorPlayerId', p_response ->> 'actorPlayerId',
      'correlationId', p_context #>> '{metadata,correlationId}',
      'causationId', p_context #>> '{metadata,causationId}',
      'audit', p_context #> '{metadata,audit}',
      'receipt', p_response
    )
  );
  return p_response;
end;
$$;

create or replace function private.conversation_source_json_v2(p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sourceType', sources.source_type,
    'sourceId', sources.source_id,
    'sourceAggregateVersion', sources.source_aggregate_version
  )
  from public.conversation_sources_v2 sources
  where sources.conversation_id = p_conversation_id
  order by case sources.source_type
    when 'play_session' then 0
    when 'friendship' then 1
    when 'direct_match' then 2
    else 3
  end
  limit 1;
$$;

create or replace function private.conversation_membership_json_v2(p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'membershipVersion', coalesce(max(members.membership_version), 1),
    'members', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'playerId', members.player_id,
          'role', members.role,
          'state', members.state,
          'canMessage', members.can_message,
          'canViewConversation', members.can_view_conversation,
          'membershipVersion', members.membership_version,
          'version', members.version,
          'joinedAt', members.joined_at,
          'revokedAt', members.revoked_at,
          'revocationReason', members.revocation_reason
        ) order by
          case when members.role = 'owner' then 0 else 1 end,
          members.joined_at,
          members.player_id
      ),
      '[]'::jsonb
    )
  )
  from public.conversation_members_v2 members
  where members.conversation_id = p_conversation_id;
$$;

create or replace function private.session_conversation_membership_projection_v2(
  p_conversation_id uuid,
  p_session_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sessionId', p_session_id,
    'membershipVersion', coalesce(max(members.membership_version), 1),
    'members', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'playerId', members.player_id,
          'role', members.role
        ) order by
          case when members.role = 'owner' then 0 else 1 end,
          members.player_id
      ) filter (where members.state = 'active'),
      '[]'::jsonb
    )
  )
  from public.conversation_members_v2 members
  where members.conversation_id = p_conversation_id;
$$;

create or replace function private.conversation_snapshot_v2(p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'conversationId', conversations.id,
    'kind', conversations.kind,
    'source', private.conversation_source_json_v2(conversations.id),
    'sources', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sourceType', sources.source_type,
            'sourceId', sources.source_id,
            'sourceAggregateVersion', sources.source_aggregate_version,
            'boundAt', sources.bound_at
          ) order by sources.bound_at, sources.source_type
        )
        from public.conversation_sources_v2 sources
        where sources.conversation_id = conversations.id
      ),
      '[]'::jsonb
    ),
    'state', conversations.state,
    'title', conversations.title,
    'version', conversations.version,
    'lastSequence', conversations.last_sequence,
    'legacyConversationId', conversations.legacy_conversation_id,
    'createdAt', conversations.created_at,
    'updatedAt', conversations.updated_at,
    'tombstonedAt', conversations.tombstoned_at,
    'membership', private.conversation_membership_json_v2(conversations.id)
  )
  from public.conversations_v2 conversations
  where conversations.id = p_conversation_id;
$$;

create or replace function private.conversation_access_v2(
  p_conversation_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conversation public.conversations_v2%rowtype;
  member public.conversation_members_v2%rowtype;
  player public.players%rowtype;
  reason public.conversation_access_reason_v2 := 'active_member';
  can_read boolean := false;
  can_send boolean := false;
  can_subscribe boolean := false;
begin
  select * into conversation from public.conversations_v2 where id = p_conversation_id;
  select * into member
  from public.conversation_members_v2
  where conversation_id = p_conversation_id and player_id = p_player_id;
  select * into player from public.players where id = p_player_id;

  if conversation.id is null or member.player_id is null then
    reason := 'not_a_member';
  elsif member.state = 'revoked' then
    reason := coalesce(member.revocation_reason, 'source_membership_revoked');
  elsif conversation.state = 'tombstoned' then
    reason := 'conversation_tombstoned';
  elsif player.lifecycle_state <> 'active' or not player.messaging_allowed then
    reason := 'lifecycle_forbidden';
  else
    can_read := member.can_view_conversation;
    can_send := member.can_view_conversation and member.can_message;
    can_subscribe := member.can_view_conversation and member.can_message;
    if not can_read then reason := 'source_membership_revoked'; end if;
  end if;

  return jsonb_build_object(
    'conversationId', p_conversation_id,
    'playerId', p_player_id,
    'canRead', can_read,
    'canSend', can_send,
    'canSubscribe', can_subscribe,
    'reason', reason,
    'conversationVersion', coalesce(conversation.version, 0),
    'sourceAggregateVersion', coalesce(
      (private.conversation_source_json_v2(p_conversation_id) ->> 'sourceAggregateVersion')::bigint,
      0
    ),
    'membershipVersion', coalesce(member.membership_version, 0)
  );
end;
$$;

create or replace function private.assert_conversation_access_v2(
  p_conversation_id uuid,
  p_player_id uuid,
  p_capability text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access jsonb := private.conversation_access_v2(p_conversation_id, p_player_id);
  allowed boolean;
begin
  allowed := case p_capability
    when 'read' then coalesce((access ->> 'canRead')::boolean, false)
    when 'send' then coalesce((access ->> 'canSend')::boolean, false)
    when 'subscribe' then coalesce((access ->> 'canSubscribe')::boolean, false)
    else false
  end;
  if not allowed then
    perform private.raise_core_error_v1(
      'conversation_access_revoked',
      'Conversation access is not authorized.',
      false,
      jsonb_build_object('reason', access ->> 'reason', 'capability', p_capability)
    );
  end if;
  return access;
end;
$$;

create or replace function private.message_json_v2(p_message public.messages_v2)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'messageId', p_message.id,
    'conversationId', p_message.conversation_id,
    'senderPlayerId', p_message.sender_player_id,
    'clientMessageId', p_message.client_message_id,
    'sequence', p_message.sequence,
    'content', p_message.content,
    'createdAt', p_message.created_at,
    'tombstonedAt', p_message.tombstoned_at
  );
$$;

create or replace function private.bind_conversation_source_v2(
  p_conversation_id uuid,
  p_source_type public.conversation_source_type_v2,
  p_source_id uuid,
  p_source_aggregate_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.conversation_sources_v2%rowtype;
begin
  if p_source_id is null or p_source_aggregate_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Conversation source identity and aggregate version are required.'
    );
  end if;

  select * into existing
  from public.conversation_sources_v2
  where source_type = p_source_type and source_id = p_source_id
  for update;
  if existing.conversation_id is not null
    and existing.conversation_id <> p_conversation_id
  then
    perform private.raise_core_error_v1(
      'conversation_source_conflict',
      'The authoritative source is already bound to another conversation.'
    );
  end if;
  if existing.conversation_id is not null
    and existing.source_aggregate_version > p_source_aggregate_version
  then
    perform private.raise_core_error_v1(
      'source_version_conflict',
      'The conversation source aggregate version is stale.',
      true,
      jsonb_build_object(
        'current', existing.source_aggregate_version,
        'requested', p_source_aggregate_version
      )
    );
  end if;

  insert into public.conversation_sources_v2 (
    conversation_id,
    source_type,
    source_id,
    source_aggregate_version
  ) values (
    p_conversation_id,
    p_source_type,
    p_source_id,
    p_source_aggregate_version
  ) on conflict (source_type, source_id) do update
  set source_aggregate_version = greatest(
        public.conversation_sources_v2.source_aggregate_version,
        excluded.source_aggregate_version
      );
end;
$$;

create or replace function private.conversation_service_receipt_v2(
  p_command_name text,
  p_context jsonb,
  p_conversation public.conversations_v2,
  p_event_id uuid,
  p_actor_player_id uuid default null,
  p_repeated boolean default false,
  p_accepted_source_aggregate_version bigint default null,
  p_accepted_membership jsonb default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'commandName', p_command_name,
    'conversationId', p_conversation.id,
    'actorPlayerId', p_actor_player_id,
    'aggregateVersion', p_conversation.version,
    'idempotencyKey', p_context #>> '{metadata,idempotencyKey}',
    'correlationId', p_context #>> '{metadata,correlationId}',
    'eventId', p_event_id,
    'acceptedAt', now(),
    'repeated', p_repeated,
    'acceptedSourceAggregateVersion', p_accepted_source_aggregate_version,
    'acceptedMembership', p_accepted_membership
  ));
$$;

create or replace function public.provision_direct_conversation_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'provision_direct_conversation_v2';
  context jsonb;
  source jsonb;
  participants jsonb;
  source_type public.conversation_source_type_v2;
  source_id_value uuid;
  source_aggregate_version_value bigint;
  player_one uuid;
  player_two uuid;
  player_low uuid;
  player_high uuid;
  existing_pair private.conversation_direct_pairs_v2%rowtype;
  existing_source public.conversation_sources_v2%rowtype;
  source_already_bound boolean := false;
  conversation public.conversations_v2%rowtype;
  event_id uuid;
  response jsonb;
begin
  context := private.begin_conversation_service_command_v2(command_name, command);
  if (context ->> 'repeated')::boolean then return context -> 'response'; end if;

  source := command -> 'source';
  participants := command -> 'participantPlayerIds';
  if jsonb_typeof(source) is distinct from 'object'
    or source ->> 'sourceType' not in ('direct_match', 'friendship')
    or jsonb_typeof(participants) is distinct from 'array'
    or jsonb_array_length(participants) <> 2
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Direct conversation requires a direct_match/friendship source and two participants.'
    );
  end if;
  begin
    source_type := (source ->> 'sourceType')::public.conversation_source_type_v2;
    source_id_value := (source ->> 'sourceId')::uuid;
    source_aggregate_version_value := (source ->> 'sourceAggregateVersion')::bigint;
    player_one := (participants ->> 0)::uuid;
    player_two := (participants ->> 1)::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Direct conversation source or participant identifiers are invalid.'
    );
  end;
  if player_one = player_two or source_aggregate_version_value <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Direct conversation participants must be distinct and source version positive.'
    );
  end if;
  perform private.assert_social_target_v2(player_one, true, false);
  perform private.assert_social_target_v2(player_two, true, false);
  player_low := least(player_one, player_two);
  player_high := greatest(player_one, player_two);
  perform pg_advisory_xact_lock(hashtextextended('conversation-direct:' || player_low || ':' || player_high, 0));

  select * into existing_pair
  from private.conversation_direct_pairs_v2 pairs
  where pairs.player_low_id = player_low and pairs.player_high_id = player_high
  for update;
  if existing_pair.conversation_id is not null then
    select * into conversation
    from public.conversations_v2
    where id = existing_pair.conversation_id
    for update;
    select * into existing_source
    from public.conversation_sources_v2 sources
    where sources.source_type = source_type
      and sources.source_id = source_id_value
    for update;
    source_already_bound := coalesce(
      existing_source.conversation_id = conversation.id
      and existing_source.source_aggregate_version = source_aggregate_version_value,
      false
    );
    if not source_already_bound then
      perform private.bind_conversation_source_v2(
        conversation.id,
        source_type,
        source_id_value,
        source_aggregate_version_value
      );
      update public.conversations_v2
      set version = version + 1,
          updated_at = now()
      where id = conversation.id
      returning * into conversation;
    end if;
  else
    insert into public.conversations_v2 (kind, state, version, last_sequence)
    values ('direct', 'open', 1, 0)
    returning * into conversation;

    insert into private.conversation_direct_pairs_v2 (
      player_low_id,
      player_high_id,
      conversation_id
    ) values (player_low, player_high, conversation.id);
    perform private.bind_conversation_source_v2(
      conversation.id,
      source_type,
      source_id_value,
      source_aggregate_version_value
    );
    insert into public.conversation_members_v2 (
      conversation_id,
      player_id,
      role,
      state,
      can_message,
      can_view_conversation,
      membership_version,
      version
    ) values
      (conversation.id, player_low, 'member', 'active', true, true, source_aggregate_version_value, 1),
      (conversation.id, player_high, 'member', 'active', true, true, source_aggregate_version_value, 1);
    insert into public.conversation_read_cursors_v2 (conversation_id, player_id)
    values (conversation.id, player_low), (conversation.id, player_high);
  end if;

  event_id := private.enqueue_contract_event_v2(
    'conversation.provisioned.v2',
    'conversation',
    conversation.id,
    conversation.version,
    null,
    (context #>> '{metadata,correlationId}')::uuid,
    nullif(context #>> '{metadata,causationId}', '')::uuid,
    jsonb_build_object('conversation', private.conversation_snapshot_v2(conversation.id)),
    'conversation-provisioned:' || source_type || ':' || source_id_value || ':' || source_aggregate_version_value
  );
  response := private.conversation_service_receipt_v2(
    command_name,
    context,
    conversation,
    event_id,
    null,
    source_already_bound,
    source_aggregate_version_value,
    null
  );
  return private.finish_conversation_service_command_v2(command_name, context, response);
end;
$$;

create or replace function public.provision_session_conversation_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'provision_session_conversation_v2';
  context jsonb;
  source jsonb;
  accepted_membership jsonb;
  current_membership jsonb;
  session_row public.play_sessions_v2%rowtype;
  existing_source public.conversation_sources_v2%rowtype;
  conversation public.conversations_v2%rowtype;
  session_id_value uuid;
  source_aggregate_version_value bigint;
  membership_version_value bigint;
  member jsonb;
  active_count integer;
  event_id uuid;
  response jsonb;
begin
  context := private.begin_conversation_service_command_v2(command_name, command);
  if (context ->> 'repeated')::boolean then return context -> 'response'; end if;

  source := command -> 'source';
  accepted_membership := command -> 'membership';
  if jsonb_typeof(source) is distinct from 'object'
    or source ->> 'sourceType' <> 'play_session'
    or jsonb_typeof(accepted_membership) is distinct from 'object'
    or jsonb_typeof(accepted_membership -> 'members') is distinct from 'array'
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session conversation requires a play_session source and full membership projection.'
    );
  end if;
  begin
    session_id_value := (source ->> 'sourceId')::uuid;
    source_aggregate_version_value := (source ->> 'sourceAggregateVersion')::bigint;
    membership_version_value := (accepted_membership ->> 'membershipVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session source or membership identifiers are invalid.'
    );
  end;
  if (accepted_membership ->> 'sessionId')::uuid <> session_id_value
    or source_aggregate_version_value <= 0
    or membership_version_value <= 0
    or jsonb_array_length(accepted_membership -> 'members') < 2
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session conversation membership does not match its source.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('conversation-session:' || session_id_value, 0));
  select * into session_row
  from public.play_sessions_v2 sessions
  where sessions.id = session_id_value
  for update;
  if session_row.id is null then
    perform private.raise_core_error_v1('conversation_source_not_found', 'The Play Session was not found.');
  end if;
  current_membership := private.play_session_membership_snapshot_v2(session_id_value);
  if source_aggregate_version_value > session_row.version
    or membership_version_value <> session_row.membership_version
    or accepted_membership is distinct from current_membership
  then
    perform private.raise_core_error_v1(
      'source_version_conflict',
      'Session conversation receipt must match current aggregate and membership authority.',
      true,
      jsonb_build_object(
        'sessionVersion', session_row.version,
        'membershipVersion', session_row.membership_version
      )
    );
  end if;

  select * into existing_source
  from public.conversation_sources_v2 sources
  where sources.source_type = 'play_session' and sources.source_id = session_id_value
  for update;
  if existing_source.conversation_id is not null then
    select * into conversation
    from public.conversations_v2
    where id = existing_source.conversation_id
    for update;
    if existing_source.source_aggregate_version <> source_aggregate_version_value
      or coalesce(
        (
          select max(members.membership_version)
          from public.conversation_members_v2 members
          where members.conversation_id = conversation.id
        ),
        0
      ) <> membership_version_value
    then
      perform private.raise_core_error_v1(
        'source_version_conflict',
        'Existing session conversation must be updated through membership reconciliation.',
        true
      );
    end if;
  else
    insert into public.conversations_v2 (
      kind,
      state,
      title,
      version,
      last_sequence
    ) values (
      'group',
      'open',
      nullif(btrim(command ->> 'title'), ''),
      1,
      0
    ) returning * into conversation;
    perform private.bind_conversation_source_v2(
      conversation.id,
      'play_session',
      session_id_value,
      source_aggregate_version_value
    );

    active_count := 0;
    for member in select value from jsonb_array_elements(accepted_membership -> 'members')
    loop
      if member ->> 'role' not in ('owner', 'member') then
        perform private.raise_core_error_v1('validation_failed', 'Session member role is invalid.');
      end if;
      insert into public.conversation_members_v2 (
        conversation_id,
        player_id,
        role,
        state,
        can_message,
        can_view_conversation,
        membership_version,
        version
      ) values (
        conversation.id,
        (member ->> 'playerId')::uuid,
        (member ->> 'role')::public.conversation_member_role_v2,
        'active',
        true,
        true,
        membership_version_value,
        1
      );
      insert into public.conversation_read_cursors_v2 (conversation_id, player_id)
      values (conversation.id, (member ->> 'playerId')::uuid);
      active_count := active_count + 1;
    end loop;
    if active_count < 2 then
      perform private.raise_core_error_v1('validation_failed', 'Session conversation requires at least two members.');
    end if;
  end if;

  event_id := private.enqueue_contract_event_v2(
    'conversation.provisioned.v2',
    'conversation',
    conversation.id,
    conversation.version,
    null,
    (context #>> '{metadata,correlationId}')::uuid,
    nullif(context #>> '{metadata,causationId}', '')::uuid,
    jsonb_build_object('conversation', private.conversation_snapshot_v2(conversation.id)),
    'conversation-session-provisioned:' || session_id_value || ':' || source_aggregate_version_value || ':' || membership_version_value
  );
  response := private.conversation_service_receipt_v2(
    command_name,
    context,
    conversation,
    event_id,
    null,
    existing_source.conversation_id is not null,
    source_aggregate_version_value,
    accepted_membership
  );
  return private.finish_conversation_service_command_v2(command_name, context, response);
end;
$$;

create or replace function public.reconcile_conversation_membership_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'reconcile_conversation_membership_v2';
  context jsonb;
  conversation public.conversations_v2%rowtype;
  source jsonb;
  accepted_membership jsonb;
  current_membership jsonb;
  session_row public.play_sessions_v2%rowtype;
  source_row public.conversation_sources_v2%rowtype;
  session_id_value uuid;
  source_aggregate_version_value bigint;
  membership_version_value bigint;
  expected_version bigint;
  member jsonb;
  existing_member public.conversation_members_v2%rowtype;
  requested_player_ids uuid[] := '{}';
  removed public.conversation_members_v2%rowtype;
  event_id uuid;
  member_event_id uuid;
  response jsonb;
begin
  context := private.begin_conversation_service_command_v2(command_name, command, false);
  if (context ->> 'repeated')::boolean then return context -> 'response'; end if;
  source := command -> 'source';
  accepted_membership := command -> 'membership';
  expected_version := (context #>> '{metadata,expectedAggregateVersion}')::bigint;

  if source ->> 'sourceType' <> 'play_session'
    or jsonb_typeof(accepted_membership -> 'members') is distinct from 'array'
    or command ->> 'revocationReason' <> 'source_membership_revoked'
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Membership reconciliation requires a full Play Session membership projection.'
    );
  end if;
  begin
    session_id_value := (source ->> 'sourceId')::uuid;
    source_aggregate_version_value := (source ->> 'sourceAggregateVersion')::bigint;
    membership_version_value := (accepted_membership ->> 'membershipVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'Membership projection identifiers are invalid.');
  end;
  if (accepted_membership ->> 'sessionId')::uuid <> session_id_value then
    perform private.raise_core_error_v1('validation_failed', 'Membership projection belongs to another Session.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('conversation-session:' || session_id_value, 0));
  select * into session_row
  from public.play_sessions_v2 sessions
  where sessions.id = session_id_value
  for update;
  if session_row.id is null then
    perform private.raise_core_error_v1('conversation_source_not_found', 'The Play Session was not found.');
  end if;
  current_membership := private.play_session_membership_snapshot_v2(session_id_value);
  if source_aggregate_version_value > session_row.version
    or membership_version_value <> session_row.membership_version
    or accepted_membership is distinct from current_membership
  then
    perform private.raise_core_error_v1(
      'source_version_conflict',
      'Conversation membership must match current Session authority.',
      true
    );
  end if;

  select * into source_row
  from public.conversation_sources_v2 sources
  where sources.source_type = 'play_session' and sources.source_id = session_id_value
  for update;
  if source_row.conversation_id is null then
    perform private.raise_core_error_v1('conversation_not_found', 'The Session conversation was not provisioned.');
  end if;
  select * into conversation
  from public.conversations_v2 conversations
  where conversations.id = source_row.conversation_id
  for update;

  if source_aggregate_version_value < source_row.source_aggregate_version then
    perform private.raise_core_error_v1(
      'source_version_conflict',
      'The Session aggregate version is stale.',
      true,
      jsonb_build_object('current', source_row.source_aggregate_version, 'requested', source_aggregate_version_value)
    );
  end if;
  if source_aggregate_version_value = source_row.source_aggregate_version
    and accepted_membership = private.session_conversation_membership_projection_v2(
      conversation.id,
      session_id_value
    )
  then
    event_id := private.enqueue_contract_event_v2(
      'conversation.membership_reconciled.v2',
      'conversation',
      conversation.id,
      conversation.version,
      null,
      (context #>> '{metadata,correlationId}')::uuid,
      nullif(context #>> '{metadata,causationId}', '')::uuid,
      jsonb_build_object(
        'conversationId', conversation.id,
        'source', source,
        'membership', accepted_membership
      ),
      'conversation-membership-reconciled:' || conversation.id || ':' || source_aggregate_version_value || ':' || membership_version_value
    );
    response := private.conversation_service_receipt_v2(
      command_name,
      context,
      conversation,
      event_id,
      null,
      true,
      source_aggregate_version_value,
      accepted_membership
    );
    return private.finish_conversation_service_command_v2(command_name, context, response);
  end if;
  if expected_version <> conversation.version then
    perform private.raise_core_error_v1(
      'conversation_version_conflict',
      'The Conversation aggregate version is stale.',
      true,
      jsonb_build_object('current', conversation.version, 'expected', expected_version)
    );
  end if;
  if coalesce(
      (select max(members.membership_version)
       from public.conversation_members_v2 members
       where members.conversation_id = conversation.id),
      0
    ) > membership_version_value
  then
    perform private.raise_core_error_v1(
      'source_version_conflict',
      'The Session membership version is stale.',
      true
    );
  end if;

  for member in select value from jsonb_array_elements(accepted_membership -> 'members')
  loop
    if member ->> 'role' not in ('owner', 'member') then
      perform private.raise_core_error_v1('validation_failed', 'Session member role is invalid.');
    end if;
    requested_player_ids := array_append(requested_player_ids, (member ->> 'playerId')::uuid);
    select * into existing_member
    from public.conversation_members_v2 members
    where members.conversation_id = conversation.id
      and members.player_id = (member ->> 'playerId')::uuid
    for update;

    if existing_member.player_id is null then
      insert into public.conversation_members_v2 (
        conversation_id,
        player_id,
        role,
        state,
        can_message,
        can_view_conversation,
        membership_version,
        version
      ) values (
        conversation.id,
        (member ->> 'playerId')::uuid,
        (member ->> 'role')::public.conversation_member_role_v2,
        'active',
        true,
        true,
        membership_version_value,
        1
      ) returning * into existing_member;
      insert into public.conversation_read_cursors_v2 (conversation_id, player_id)
      values (conversation.id, existing_member.player_id)
      on conflict (conversation_id, player_id) do nothing;
      member_event_id := private.enqueue_contract_event_v2(
        'conversation.member_added.v2',
        'conversation',
        conversation.id,
        conversation.version + 1,
        null,
        (context #>> '{metadata,correlationId}')::uuid,
        nullif(context #>> '{metadata,causationId}', '')::uuid,
        jsonb_build_object(
          'conversationId', conversation.id,
          'member', jsonb_build_object(
            'playerId', existing_member.player_id,
            'role', existing_member.role,
            'state', existing_member.state,
            'membershipVersion', existing_member.membership_version,
            'version', existing_member.version,
            'joinedAt', existing_member.joined_at,
            'revokedAt', existing_member.revoked_at,
            'revocationReason', existing_member.revocation_reason
          ),
          'source', source
        ),
        'conversation-member-added:' || conversation.id || ':' || existing_member.player_id || ':' || membership_version_value
      );
    else
      update public.conversation_members_v2
      set role = (member ->> 'role')::public.conversation_member_role_v2,
          state = 'active',
          can_message = true,
          can_view_conversation = true,
          membership_version = membership_version_value,
          version = version + case
            when role is distinct from (member ->> 'role')::public.conversation_member_role_v2
              or state <> 'active'
              or not can_message
              or not can_view_conversation
            then 1 else 0 end,
          revoked_at = null,
          revocation_reason = null
      where conversation_id = conversation.id
        and player_id = existing_member.player_id;
    end if;
  end loop;

  for removed in
    select members.*
    from public.conversation_members_v2 members
    where members.conversation_id = conversation.id
      and members.state = 'active'
      and not (members.player_id = any(requested_player_ids))
    for update
  loop
    update public.conversation_members_v2
    set state = 'revoked',
        can_message = false,
        can_view_conversation = false,
        membership_version = membership_version_value,
        version = version + 1,
        revoked_at = now(),
        revocation_reason = 'source_membership_revoked'
    where conversation_id = conversation.id and player_id = removed.player_id
    returning * into removed;

    member_event_id := private.enqueue_contract_event_v2(
      'conversation.member_removed.v2',
      'conversation',
      conversation.id,
      conversation.version + 1,
      null,
      (context #>> '{metadata,correlationId}')::uuid,
      nullif(context #>> '{metadata,causationId}', '')::uuid,
      jsonb_build_object(
        'conversationId', conversation.id,
        'member', jsonb_build_object(
          'playerId', removed.player_id,
          'role', removed.role,
          'state', removed.state,
          'membershipVersion', removed.membership_version,
          'version', removed.version,
          'joinedAt', removed.joined_at,
          'revokedAt', removed.revoked_at,
          'revocationReason', removed.revocation_reason
        ),
        'source', source
      ),
      'conversation-member-removed:' || conversation.id || ':' || removed.player_id || ':' || membership_version_value
    );
    perform private.enqueue_contract_event_v2(
      'conversation.access_revoked.v2',
      'conversation',
      conversation.id,
      conversation.version + 1,
      null,
      (context #>> '{metadata,correlationId}')::uuid,
      member_event_id,
      jsonb_build_object(
        'conversationId', conversation.id,
        'playerId', removed.player_id,
        'reason', 'source_membership_revoked'
      ),
      'conversation-access-revoked:' || conversation.id || ':' || removed.player_id || ':' || membership_version_value
    );
  end loop;

  update public.conversation_sources_v2 as sources
  set source_aggregate_version = source_aggregate_version_value
  where conversation_id = conversation.id
    and source_type = 'play_session'
    and sources.source_id = session_id_value;
  update public.conversations_v2
  set version = version + 1,
      updated_at = now()
  where id = conversation.id
  returning * into conversation;

  event_id := private.enqueue_contract_event_v2(
    'conversation.membership_reconciled.v2',
    'conversation',
    conversation.id,
    conversation.version,
    null,
    (context #>> '{metadata,correlationId}')::uuid,
    nullif(context #>> '{metadata,causationId}', '')::uuid,
    jsonb_build_object(
      'conversationId', conversation.id,
      'source', source,
      'membership', accepted_membership
    ),
    'conversation-membership-reconciled:' || conversation.id || ':' || source_aggregate_version_value || ':' || membership_version_value
  );
  response := private.conversation_service_receipt_v2(
    command_name,
    context,
    conversation,
    event_id,
    null,
    false,
    source_aggregate_version_value,
    accepted_membership
  );
  return private.finish_conversation_service_command_v2(command_name, context, response);
end;
$$;

create or replace function public.project_conversation_system_activity_v2(p_activity jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.conversations_v2%rowtype;
  source_row public.conversation_sources_v2%rowtype;
  source jsonb := p_activity -> 'source';
  source_event_id uuid;
  source_event_version integer;
  source_event_type text;
  correlation_id uuid;
  causation_id uuid;
  existing public.messages_v2%rowtype;
  message public.messages_v2%rowtype;
  next_sequence bigint;
begin
  perform private.require_conversation_service_v2();
  if jsonb_typeof(source) is distinct from 'object'
    or nullif(p_activity ->> 'conversationId', '') is null
    or nullif(p_activity ->> 'sourceEventId', '') is null
    or nullif(p_activity ->> 'sourceEventType', '') is null
  then
    perform private.raise_core_error_v1('validation_failed', 'System activity is incomplete.');
  end if;
  begin
    source_event_id := (p_activity ->> 'sourceEventId')::uuid;
    source_event_version := (p_activity ->> 'sourceEventVersion')::integer;
    correlation_id := (p_activity ->> 'correlationId')::uuid;
    causation_id := nullif(p_activity ->> 'causationId', '')::uuid;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'System activity identifiers are invalid.');
  end;
  source_event_type := p_activity ->> 'sourceEventType';
  if source_event_version <= 0 then
    perform private.raise_core_error_v1('unsupported_event_version', 'System event version is unsupported.');
  end if;

  select * into conversation
  from public.conversations_v2
  where id = (p_activity ->> 'conversationId')::uuid
  for update;
  if conversation.id is null then
    perform private.raise_core_error_v1('conversation_not_found', 'Conversation was not found.');
  end if;
  select * into source_row
  from public.conversation_sources_v2 sources
  where sources.conversation_id = conversation.id
    and sources.source_type = (source ->> 'sourceType')::public.conversation_source_type_v2
    and sources.source_id = (source ->> 'sourceId')::uuid;
  if source_row.conversation_id is null then
    perform private.raise_core_error_v1('conversation_source_conflict', 'System activity source is not bound.');
  end if;

  select * into existing
  from public.messages_v2 messages
  where messages.conversation_id = conversation.id
    and messages.source_event_id = source_event_id;
  if existing.id is not null then return private.message_json_v2(existing); end if;

  next_sequence := conversation.last_sequence + 1;
  insert into public.messages_v2 (
    conversation_id,
    sender_player_id,
    client_message_id,
    sequence,
    kind,
    content,
    content_fingerprint,
    source_event_id,
    source_event_type,
    source_event_version,
    correlation_id
  ) values (
    conversation.id,
    null,
    'system-event:' || source_event_id,
    next_sequence,
    'system',
    jsonb_build_object(
      'kind', 'system',
      'sourceEventId', source_event_id,
      'sourceEventType', source_event_type,
      'sourceEventVersion', source_event_version,
      'payload', coalesce(p_activity -> 'payload', '{}'::jsonb)
    ),
    private.command_request_hash_v1(coalesce(p_activity -> 'payload', '{}'::jsonb)),
    source_event_id,
    source_event_type,
    source_event_version,
    correlation_id
  ) returning * into message;
  update public.conversations_v2
  set last_sequence = next_sequence,
      version = version + 1,
      updated_at = now()
  where id = conversation.id;
  perform private.enqueue_contract_event_v2(
    'message.sent.v2',
    'conversation',
    conversation.id,
    conversation.version + 1,
    null,
    correlation_id,
    causation_id,
    jsonb_build_object(
      'message', private.message_json_v2(message),
      'recipientPlayerIds', coalesce(
        (select jsonb_agg(members.player_id order by members.player_id)
         from public.conversation_members_v2 members
         where members.conversation_id = conversation.id
           and members.state = 'active'
           and members.can_view_conversation),
        '[]'::jsonb
      )
    ),
    'message-system-sent:' || source_event_id
  );
  return private.message_json_v2(message);
end;
$$;

create or replace function private.append_conversation_message_v2(
  p_command_name text,
  p_command jsonb,
  p_kind public.message_kind_v2
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context jsonb;
  actor_player_id uuid;
  conversation_id_value uuid;
  expected_version bigint;
  client_message_id_value text;
  content_value jsonb;
  content_fingerprint_value text;
  existing public.messages_v2%rowtype;
  conversation public.conversations_v2%rowtype;
  message public.messages_v2%rowtype;
  media public.media_assets%rowtype;
  media_owner_player_id uuid;
  next_sequence bigint;
  event_id uuid;
  response jsonb;
  recipients jsonb;
begin
  context := private.begin_conversation_command_v2(p_command_name, p_command);
  if (context ->> 'repeated')::boolean then return context -> 'response'; end if;
  actor_player_id := (context ->> 'playerId')::uuid;
  expected_version := (context #>> '{metadata,expectedAggregateVersion}')::bigint;
  begin
    conversation_id_value := (p_command ->> 'conversationId')::uuid;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'ConversationId is invalid.');
  end;
  client_message_id_value := p_command ->> 'clientMessageId';

  if p_kind = 'text' then
    if char_length(btrim(coalesce(p_command ->> 'text', ''))) not between 1 and 4000 then
      perform private.raise_core_error_v1('validation_failed', 'Message text must contain 1-4000 characters.');
    end if;
    content_value := jsonb_build_object('kind', 'text', 'text', btrim(p_command ->> 'text'));
  elsif p_kind = 'media' then
    begin
      select * into media
      from public.media_assets
      where id = (p_command ->> 'assetId')::uuid
      for share;
    exception when others then
      perform private.raise_core_error_v1('validation_failed', 'Media asset identifier is invalid.');
    end;
    if media.id is null
      or media.purpose <> 'chat_attachment'
      or media.visibility <> 'conversation_members'
      or media.status <> 'ready'
      or media.moderation_status <> 'approved'
      or media.deleted_at is not null
    then
      perform private.raise_core_error_v1('conversation_media_forbidden', 'Media asset is not ready for messaging.');
    end if;
    select profiles.player_id into media_owner_player_id
    from public.player_profiles_v1 profiles
    where profiles.legacy_profile_id = media.owner_id;
    if media_owner_player_id is distinct from actor_player_id then
      perform private.raise_core_error_v1('conversation_media_forbidden', 'Media asset is not owned by the sender.');
    end if;
    if nullif(p_command ->> 'caption', '') is not null
      and char_length(btrim(p_command ->> 'caption')) > 4000
    then
      perform private.raise_core_error_v1('validation_failed', 'Media caption exceeds 4000 characters.');
    end if;
    content_value := jsonb_strip_nulls(jsonb_build_object(
      'kind', 'media',
      'assetId', media.id,
      'caption', nullif(btrim(p_command ->> 'caption'), '')
    ));
  else
    perform private.raise_core_error_v1('validation_failed', 'Unsupported mobile message kind.');
  end if;

  if client_message_id_value is null
    or char_length(client_message_id_value) not between 16 and 128
    or client_message_id_value !~ '^[A-Za-z0-9._:-]+$'
  then
    perform private.raise_core_error_v1('validation_failed', 'clientMessageId is invalid.');
  end if;
  content_fingerprint_value := private.command_request_hash_v1(content_value);

  select * into existing
  from public.messages_v2 messages
  where messages.conversation_id = conversation_id_value
    and messages.sender_player_id = actor_player_id
    and messages.client_message_id = client_message_id_value;
  if existing.id is not null then
    if existing.content_fingerprint is distinct from content_fingerprint_value then
      perform private.raise_core_error_v1(
        'message_idempotency_conflict',
        'clientMessageId is already bound to different content.'
      );
    end if;
    response := jsonb_build_object(
      'commandName', p_command_name,
      'conversationId', conversation_id_value,
      'actorPlayerId', actor_player_id,
      'aggregateVersion', (select version from public.conversations_v2 where id = conversation_id_value),
      'idempotencyKey', context #>> '{metadata,idempotencyKey}',
      'correlationId', context #>> '{metadata,correlationId}',
      'eventId', extensions.gen_random_uuid(),
      'acceptedAt', existing.created_at,
      'repeated', true,
      'message', private.message_json_v2(existing)
    );
    return private.finish_conversation_command_v2(p_command_name, context, response);
  end if;

  select * into conversation
  from public.conversations_v2 conversations
  where conversations.id = conversation_id_value
  for update;
  if conversation.id is null then
    perform private.raise_core_error_v1('conversation_not_found', 'Conversation was not found.');
  end if;
  perform private.assert_conversation_access_v2(conversation.id, actor_player_id, 'send');
  if conversation.version <> expected_version then
    perform private.raise_core_error_v1(
      'conversation_version_conflict',
      'Conversation aggregate version is stale.',
      true,
      jsonb_build_object('current', conversation.version, 'expected', expected_version)
    );
  end if;

  next_sequence := conversation.last_sequence + 1;
  insert into public.messages_v2 (
    conversation_id,
    sender_player_id,
    client_message_id,
    sequence,
    kind,
    content,
    content_fingerprint,
    media_asset_id,
    correlation_id
  ) values (
    conversation.id,
    actor_player_id,
    client_message_id_value,
    next_sequence,
    p_kind,
    content_value,
    content_fingerprint_value,
    case when p_kind = 'media' then media.id else null end,
    (context #>> '{metadata,correlationId}')::uuid
  ) returning * into message;

  update public.conversations_v2
  set last_sequence = next_sequence,
      version = version + 1,
      updated_at = now()
  where id = conversation.id
  returning * into conversation;

  insert into public.conversation_read_cursors_v2 (
    conversation_id,
    player_id,
    last_read_sequence,
    version,
    updated_at
  ) values (
    conversation.id,
    actor_player_id,
    next_sequence,
    1,
    now()
  ) on conflict (conversation_id, player_id) do update
  set last_read_sequence = greatest(
        public.conversation_read_cursors_v2.last_read_sequence,
        excluded.last_read_sequence
      ),
      version = public.conversation_read_cursors_v2.version + case
        when public.conversation_read_cursors_v2.last_read_sequence < excluded.last_read_sequence
        then 1 else 0 end,
      updated_at = case
        when public.conversation_read_cursors_v2.last_read_sequence < excluded.last_read_sequence
        then now() else public.conversation_read_cursors_v2.updated_at end;

  insert into public.message_receipts_v2 (message_id, recipient_player_id)
  select message.id, members.player_id
  from public.conversation_members_v2 members
  where members.conversation_id = conversation.id
    and members.player_id <> actor_player_id
    and members.state = 'active'
    and members.can_view_conversation
  on conflict (message_id, recipient_player_id) do nothing;

  select coalesce(jsonb_agg(receipts.recipient_player_id order by receipts.recipient_player_id), '[]'::jsonb)
    into recipients
  from public.message_receipts_v2 receipts
  where receipts.message_id = message.id;

  event_id := private.enqueue_contract_event_v2(
    'message.sent.v2',
    'conversation',
    conversation.id,
    conversation.version,
    actor_player_id,
    (context #>> '{metadata,correlationId}')::uuid,
    nullif(context #>> '{metadata,causationId}', '')::uuid,
    jsonb_build_object(
      'message', private.message_json_v2(message),
      'recipientPlayerIds', recipients
    ),
    'message-sent:' || message.id
  );

  insert into private.conversation_authority_metrics_v2 (
    metric_name,
    conversation_id,
    actor_player_id,
    metadata
  ) values (
    'message_send_succeeded',
    conversation.id,
    actor_player_id,
    jsonb_build_object('messageId', message.id, 'kind', message.kind, 'sequence', message.sequence)
  );

  response := jsonb_build_object(
    'commandName', p_command_name,
    'conversationId', conversation.id,
    'actorPlayerId', actor_player_id,
    'aggregateVersion', conversation.version,
    'idempotencyKey', context #>> '{metadata,idempotencyKey}',
    'correlationId', context #>> '{metadata,correlationId}',
    'eventId', event_id,
    'acceptedAt', message.created_at,
    'repeated', false,
    'message', private.message_json_v2(message)
  );
  return private.finish_conversation_command_v2(p_command_name, context, response);
end;
$$;

create or replace function public.send_message_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.append_conversation_message_v2('send_message_v2', command, 'text');
$$;

create or replace function public.send_media_message_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.append_conversation_message_v2('send_media_message_v2', command, 'media');
$$;

create or replace function public.advance_read_cursor_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'advance_read_cursor_v2';
  context jsonb;
  actor_player_id uuid;
  conversation_id_value uuid;
  requested_sequence bigint;
  expected_cursor_version bigint;
  conversation public.conversations_v2%rowtype;
  cursor public.conversation_read_cursors_v2%rowtype;
  event_id uuid;
  response jsonb;
begin
  context := private.begin_conversation_command_v2(command_name, command);
  if (context ->> 'repeated')::boolean then return context -> 'response'; end if;
  actor_player_id := (context ->> 'playerId')::uuid;
  expected_cursor_version := (context #>> '{metadata,expectedAggregateVersion}')::bigint;
  begin
    conversation_id_value := (command ->> 'conversationId')::uuid;
    requested_sequence := (command ->> 'lastReadSequence')::bigint;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'Read cursor command is invalid.');
  end;
  if requested_sequence < 0 then
    perform private.raise_core_error_v1('validation_failed', 'Read sequence cannot be negative.');
  end if;

  select * into conversation
  from public.conversations_v2
  where id = conversation_id_value
  for share;
  if conversation.id is null then
    perform private.raise_core_error_v1('conversation_not_found', 'Conversation was not found.');
  end if;
  perform private.assert_conversation_access_v2(conversation.id, actor_player_id, 'read');
  if requested_sequence > conversation.last_sequence then
    perform private.raise_core_error_v1('validation_failed', 'Read cursor cannot exceed the conversation sequence.');
  end if;

  select * into cursor
  from public.conversation_read_cursors_v2 cursors
  where cursors.conversation_id = conversation.id and cursors.player_id = actor_player_id
  for update;
  if cursor.player_id is null then
    insert into public.conversation_read_cursors_v2 (conversation_id, player_id)
    values (conversation.id, actor_player_id)
    returning * into cursor;
  end if;
  if cursor.version <> expected_cursor_version then
    perform private.raise_core_error_v1(
      'read_cursor_version_conflict',
      'Read cursor version is stale.',
      true,
      jsonb_build_object('current', cursor.version, 'expected', expected_cursor_version)
    );
  end if;
  if requested_sequence < cursor.last_read_sequence then
    perform private.raise_core_error_v1(
      'read_cursor_regression',
      'Read cursor is monotonic and cannot move backwards.'
    );
  end if;

  if requested_sequence > cursor.last_read_sequence then
    update public.conversation_read_cursors_v2
    set last_read_sequence = requested_sequence,
        version = version + 1,
        updated_at = now()
    where conversation_id = conversation.id and player_id = actor_player_id
    returning * into cursor;

    update public.message_receipts_v2 receipts
    set state = 'read',
        delivered_at = coalesce(receipts.delivered_at, now()),
        read_at = now(),
        version = receipts.version + 1
    from public.messages_v2 messages
    where messages.id = receipts.message_id
      and messages.conversation_id = conversation.id
      and messages.sequence <= requested_sequence
      and receipts.recipient_player_id = actor_player_id
      and receipts.state <> 'read';
  end if;

  event_id := private.enqueue_contract_event_v2(
    'conversation.read_advanced.v2',
    'conversation',
    conversation.id,
    conversation.version,
    actor_player_id,
    (context #>> '{metadata,correlationId}')::uuid,
    nullif(context #>> '{metadata,causationId}', '')::uuid,
    jsonb_build_object(
      'readCursor', jsonb_build_object(
        'conversationId', conversation.id,
        'playerId', actor_player_id,
        'lastReadSequence', cursor.last_read_sequence,
        'version', cursor.version,
        'updatedAt', cursor.updated_at
      )
    ),
    'conversation-read-advanced:' || conversation.id || ':' || actor_player_id || ':' || cursor.version
  );
  response := jsonb_build_object(
    'commandName', command_name,
    'conversationId', conversation.id,
    'actorPlayerId', actor_player_id,
    'aggregateVersion', conversation.version,
    'idempotencyKey', context #>> '{metadata,idempotencyKey}',
    'correlationId', context #>> '{metadata,correlationId}',
    'eventId', event_id,
    'acceptedAt', now(),
    'repeated', requested_sequence = cursor.last_read_sequence and cursor.version = expected_cursor_version,
    'readCursor', jsonb_build_object(
      'conversationId', conversation.id,
      'playerId', actor_player_id,
      'lastReadSequence', cursor.last_read_sequence,
      'version', cursor.version,
      'updatedAt', cursor.updated_at
    )
  );
  return private.finish_conversation_command_v2(command_name, context, response);
end;
$$;

create or replace function private.set_conversation_mute_v2(
  p_command_name text,
  p_command jsonb,
  p_muted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context jsonb;
  actor_player_id uuid;
  conversation_id_value uuid;
  expected_version bigint;
  conversation public.conversations_v2%rowtype;
  mute public.conversation_mutes_v2%rowtype;
  event_id uuid;
  response jsonb;
begin
  context := private.begin_conversation_command_v2(p_command_name, p_command);
  if (context ->> 'repeated')::boolean then return context -> 'response'; end if;
  actor_player_id := (context ->> 'playerId')::uuid;
  expected_version := (context #>> '{metadata,expectedAggregateVersion}')::bigint;
  begin
    conversation_id_value := (p_command ->> 'conversationId')::uuid;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'ConversationId is invalid.');
  end;

  select * into conversation
  from public.conversations_v2 conversations
  where conversations.id = conversation_id_value
  for update;
  if conversation.id is null then
    perform private.raise_core_error_v1('conversation_not_found', 'Conversation was not found.');
  end if;
  perform private.assert_conversation_access_v2(conversation.id, actor_player_id, 'read');
  if conversation.version <> expected_version then
    perform private.raise_core_error_v1(
      'conversation_version_conflict',
      'Conversation aggregate version is stale.',
      true,
      jsonb_build_object('current', conversation.version, 'expected', expected_version)
    );
  end if;

  select * into mute
  from public.conversation_mutes_v2 mutes
  where mutes.conversation_id = conversation.id and mutes.player_id = actor_player_id
  for update;
  if mute.player_id is null then
    insert into public.conversation_mutes_v2 (
      conversation_id,
      player_id,
      muted,
      version,
      muted_at,
      unmuted_at
    ) values (
      conversation.id,
      actor_player_id,
      p_muted,
      1,
      case when p_muted then now() else null end,
      case when p_muted then null else now() end
    ) returning * into mute;
  elsif mute.muted is distinct from p_muted then
    update public.conversation_mutes_v2
    set muted = p_muted,
        version = version + 1,
        muted_at = case when p_muted then now() else muted_at end,
        unmuted_at = case when p_muted then null else now() end,
        updated_at = now()
    where conversation_id = conversation.id and player_id = actor_player_id
    returning * into mute;
  end if;

  update public.conversations_v2
  set version = version + 1,
      updated_at = now()
  where id = conversation.id
  returning * into conversation;

  event_id := private.enqueue_contract_event_v2(
    'conversation.muted.v2',
    'conversation',
    conversation.id,
    conversation.version,
    actor_player_id,
    (context #>> '{metadata,correlationId}')::uuid,
    nullif(context #>> '{metadata,causationId}', '')::uuid,
    jsonb_build_object(
      'conversationId', conversation.id,
      'playerId', actor_player_id,
      'muted', p_muted
    ),
    'conversation-muted:' || conversation.id || ':' || actor_player_id || ':' || mute.version
  );
  response := jsonb_build_object(
    'commandName', p_command_name,
    'conversationId', conversation.id,
    'actorPlayerId', actor_player_id,
    'aggregateVersion', conversation.version,
    'idempotencyKey', context #>> '{metadata,idempotencyKey}',
    'correlationId', context #>> '{metadata,correlationId}',
    'eventId', event_id,
    'acceptedAt', now(),
    'repeated', false
  );
  return private.finish_conversation_command_v2(p_command_name, context, response);
end;
$$;

create or replace function public.mute_conversation_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.set_conversation_mute_v2('mute_conversation_v2', command, true);
$$;

create or replace function public.unmute_conversation_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.set_conversation_mute_v2('unmute_conversation_v2', command, false);
$$;

create or replace function public.tombstone_conversation_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'tombstone_conversation_v2';
  context jsonb;
  conversation public.conversations_v2%rowtype;
  conversation_id_value uuid;
  expected_version bigint;
  event_id uuid;
  response jsonb;
  was_tombstoned boolean;
begin
  context := private.begin_conversation_service_command_v2(command_name, command, false);
  if (context ->> 'repeated')::boolean then return context -> 'response'; end if;
  begin
    conversation_id_value := (command ->> 'conversationId')::uuid;
    expected_version := (context #>> '{metadata,expectedAggregateVersion}')::bigint;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'Conversation tombstone command is invalid.');
  end;
  if command ->> 'reason' not in ('source_closed', 'administrative', 'retention') then
    perform private.raise_core_error_v1('validation_failed', 'Conversation tombstone reason is invalid.');
  end if;

  select * into conversation
  from public.conversations_v2
  where id = conversation_id_value
  for update;
  if conversation.id is null then
    perform private.raise_core_error_v1('conversation_not_found', 'Conversation was not found.');
  end if;
  was_tombstoned := conversation.state = 'tombstoned';
  if conversation.version <> expected_version then
    perform private.raise_core_error_v1(
      'conversation_version_conflict',
      'Conversation aggregate version is stale.',
      true,
      jsonb_build_object('current', conversation.version, 'expected', expected_version)
    );
  end if;
  if conversation.state <> 'tombstoned' then
    update public.conversations_v2
    set state = 'tombstoned',
        version = version + 1,
        tombstoned_at = now(),
        updated_at = now()
    where id = conversation.id
    returning * into conversation;
  end if;

  event_id := private.enqueue_contract_event_v2(
    'conversation.tombstoned.v2',
    'conversation',
    conversation.id,
    conversation.version,
    null,
    (context #>> '{metadata,correlationId}')::uuid,
    nullif(context #>> '{metadata,causationId}', '')::uuid,
    jsonb_build_object(
      'conversationId', conversation.id,
      'reason', command ->> 'reason',
      'tombstonedAt', conversation.tombstoned_at
    ),
    'conversation-tombstoned:' || conversation.id || ':' || conversation.version
  );
  response := private.conversation_service_receipt_v2(
    command_name,
    context,
    conversation,
    event_id,
    null,
    was_tombstoned,
    null,
    null
  );
  return private.finish_conversation_service_command_v2(command_name, context, response);
end;
$$;

create or replace function public.get_conversation_v2(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  snapshot jsonb;
begin
  perform private.assert_conversation_feature_v2('read');
  actor := private.resolve_conversation_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;
  perform private.assert_conversation_access_v2(p_conversation_id, actor_player_id, 'read');
  snapshot := private.conversation_snapshot_v2(p_conversation_id);
  return snapshot || jsonb_build_object(
    'viewer', private.conversation_access_v2(p_conversation_id, actor_player_id),
    'readCursor', (
      select jsonb_build_object(
        'conversationId', cursors.conversation_id,
        'playerId', cursors.player_id,
        'lastReadSequence', cursors.last_read_sequence,
        'version', cursors.version,
        'updatedAt', cursors.updated_at
      )
      from public.conversation_read_cursors_v2 cursors
      where cursors.conversation_id = p_conversation_id
        and cursors.player_id = actor_player_id
    ),
    'muted', coalesce(
      (select (mutes.muted or mutes.relationship_muted) from public.conversation_mutes_v2 mutes
       where mutes.conversation_id = p_conversation_id and mutes.player_id = actor_player_id),
      false
    )
  );
end;
$$;

create or replace function public.list_conversation_inbox_v2(
  p_limit integer default 30,
  p_before_updated_at timestamptz default null,
  p_before_conversation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
  items jsonb;
  total_count integer;
  unread_count integer;
  next_updated_at timestamptz;
  next_id uuid;
  has_next boolean;
begin
  perform private.assert_conversation_feature_v2('read');
  actor := private.resolve_conversation_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;
  if (p_before_updated_at is null) <> (p_before_conversation_id is null) then
    perform private.raise_core_error_v1('validation_failed', 'Inbox cursor is incomplete.');
  end if;

  with eligible as (
    select conversations.*,
      cursors.last_read_sequence,
      cursors.version as cursor_version,
      coalesce(mutes.muted or mutes.relationship_muted, false) as muted
    from public.conversation_members_v2 members
    join public.conversations_v2 conversations on conversations.id = members.conversation_id
    join public.conversation_read_cursors_v2 cursors
      on cursors.conversation_id = conversations.id and cursors.player_id = actor_player_id
    left join public.conversation_mutes_v2 mutes
      on mutes.conversation_id = conversations.id and mutes.player_id = actor_player_id
    where members.player_id = actor_player_id
      and (private.conversation_access_v2(conversations.id, actor_player_id) ->> 'canRead')::boolean
      and (
        p_before_updated_at is null
        or (conversations.updated_at, conversations.id) < (p_before_updated_at, p_before_conversation_id)
      )
    order by conversations.updated_at desc, conversations.id desc
    limit safe_limit
  )
  select coalesce(jsonb_agg(
    private.conversation_snapshot_v2(eligible.id) || jsonb_build_object(
      'viewer', private.conversation_access_v2(eligible.id, actor_player_id),
      'muted', eligible.muted,
      'unreadCount', greatest(eligible.last_sequence - eligible.last_read_sequence, 0),
      'readCursor', jsonb_build_object(
        'conversationId', eligible.id,
        'playerId', actor_player_id,
        'lastReadSequence', eligible.last_read_sequence,
        'version', eligible.cursor_version
      )
    ) order by eligible.updated_at desc, eligible.id desc
  ), '[]'::jsonb) into items
  from eligible;

  select count(*)::integer,
    count(*) filter (where conversations.last_sequence > cursors.last_read_sequence)::integer
  into total_count, unread_count
  from public.conversation_members_v2 members
  join public.conversations_v2 conversations on conversations.id = members.conversation_id
  join public.conversation_read_cursors_v2 cursors
    on cursors.conversation_id = conversations.id and cursors.player_id = actor_player_id
  where members.player_id = actor_player_id
    and (private.conversation_access_v2(conversations.id, actor_player_id) ->> 'canRead')::boolean;

  select conversations.updated_at, conversations.id
  into next_updated_at, next_id
  from public.conversation_members_v2 members
  join public.conversations_v2 conversations on conversations.id = members.conversation_id
  where members.player_id = actor_player_id
    and (private.conversation_access_v2(conversations.id, actor_player_id) ->> 'canRead')::boolean
    and (
      p_before_updated_at is null
      or (conversations.updated_at, conversations.id) < (p_before_updated_at, p_before_conversation_id)
    )
  order by conversations.updated_at desc, conversations.id desc
  offset safe_limit limit 1;
  has_next := next_id is not null;

  return jsonb_build_object(
    'items', items,
    'totalCount', total_count,
    'unreadConversationCount', unread_count,
    'pageInfo', jsonb_build_object(
      'hasNextPage', has_next,
      'nextCursor', case when has_next then jsonb_build_object(
        'beforeUpdatedAt', next_updated_at,
        'beforeConversationId', next_id
      ) else null end
    )
  );
end;
$$;

create or replace function public.get_conversation_timeline_v2(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before_sequence bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  conversation public.conversations_v2%rowtype;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  before_sequence bigint;
  items jsonb;
  next_sequence bigint;
begin
  perform private.assert_conversation_feature_v2('read');
  actor := private.resolve_conversation_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;
  perform private.assert_conversation_access_v2(p_conversation_id, actor_player_id, 'read');
  select * into conversation from public.conversations_v2 where id = p_conversation_id;
  before_sequence := coalesce(p_before_sequence, conversation.last_sequence + 1);

  with combined as (
    select messages.sequence,
      private.message_json_v2(messages) as item
    from public.messages_v2 messages
    where messages.conversation_id = p_conversation_id
      and messages.sequence < before_sequence
    union all
    select legacy.sequence_v1 as sequence,
      jsonb_build_object(
        'messageId', legacy.id,
        'conversationId', p_conversation_id,
        'senderPlayerId', legacy.sender_player_id_v1,
        'clientMessageId', legacy.client_message_id_v1,
        'sequence', legacy.sequence_v1,
        'content', legacy.content_v1,
        'createdAt', legacy.created_at,
        'tombstonedAt', legacy.deleted_at,
        'legacy', true
      ) as item
    from public.messages legacy
    where conversation.legacy_conversation_id is not null
      and legacy.conversation_id = conversation.legacy_conversation_id
      and legacy.schema_version_v1 = 1
      and legacy.sequence_v1 < before_sequence
  ), page as (
    select * from combined order by sequence desc limit safe_limit
  )
  select coalesce(jsonb_agg(page.item order by page.sequence), '[]'::jsonb), min(page.sequence)
  into items, next_sequence
  from page;

  return jsonb_build_object(
    'items', items,
    'pageInfo', jsonb_build_object(
      'hasNextPage', coalesce(next_sequence > 1, false),
      'nextCursor', case when next_sequence > 1 then next_sequence else null end
    )
  );
end;
$$;


create or replace function public.reconcile_relationship_conversation_v2(p_projection jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  relationship jsonb := p_projection -> 'relationship';
  capabilities jsonb;
  friendship jsonb;
  source_event_id_value uuid;
  source_event_version_value integer;
  relationship_id_value uuid;
  relationship_version_value bigint;
  viewer_player_id_value uuid;
  target_player_id_value uuid;
  correlation_id_value uuid;
  causation_id_value uuid;
  occurred_at_value timestamptz;
  fingerprint_value text;
  observed_version_value bigint := 0;
  consumed private.conversation_consumed_events_v2%rowtype;
  pair private.conversation_direct_pairs_v2%rowtype;
  pair_existed boolean := false;
  conversation public.conversations_v2%rowtype;
  member public.conversation_members_v2%rowtype;
  mute_row public.conversation_mutes_v2%rowtype;
  provisioning_receipt jsonb;
  accepted_friendship boolean;
  can_message_value boolean;
  can_view_value boolean;
  blocked_value boolean;
  relationship_muted_value boolean;
  desired_active boolean;
  access_changed boolean := false;
  source_changed boolean := false;
  mute_changed boolean := false;
  member_changed boolean;
  desired_reason public.conversation_access_reason_v2;
  player_id_value uuid;
  event_ids jsonb := '[]'::jsonb;
  emitted_id uuid;
  action_value text := 'none';
  response jsonb;
begin
  perform private.require_conversation_service_v2();
  if jsonb_typeof(relationship) is distinct from 'object'
    or jsonb_typeof(relationship -> 'capabilities') is distinct from 'object'
    or jsonb_typeof(relationship -> 'friendship') is distinct from 'object'
  then
    perform private.raise_core_error_v1('validation_failed', 'Relationship projection is incomplete.');
  end if;
  capabilities := relationship -> 'capabilities';
  friendship := relationship -> 'friendship';
  begin
    source_event_id_value := (p_projection ->> 'sourceEventId')::uuid;
    source_event_version_value := (p_projection ->> 'sourceEventVersion')::integer;
    relationship_id_value := (relationship ->> 'relationshipId')::uuid;
    relationship_version_value := (relationship ->> 'version')::bigint;
    viewer_player_id_value := (relationship ->> 'viewerPlayerId')::uuid;
    target_player_id_value := (relationship ->> 'targetPlayerId')::uuid;
    correlation_id_value := (p_projection ->> 'correlationId')::uuid;
    causation_id_value := nullif(p_projection ->> 'causationId', '')::uuid;
    occurred_at_value := (p_projection ->> 'occurredAt')::timestamptz;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'Relationship projection identifiers are invalid.');
  end;
  if source_event_version_value <> 2
    or relationship_version_value < 0
    or viewer_player_id_value = target_player_id_value
  then
    perform private.raise_core_error_v1('unsupported_event_version', 'Relationship projection version is unsupported.');
  end if;

  accepted_friendship :=
    friendship ->> 'state' = 'accepted'
    and friendship ->> 'label' = 'friend';
  blocked_value := coalesce((capabilities ->> 'blocked')::boolean, false);
  can_message_value := coalesce((capabilities ->> 'canMessage')::boolean, false);
  can_view_value := coalesce((capabilities ->> 'canViewConversation')::boolean, false);
  relationship_muted_value := coalesce((capabilities ->> 'muted')::boolean, false);
  desired_active := not blocked_value and can_message_value and can_view_value;
  desired_reason := case
    when blocked_value then 'blocked'::public.conversation_access_reason_v2
    else 'source_membership_revoked'::public.conversation_access_reason_v2
  end;

  fingerprint_value := private.command_request_hash_v1(p_projection);
  select * into consumed
  from private.conversation_consumed_events_v2 events
  where events.event_id = source_event_id_value
  for update;
  if consumed.event_id is not null then
    if consumed.payload_fingerprint is distinct from fingerprint_value then
      perform private.raise_core_error_v1('event_replay_conflict', 'Relationship projection event ID is bound to different facts.');
    end if;
    return jsonb_set(consumed.response, '{repeated}', 'true'::jsonb, true);
  end if;

  select versions.observed_version into observed_version_value
  from private.conversation_relationship_versions_v2 versions
  where versions.relationship_id = relationship_id_value
  for update;
  observed_version_value := coalesce(observed_version_value, 0);
  if relationship_version_value < observed_version_value then
    perform private.raise_core_error_v1(
      'source_version_conflict',
      'Relationship snapshot is older than the observed authority version.',
      false,
      jsonb_build_object('current', observed_version_value, 'requested', relationship_version_value)
    );
  end if;

  select * into pair
  from private.conversation_direct_pairs_v2 pairs
  where pairs.player_low_id = least(viewer_player_id_value, target_player_id_value)
    and pairs.player_high_id = greatest(viewer_player_id_value, target_player_id_value)
  for update;
  pair_existed := pair.conversation_id is not null;

  if accepted_friendship and pair.conversation_id is null then
    provisioning_receipt := public.provision_direct_conversation_v2(jsonb_build_object(
      'source', jsonb_build_object(
        'sourceType', 'friendship',
        'sourceId', relationship_id_value,
        'sourceAggregateVersion', greatest(relationship_version_value, 1)
      ),
      'participantPlayerIds', jsonb_build_array(viewer_player_id_value, target_player_id_value),
      'metadata', jsonb_build_object(
        'idempotencyKey', 'relationship-projection:' || source_event_id_value,
        'correlationId', correlation_id_value,
        'causationId', source_event_id_value,
        'expectedAggregateVersion', 0,
        'audit', jsonb_build_object(
          'requestId', 'relationship-projection:' || source_event_id_value,
          'clientCreatedAt', occurred_at_value,
          'clientPlatform', 'service'
        )
      )
    ));
    select * into pair
    from private.conversation_direct_pairs_v2 pairs
    where pairs.player_low_id = least(viewer_player_id_value, target_player_id_value)
      and pairs.player_high_id = greatest(viewer_player_id_value, target_player_id_value);
    event_ids := event_ids || jsonb_build_array((provisioning_receipt ->> 'eventId')::uuid);
    action_value := 'provisioned';
  end if;

  if pair.conversation_id is not null then
    select * into conversation
    from public.conversations_v2 conversations
    where conversations.id = pair.conversation_id
    for update;

    if accepted_friendship and not exists (
      select 1
      from public.conversation_sources_v2 sources
      where sources.conversation_id = conversation.id
        and sources.source_type = 'friendship'
        and sources.source_id = relationship_id_value
        and sources.source_aggregate_version >= greatest(relationship_version_value, 1)
    ) then
      perform private.bind_conversation_source_v2(
        conversation.id,
        'friendship',
        relationship_id_value,
        greatest(relationship_version_value, 1)
      );
      source_changed := true;
      emitted_id := private.enqueue_contract_event_v2(
        'conversation.source_bound.v2',
        'conversation',
        conversation.id,
        conversation.version + 1,
        null,
        correlation_id_value,
        source_event_id_value,
        jsonb_build_object(
          'binding', jsonb_build_object(
            'conversationId', conversation.id,
            'source', jsonb_build_object(
              'sourceType', 'friendship',
              'sourceId', relationship_id_value,
              'sourceAggregateVersion', greatest(relationship_version_value, 1)
            ),
            'boundAt', occurred_at_value
          )
        ),
        'conversation-source-bound:friendship:' || relationship_id_value || ':' || greatest(relationship_version_value, 1)
      );
      event_ids := event_ids || jsonb_build_array(emitted_id);
      if action_value = 'none' then action_value := 'bound_existing'; end if;
    end if;

    foreach player_id_value in array array[viewer_player_id_value, target_player_id_value]
    loop
      select * into member
      from public.conversation_members_v2 members
      where members.conversation_id = conversation.id
        and members.player_id = player_id_value
      for update;
      if member.player_id is null then
        insert into public.conversation_members_v2 (
          conversation_id,
          player_id,
          role,
          state,
          can_message,
          can_view_conversation,
          membership_version,
          version,
          joined_at,
          revoked_at,
          revocation_reason
        ) values (
          conversation.id,
          player_id_value,
          'member',
          case when desired_active then 'active' else 'revoked' end,
          desired_active,
          desired_active,
          greatest(relationship_version_value, 1),
          1,
          occurred_at_value,
          case when desired_active then null else occurred_at_value end,
          case when desired_active then null else desired_reason end
        ) returning * into member;
        insert into public.conversation_read_cursors_v2 (conversation_id, player_id)
        values (conversation.id, player_id_value)
        on conflict (conversation_id, player_id) do nothing;
        member_changed := true;
      else
        member_changed :=
          member.state is distinct from case when desired_active then 'active'::public.conversation_member_state_v2 else 'revoked'::public.conversation_member_state_v2 end
          or member.can_message is distinct from desired_active
          or member.can_view_conversation is distinct from desired_active
          or member.revocation_reason is distinct from case when desired_active then null else desired_reason end;
        if member_changed then
          update public.conversation_members_v2
          set state = case when desired_active then 'active' else 'revoked' end,
              can_message = desired_active,
              can_view_conversation = desired_active,
              membership_version = greatest(member.membership_version, greatest(relationship_version_value, 1)),
              version = member.version + 1,
              revoked_at = case when desired_active then null else occurred_at_value end,
              revocation_reason = case when desired_active then null else desired_reason end
          where conversation_id = conversation.id and player_id = player_id_value
          returning * into member;
        end if;
      end if;

      if member_changed then
        access_changed := true;
        emitted_id := private.enqueue_contract_event_v2(
          case when desired_active then 'conversation.member_added.v2' else 'conversation.member_removed.v2' end,
          'conversation',
          conversation.id,
          conversation.version + 1,
          null,
          correlation_id_value,
          source_event_id_value,
          jsonb_build_object(
            'conversationId', conversation.id,
            'member', jsonb_build_object(
              'playerId', member.player_id,
              'role', member.role,
              'state', member.state,
              'membershipVersion', member.membership_version,
              'version', member.version,
              'joinedAt', member.joined_at,
              'revokedAt', member.revoked_at,
              'revocationReason', member.revocation_reason
            ),
            'source', private.conversation_source_json_v2(conversation.id)
          ),
          'conversation-relationship-member:' || source_event_id_value || ':' || player_id_value
        );
        event_ids := event_ids || jsonb_build_array(emitted_id);
        if not desired_active then
          emitted_id := private.enqueue_contract_event_v2(
            'conversation.access_revoked.v2',
            'conversation',
            conversation.id,
            conversation.version + 1,
            null,
            correlation_id_value,
            source_event_id_value,
            jsonb_build_object(
              'conversationId', conversation.id,
              'playerId', player_id_value,
              'reason', desired_reason
            ),
            'conversation-relationship-access-revoked:' || source_event_id_value || ':' || player_id_value
          );
          event_ids := event_ids || jsonb_build_array(emitted_id);
        end if;
      end if;
    end loop;

    select * into mute_row
    from public.conversation_mutes_v2 mutes
    where mutes.conversation_id = conversation.id
      and mutes.player_id = viewer_player_id_value
    for update;
    mute_changed :=
      coalesce(mute_row.relationship_muted, false) is distinct from relationship_muted_value;
    if mute_row.player_id is null and relationship_muted_value then
      insert into public.conversation_mutes_v2 (
        conversation_id,
        player_id,
        muted,
        relationship_muted,
        version,
        muted_at,
        relationship_muted_at,
        unmuted_at
      ) values (
        conversation.id,
        viewer_player_id_value,
        false,
        true,
        1,
        null,
        occurred_at_value,
        occurred_at_value
      );
    elsif mute_row.player_id is not null and mute_changed then
      update public.conversation_mutes_v2
      set relationship_muted = relationship_muted_value,
          relationship_muted_at = case when relationship_muted_value then occurred_at_value else null end,
          version = version + 1,
          updated_at = now()
      where conversation_id = conversation.id and player_id = viewer_player_id_value;
    end if;

    if access_changed or source_changed or mute_changed then
      update public.conversations_v2
      set version = version + 1,
          updated_at = now()
      where id = conversation.id
      returning * into conversation;
    end if;
    if access_changed then
      action_value := case when desired_active then 'access_reconciled' else 'access_revoked' end;
    elsif mute_changed and action_value = 'none' then
      action_value := 'notification_policy_reconciled';
    elsif accepted_friendship and pair_existed and action_value = 'none' then
      action_value := 'bound_existing';
    end if;
  end if;

  insert into private.conversation_relationship_versions_v2 (
    relationship_id,
    observed_version
  ) values (
    relationship_id_value,
    relationship_version_value
  ) on conflict (relationship_id) do update
  set observed_version = greatest(
        private.conversation_relationship_versions_v2.observed_version,
        excluded.observed_version
      ),
      updated_at = now();

  response := jsonb_build_object(
    'action', action_value,
    'conversationId', pair.conversation_id,
    'relationshipId', relationship_id_value,
    'relationshipVersion', relationship_version_value,
    'sourceEventId', source_event_id_value,
    'eventIds', event_ids,
    'provisioningReceipt', provisioning_receipt,
    'repeated', false
  );
  insert into private.conversation_consumed_events_v2 (
    event_id,
    event_type,
    event_version,
    payload_fingerprint,
    response
  ) values (
    source_event_id_value,
    'relationship.snapshot.v2',
    source_event_version_value,
    fingerprint_value,
    response
  );
  insert into private.audit_logs (action, target_type, target_id, metadata)
  values (
    'reconcile_relationship_conversation_v2',
    'conversation_v2',
    pair.conversation_id,
    jsonb_build_object(
      'relationshipId', relationship_id_value,
      'relationshipVersion', relationship_version_value,
      'sourceEventId', source_event_id_value,
      'receipt', response
    )
  );
  return response;
end;
$$;

create or replace function public.can_subscribe_conversation_v2(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  conversation_id_value uuid;
begin
  begin
    perform private.assert_conversation_feature_v2('realtime');
    if p_topic !~ '^conversation-v2:[0-9a-fA-F-]{36}$' then return false; end if;
    conversation_id_value := substring(p_topic from 17)::uuid;
    actor := private.resolve_conversation_actor_v2(true, false);
    return coalesce((
      private.conversation_access_v2(
        conversation_id_value,
        (actor ->> 'playerId')::uuid
      ) ->> 'canSubscribe'
    )::boolean, false);
  exception when others then
    return false;
  end;
end;
$$;

create or replace function private.broadcast_conversation_message_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select realtime_enabled from private.conversation_authority_config_v2 where singleton) then
    perform realtime.broadcast_changes(
      'conversation-v2:' || new.conversation_id::text,
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

create trigger messages_broadcast_v2
after insert or update on public.messages_v2
for each row execute function private.broadcast_conversation_message_v2();

create policy "Conversation V2 members receive private broadcasts"
on realtime.messages for select
to authenticated
using (
  extension = 'broadcast'
  and public.can_subscribe_conversation_v2(realtime.topic())
);

create or replace function public.consume_relationship_access_event_v2(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  event_type_value text;
  event_version_value integer;
  aggregate_version_value bigint;
  relationship_id_value uuid;
  correlation_id_value uuid;
  actor_player_id_value uuid;
  player_one uuid;
  player_two uuid;
  muter_player_id_value uuid;
  payload_fingerprint_value text;
  consumed private.conversation_consumed_events_v2%rowtype;
  pair private.conversation_direct_pairs_v2%rowtype;
  pair_existed boolean := false;
  conversation public.conversations_v2%rowtype;
  member public.conversation_members_v2%rowtype;
  provisioning_receipt jsonb;
  system_message jsonb;
  event_ids jsonb := '[]'::jsonb;
  emitted_id uuid;
  action_value text := 'none';
  observed_version_value bigint := 0;
  response jsonb;
begin
  perform private.require_conversation_service_v2();
  event_type_value := p_event ->> 'eventType';
  begin
    event_id_value := (p_event ->> 'eventId')::uuid;
    event_version_value := (p_event ->> 'eventVersion')::integer;
    aggregate_version_value := (p_event ->> 'aggregateVersion')::bigint;
    relationship_id_value := (p_event ->> 'aggregateId')::uuid;
    correlation_id_value := (p_event ->> 'correlationId')::uuid;
    actor_player_id_value := nullif(p_event ->> 'actorPlayerId', '')::uuid;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'Relationship event envelope is invalid.');
  end;
  if event_version_value <> 2
    or event_type_value not in (
      'friendship.accepted.v2',
      'player.blocked.v2',
      'player.unblocked.v2',
      'player.muted.v2',
      'player.unmuted.v2'
    )
  then
    perform private.raise_core_error_v1('unsupported_event_version', 'Relationship event type/version is unsupported.');
  end if;

  payload_fingerprint_value := private.command_request_hash_v1(p_event);
  select * into consumed
  from private.conversation_consumed_events_v2 events
  where events.event_id = event_id_value
  for update;
  if consumed.event_id is not null then
    if consumed.payload_fingerprint is distinct from payload_fingerprint_value then
      perform private.raise_core_error_v1('event_replay_conflict', 'Relationship event ID is bound to different facts.');
    end if;
    return jsonb_set(consumed.response, '{repeated}', 'true'::jsonb, true);
  end if;
  select versions.observed_version into observed_version_value
  from private.conversation_relationship_versions_v2 versions
  where versions.relationship_id = relationship_id_value
  for update;
  observed_version_value := coalesce(observed_version_value, 0);
  if aggregate_version_value < observed_version_value then
    perform private.raise_core_error_v1(
      'source_version_conflict',
      'Relationship event version is older than the observed authority version.',
      false,
      jsonb_build_object('current', observed_version_value, 'requested', aggregate_version_value)
    );
  end if;

  if event_type_value = 'friendship.accepted.v2' then
    if p_event #>> '{payload,requestState}' <> 'accepted'
      or p_event #>> '{payload,friendshipLabel}' <> 'friend'
    then
      perform private.raise_core_error_v1('validation_failed', 'Friendship accepted event payload is inconsistent.');
    end if;
    player_one := (p_event #>> '{payload,requesterPlayerId}')::uuid;
    player_two := (p_event #>> '{payload,recipientPlayerId}')::uuid;
  elsif event_type_value in ('player.blocked.v2', 'player.unblocked.v2') then
    player_one := (p_event #>> '{payload,blockerPlayerId}')::uuid;
    player_two := (p_event #>> '{payload,blockedPlayerId}')::uuid;
  else
    player_one := (p_event #>> '{payload,muterPlayerId}')::uuid;
    player_two := (p_event #>> '{payload,mutedPlayerId}')::uuid;
    muter_player_id_value := player_one;
  end if;
  if player_one is null or player_two is null or player_one = player_two then
    perform private.raise_core_error_v1('validation_failed', 'Relationship event player pair is invalid.');
  end if;

  select * into pair
  from private.conversation_direct_pairs_v2 pairs
  where pairs.player_low_id = least(player_one, player_two)
    and pairs.player_high_id = greatest(player_one, player_two)
  for update;
  pair_existed := pair.conversation_id is not null;

  if event_type_value = 'friendship.accepted.v2' then
    provisioning_receipt := public.provision_direct_conversation_v2(jsonb_build_object(
      'source', jsonb_build_object(
        'sourceType', 'friendship',
        'sourceId', relationship_id_value,
        'sourceAggregateVersion', aggregate_version_value
      ),
      'participantPlayerIds', jsonb_build_array(player_one, player_two),
      'metadata', jsonb_build_object(
        'idempotencyKey', 'friendship-conversation:' || event_id_value,
        'correlationId', correlation_id_value,
        'causationId', event_id_value,
        'expectedAggregateVersion', 0,
        'audit', jsonb_build_object(
          'requestId', 'relationship-event:' || event_id_value,
          'clientCreatedAt', p_event ->> 'occurredAt',
          'clientPlatform', 'service'
        )
      )
    ));
    select * into pair
    from private.conversation_direct_pairs_v2 pairs
    where pairs.player_low_id = least(player_one, player_two)
      and pairs.player_high_id = greatest(player_one, player_two);
    event_ids := event_ids || jsonb_build_array((provisioning_receipt ->> 'eventId')::uuid);
    action_value := case when pair_existed then 'bound_existing' else 'provisioned' end;
    system_message := public.project_conversation_system_activity_v2(jsonb_build_object(
      'conversationId', pair.conversation_id,
      'source', jsonb_build_object(
        'sourceType', 'friendship',
        'sourceId', relationship_id_value,
        'sourceAggregateVersion', aggregate_version_value
      ),
      'sourceEventId', event_id_value,
      'sourceEventType', event_type_value,
      'sourceEventVersion', event_version_value,
      'correlationId', correlation_id_value,
      'causationId', nullif(p_event ->> 'causationId', '')::uuid,
      'payload', p_event -> 'payload'
    ));
  elsif pair.conversation_id is not null then
    select * into conversation
    from public.conversations_v2 conversations
    where conversations.id = pair.conversation_id
    for update;

    if event_type_value = 'player.blocked.v2' then
      for member in
        update public.conversation_members_v2 members
        set state = 'revoked',
            can_message = false,
            can_view_conversation = false,
            membership_version = greatest(members.membership_version, aggregate_version_value),
            version = members.version + case
              when members.state <> 'revoked'
                or members.revocation_reason is distinct from 'blocked'
                or members.can_message
                or members.can_view_conversation
              then 1 else 0 end,
            revoked_at = coalesce(members.revoked_at, (p_event ->> 'occurredAt')::timestamptz),
            revocation_reason = 'blocked'
        where members.conversation_id = conversation.id
          and members.player_id in (player_one, player_two)
        returning members.*
      loop
        emitted_id := private.enqueue_contract_event_v2(
          'conversation.member_removed.v2',
          'conversation',
          conversation.id,
          conversation.version + 1,
          actor_player_id_value,
          correlation_id_value,
          event_id_value,
          jsonb_build_object(
            'conversationId', conversation.id,
            'member', jsonb_build_object(
              'playerId', member.player_id,
              'role', member.role,
              'state', member.state,
              'membershipVersion', member.membership_version,
              'version', member.version,
              'joinedAt', member.joined_at,
              'revokedAt', member.revoked_at,
              'revocationReason', member.revocation_reason
            ),
            'source', private.conversation_source_json_v2(conversation.id)
          ),
          'conversation-block-member-removed:' || event_id_value || ':' || member.player_id
        );
        event_ids := event_ids || jsonb_build_array(emitted_id);
        emitted_id := private.enqueue_contract_event_v2(
          'conversation.access_revoked.v2',
          'conversation',
          conversation.id,
          conversation.version + 1,
          actor_player_id_value,
          correlation_id_value,
          event_id_value,
          jsonb_build_object(
            'conversationId', conversation.id,
            'playerId', member.player_id,
            'reason', 'blocked'
          ),
          'conversation-block-access-revoked:' || event_id_value || ':' || member.player_id
        );
        event_ids := event_ids || jsonb_build_array(emitted_id);
      end loop;
      update public.conversations_v2
      set version = version + 1,
          updated_at = now()
      where id = conversation.id
      returning * into conversation;
      action_value := 'access_revoked';
    elsif event_type_value in ('player.muted.v2', 'player.unmuted.v2') then
      insert into public.conversation_mutes_v2 (
        conversation_id,
        player_id,
        muted,
        relationship_muted,
        version,
        muted_at,
        relationship_muted_at,
        unmuted_at
      ) values (
        conversation.id,
        muter_player_id_value,
        false,
        event_type_value = 'player.muted.v2',
        1,
        null,
        case when event_type_value = 'player.muted.v2' then (p_event ->> 'occurredAt')::timestamptz else null end,
        now()
      ) on conflict (conversation_id, player_id) do update
      set relationship_muted = excluded.relationship_muted,
          relationship_muted_at = excluded.relationship_muted_at,
          version = public.conversation_mutes_v2.version + 1,
          updated_at = now();
      update public.conversations_v2
      set version = version + 1,
          updated_at = now()
      where id = conversation.id
      returning * into conversation;
      action_value := 'notification_policy_reconciled';
    end if;
    -- player.unblocked.v2 never restores access. A full relationship snapshot
    -- at the same or a newer authority version must explicitly reconcile it.
  end if;

  response := jsonb_build_object(
    'relationshipId', relationship_id_value,
    'relationshipVersion', aggregate_version_value,
    'sourceEventId', event_id_value,
    'conversationId', pair.conversation_id,
    'action', action_value,
    'eventIds', event_ids,
    'provisioningReceipt', provisioning_receipt,
    'systemMessage', system_message,
    'repeated', false
  );
  insert into private.conversation_relationship_versions_v2 (
    relationship_id,
    observed_version
  ) values (
    relationship_id_value,
    aggregate_version_value
  ) on conflict (relationship_id) do update
  set observed_version = greatest(
        private.conversation_relationship_versions_v2.observed_version,
        excluded.observed_version
      ),
      updated_at = now();

  insert into private.conversation_consumed_events_v2 (
    event_id,
    event_type,
    event_version,
    payload_fingerprint,
    response
  ) values (
    event_id_value,
    event_type_value,
    event_version_value,
    payload_fingerprint_value,
    response
  );
  return response;
end;
$$;

create or replace function private.acknowledge_session_conversation_v2(
  p_session_id uuid,
  p_conversation_id uuid,
  p_source_aggregate_version bigint,
  p_membership jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  response jsonb;
begin
  if to_regprocedure(
    'public.record_session_conversation_projection_v2(uuid,uuid,bigint,bigint,jsonb,text,text)'
  ) is null then
    return jsonb_build_object(
      'acknowledgementPending', true,
      'reason', 'session_projection_ack_unavailable'
    );
  end if;
  execute
    'select public.record_session_conversation_projection_v2($1,$2,$3,$4,$5,$6,$7)'
    into response
    using
      p_session_id,
      p_conversation_id,
      p_source_aggregate_version,
      (p_membership ->> 'membershipVersion')::bigint,
      p_membership,
      'ready',
      null;
  return jsonb_build_object('acknowledgementPending', false, 'session', response);
end;
$$;

create or replace function public.consume_session_conversation_event_v2(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  event_type_value text;
  event_version_value integer;
  aggregate_version_value bigint;
  correlation_id_value uuid;
  actor_player_id_value uuid;
  session_id_value uuid;
  membership jsonb;
  session_snapshot jsonb;
  payload_fingerprint_value text;
  consumed private.conversation_consumed_events_v2%rowtype;
  source_row public.conversation_sources_v2%rowtype;
  conversation public.conversations_v2%rowtype;
  command jsonb;
  receipt jsonb;
  acknowledgement jsonb;
  activity jsonb;
  response jsonb;
begin
  perform private.require_conversation_service_v2();
  event_type_value := p_event ->> 'eventType';
  begin
    event_id_value := (p_event ->> 'eventId')::uuid;
    event_version_value := (p_event ->> 'eventVersion')::integer;
    aggregate_version_value := (p_event ->> 'aggregateVersion')::bigint;
    correlation_id_value := (p_event ->> 'correlationId')::uuid;
    actor_player_id_value := nullif(p_event ->> 'actorPlayerId', '')::uuid;
    session_id_value := coalesce(
      nullif(p_event #>> '{payload,sessionId}', '')::uuid,
      nullif(p_event #>> '{payload,session,sessionId}', '')::uuid,
      (p_event ->> 'aggregateId')::uuid
    );
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'Session event envelope is invalid.');
  end;
  if event_version_value <> 2
    or event_type_value not in (
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
  then
    perform private.raise_core_error_v1('unsupported_event_version', 'Session event type/version is unsupported.');
  end if;

  payload_fingerprint_value := private.command_request_hash_v1(p_event);
  select * into consumed
  from private.conversation_consumed_events_v2 events
  where events.event_id = event_id_value
  for update;
  if consumed.event_id is not null then
    if consumed.payload_fingerprint is distinct from payload_fingerprint_value then
      perform private.raise_core_error_v1('event_replay_conflict', 'Session event ID is bound to different facts.');
    end if;
    response := consumed.response;
    if coalesce((response #>> '{acknowledgement,acknowledgementPending}')::boolean, false)
      and nullif(response ->> 'conversationId', '') is not null
    then
      membership := coalesce(
        p_event #> '{payload,membership}',
        private.play_session_membership_snapshot_v2(session_id_value)
      );
      acknowledgement := private.acknowledge_session_conversation_v2(
        session_id_value,
        (response ->> 'conversationId')::uuid,
        aggregate_version_value,
        membership
      );
      response := jsonb_set(response, '{acknowledgement}', acknowledgement, true);
      update private.conversation_consumed_events_v2 as consumed_events
      set response = jsonb_set(
            consumed.response,
            '{acknowledgement}',
            acknowledgement,
            true
          )
      where consumed_events.event_id = event_id_value;
    end if;
    return jsonb_set(response, '{repeated}', 'true'::jsonb, true);
  end if;

  membership := p_event #> '{payload,membership}';
  session_snapshot := p_event #> '{payload,session}';
  select * into source_row
  from public.conversation_sources_v2 sources
  where sources.source_type = 'play_session' and sources.source_id = session_id_value;

  if event_type_value = 'session.created.v2'
    and coalesce((p_event #>> '{payload,communicationProvisioningRequired}')::boolean, false)
  then
    command := jsonb_build_object(
      'source', jsonb_build_object(
        'sourceType', 'play_session',
        'sourceId', session_id_value,
        'sourceAggregateVersion', aggregate_version_value
      ),
      'title', coalesce(session_snapshot ->> 'title', 'Play Session'),
      'membership', membership,
      'metadata', jsonb_build_object(
        'idempotencyKey', 'session-conversation:' || event_id_value,
        'correlationId', correlation_id_value,
        'causationId', event_id_value,
        'expectedAggregateVersion', 0,
        'audit', jsonb_build_object(
          'requestId', 'session-event:' || event_id_value,
          'clientCreatedAt', p_event ->> 'occurredAt',
          'clientPlatform', 'service'
        )
      )
    );
    receipt := public.provision_session_conversation_v2(command);
  elsif event_type_value = 'session.member_joined.v2'
    and source_row.conversation_id is null
    and coalesce((p_event #>> '{payload,communicationProvisioningRequired}')::boolean, false)
  then
    command := jsonb_build_object(
      'source', jsonb_build_object(
        'sourceType', 'play_session',
        'sourceId', session_id_value,
        'sourceAggregateVersion', aggregate_version_value
      ),
      'title', 'Play Session',
      'membership', membership,
      'metadata', jsonb_build_object(
        'idempotencyKey', 'session-conversation:' || event_id_value,
        'correlationId', correlation_id_value,
        'causationId', event_id_value,
        'expectedAggregateVersion', 0,
        'audit', jsonb_build_object(
          'requestId', 'session-event:' || event_id_value,
          'clientCreatedAt', p_event ->> 'occurredAt',
          'clientPlatform', 'service'
        )
      )
    );
    receipt := public.provision_session_conversation_v2(command);
  elsif event_type_value in ('session.member_joined.v2', 'session.member_left.v2')
    and source_row.conversation_id is not null
  then
    select * into conversation
    from public.conversations_v2
    where id = source_row.conversation_id;
    command := jsonb_build_object(
      'conversationId', conversation.id,
      'source', jsonb_build_object(
        'sourceType', 'play_session',
        'sourceId', session_id_value,
        'sourceAggregateVersion', aggregate_version_value
      ),
      'membership', membership,
      'revocationReason', 'source_membership_revoked',
      'metadata', jsonb_build_object(
        'idempotencyKey', 'session-membership:' || event_id_value,
        'correlationId', correlation_id_value,
        'causationId', event_id_value,
        'expectedAggregateVersion', conversation.version,
        'audit', jsonb_build_object(
          'requestId', 'session-event:' || event_id_value,
          'clientCreatedAt', p_event ->> 'occurredAt',
          'clientPlatform', 'service'
        )
      )
    );
    receipt := public.reconcile_conversation_membership_v2(command);
  end if;

  select * into source_row
  from public.conversation_sources_v2 sources
  where sources.source_type = 'play_session' and sources.source_id = session_id_value;
  if source_row.conversation_id is not null then
    acknowledgement := private.acknowledge_session_conversation_v2(
      session_id_value,
      source_row.conversation_id,
      aggregate_version_value,
      coalesce(membership, private.play_session_membership_snapshot_v2(session_id_value))
    );
    activity := public.project_conversation_system_activity_v2(jsonb_build_object(
      'conversationId', source_row.conversation_id,
      'source', jsonb_build_object(
        'sourceType', 'play_session',
        'sourceId', session_id_value,
        'sourceAggregateVersion', aggregate_version_value
      ),
      'sourceEventId', event_id_value,
      'sourceEventType', event_type_value,
      'sourceEventVersion', event_version_value,
      'correlationId', correlation_id_value,
      'causationId', nullif(p_event ->> 'causationId', '')::uuid,
      'payload', p_event -> 'payload'
    ));
  else
    acknowledgement := jsonb_build_object('acknowledgementPending', true, 'reason', 'conversation_not_provisioned');
  end if;

  response := jsonb_build_object(
    'eventId', event_id_value,
    'sessionId', session_id_value,
    'conversationId', source_row.conversation_id,
    'provisioningReceipt', receipt,
    'acknowledgement', acknowledgement,
    'systemMessage', activity,
    'repeated', false
  );
  insert into private.conversation_consumed_events_v2 (
    event_id,
    event_type,
    event_version,
    payload_fingerprint,
    response
  ) values (
    event_id_value,
    event_type_value,
    event_version_value,
    payload_fingerprint_value,
    response
  );
  return response;
end;
$$;

alter table public.reports_v2
  add column conversation_v2_id uuid references public.conversations_v2(id) on delete set null,
  add column message_v2_id uuid references public.messages_v2(id) on delete set null;
alter table public.reports_v2 drop constraint reports_v2_target_shape_check;
alter table public.reports_v2 add constraint reports_v2_target_shape_check check (
  (
    target_kind = 'player'
    and conversation_id is null
    and message_id is null
    and conversation_v2_id is null
    and message_v2_id is null
  )
  or (
    target_kind = 'message'
    and (
      (
        conversation_id is not null
        and message_id is not null
        and conversation_v2_id is null
        and message_v2_id is null
      )
      or (
        conversation_id is null
        and message_id is null
        and conversation_v2_id is not null
        and message_v2_id is not null
      )
    )
  )
);
create index reports_v2_conversation_message_v2_idx
  on public.reports_v2 (conversation_v2_id, message_v2_id)
  where conversation_v2_id is not null;

create or replace function private.prevent_message_report_evidence_mutation_v2()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'message_report_evidence_v2 is immutable';
end;
$$;
create trigger message_report_evidence_v2_immutable
before update or delete on public.message_report_evidence_v2
for each row execute function private.prevent_message_report_evidence_mutation_v2();

create or replace function public.capture_message_report_evidence_v2(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  report public.reports_v2%rowtype;
  message public.messages_v2%rowtype;
  evidence public.message_report_evidence_v2%rowtype;
begin
  actor := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;
  select * into report from public.reports_v2 where id = p_report_id;
  if report.id is null or report.target_kind <> 'message' then
    perform private.raise_core_error_v1('report_target_not_found', 'Message report was not found.');
  end if;
  if report.reporter_player_id <> actor_player_id then
    perform private.raise_core_error_v1('report_evidence_invalid', 'Only the reporter may capture message evidence.');
  end if;

  select * into evidence
  from public.message_report_evidence_v2 evidence_rows
  where evidence_rows.report_id = report.id;
  if evidence.id is not null then
    return jsonb_build_object(
      'evidenceId', evidence.id,
      'conversationId', evidence.conversation_id,
      'messageId', evidence.message_id,
      'reporterPlayerId', evidence.reporter_player_id,
      'capturedAt', evidence.captured_at,
      'contentFingerprint', evidence.content_fingerprint,
      'repeated', true
    );
  end if;

  if report.conversation_v2_id is null or report.message_v2_id is null then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'The report targets a legacy message whose evidence is stored by the V1 compatibility path.'
    );
  end if;
  if not exists (
    select 1
    from public.conversation_members_v2 members
    where members.conversation_id = report.conversation_v2_id
      and members.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Only a current or historical conversation member may capture evidence.'
    );
  end if;
  select * into message
  from public.messages_v2 messages
  where messages.id = report.message_v2_id
    and messages.conversation_id = report.conversation_v2_id;
  if message.id is null then
    perform private.raise_core_error_v1('report_target_not_found', 'The V2 message was not found.');
  end if;

  insert into public.message_report_evidence_v2 (
    report_id,
    conversation_id,
    message_id,
    reporter_player_id,
    sender_player_id,
    message_sequence,
    content_kind,
    content_snapshot,
    content_fingerprint,
    message_created_at,
    message_tombstoned_at
  ) values (
    report.id,
    message.conversation_id,
    message.id,
    actor_player_id,
    message.sender_player_id,
    message.sequence,
    message.kind,
    message.content,
    message.content_fingerprint,
    message.created_at,
    message.tombstoned_at
  ) on conflict (report_id) do nothing
  returning * into evidence;
  if evidence.id is null then
    select * into evidence
    from public.message_report_evidence_v2 evidence_rows
    where evidence_rows.report_id = report.id;
  end if;

  return jsonb_build_object(
    'evidenceId', evidence.id,
    'conversationId', evidence.conversation_id,
    'messageId', evidence.message_id,
    'reporterPlayerId', evidence.reporter_player_id,
    'capturedAt', evidence.captured_at,
    'contentFingerprint', evidence.content_fingerprint,
    'repeated', false
  );
end;
$$;

create or replace function public.report_message_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'report_message_v2';
  preflight_command jsonb;
  command_context jsonb;
  report_input jsonb;
  actor_player_id uuid;
  target_player_id_value uuid;
  conversation_id_value uuid;
  message_id_value uuid;
  message_v2_row public.messages_v2%rowtype;
  message_v1_row public.messages%rowtype;
  report_row public.reports_v2%rowtype;
  evidence_id_value uuid;
  content_fingerprint_value text;
  event_payload jsonb;
begin
  preflight_command := command || jsonb_build_object(
    'expectedRelationshipVersion', command -> 'expectedReportVersion'
  );
  command_context := private.begin_social_command_v2(command_name, preflight_command);
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  report_input := private.validate_report_command_v2(command);
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  begin
    target_player_id_value := (command ->> 'targetPlayerId')::uuid;
    conversation_id_value := (command ->> 'conversationId')::uuid;
    message_id_value := (command ->> 'messageId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'targetPlayerId, conversationId and messageId must be valid UUIDs.'
    );
  end;
  if actor_player_id = target_player_id_value then
    perform private.raise_core_error_v1('report_self_forbidden', 'A player cannot report own message.');
  end if;
  perform private.assert_social_target_v2(target_player_id_value, false, false);

  select * into message_v2_row
  from public.messages_v2 messages
  where messages.id = message_id_value and messages.conversation_id = conversation_id_value;

  if message_v2_row.id is not null then
    if not exists (
      select 1 from public.conversation_members_v2 members
      where members.conversation_id = conversation_id_value
        and members.player_id = actor_player_id
    ) then
      perform private.raise_core_error_v1(
        'report_evidence_invalid',
        'Only a current or historical V2 conversation member may report a message.'
      );
    end if;
    if message_v2_row.sender_player_id is distinct from target_player_id_value then
      perform private.raise_core_error_v1(
        'report_evidence_invalid',
        'The reported player is not the authoritative V2 message sender.'
      );
    end if;

    insert into public.reports_v2 (
      reporter_player_id,
      target_player_id,
      target_kind,
      category,
      details,
      conversation_v2_id,
      message_v2_id,
      state,
      version,
      correlation_id
    ) values (
      actor_player_id,
      target_player_id_value,
      'message',
      report_input ->> 'category',
      report_input ->> 'details',
      conversation_id_value,
      message_id_value,
      'submitted',
      1,
      (command_context ->> 'correlationId')::uuid
    ) returning * into report_row;

    insert into public.report_evidence_v2 (report_id, evidence_kind, payload)
    values (
      report_row.id,
      'message_reference',
      jsonb_build_object(
        'contentFingerprint', message_v2_row.content_fingerprint,
        'contentKind', message_v2_row.kind,
        'conversationId', conversation_id_value,
        'messageCreatedAt', message_v2_row.created_at,
        'messageId', message_id_value,
        'messageTombstonedAt', message_v2_row.tombstoned_at,
        'senderPlayerId', message_v2_row.sender_player_id,
        'sequence', message_v2_row.sequence,
        'schemaVersion', 2
      )
    ) returning id into evidence_id_value;

    insert into public.message_report_evidence_v2 (
      report_id,
      conversation_id,
      message_id,
      reporter_player_id,
      sender_player_id,
      message_sequence,
      content_kind,
      content_snapshot,
      content_fingerprint,
      message_created_at,
      message_tombstoned_at
    ) values (
      report_row.id,
      conversation_id_value,
      message_id_value,
      actor_player_id,
      message_v2_row.sender_player_id,
      message_v2_row.sequence,
      message_v2_row.kind,
      message_v2_row.content,
      message_v2_row.content_fingerprint,
      message_v2_row.created_at,
      message_v2_row.tombstoned_at
    );
  else
    if not private.is_conversation_player_member_v1(conversation_id_value, actor_player_id) then
      perform private.raise_core_error_v1(
        'report_evidence_invalid',
        'Only a current or historical conversation member may report a message.'
      );
    end if;
    select * into message_v1_row
    from public.messages messages
    where messages.id = message_id_value
      and messages.conversation_id = conversation_id_value
      and messages.schema_version_v1 = 1;
    if message_v1_row.id is null then
      perform private.raise_core_error_v1('report_target_not_found', 'The authoritative conversation message does not exist.');
    end if;
    if message_v1_row.sender_player_id_v1 is distinct from target_player_id_value then
      perform private.raise_core_error_v1(
        'report_evidence_invalid',
        'The reported player is not the authoritative message sender.'
      );
    end if;
    content_fingerprint_value := private.command_request_hash_v1(coalesce(message_v1_row.content_v1, '{}'::jsonb));
    insert into public.reports_v2 (
      reporter_player_id,
      target_player_id,
      target_kind,
      category,
      details,
      conversation_id,
      message_id,
      state,
      version,
      correlation_id
    ) values (
      actor_player_id,
      target_player_id_value,
      'message',
      report_input ->> 'category',
      report_input ->> 'details',
      conversation_id_value,
      message_id_value,
      'submitted',
      1,
      (command_context ->> 'correlationId')::uuid
    ) returning * into report_row;
    insert into public.report_evidence_v2 (report_id, evidence_kind, payload)
    values (
      report_row.id,
      'message_reference',
      jsonb_build_object(
        'contentFingerprint', content_fingerprint_value,
        'contentKind', message_v1_row.content_kind_v1,
        'conversationId', conversation_id_value,
        'messageCreatedAt', message_v1_row.created_at,
        'messageId', message_id_value,
        'messageTombstonedAt', message_v1_row.deleted_at,
        'senderPlayerId', message_v1_row.sender_player_id_v1,
        'sequence', message_v1_row.sequence_v1,
        'schemaVersion', 1
      )
    ) returning id into evidence_id_value;
  end if;

  event_payload := jsonb_build_object(
    'category', report_row.category,
    'conversationId', conversation_id_value,
    'messageId', message_id_value,
    'reportId', report_row.id,
    'reporterPlayerId', actor_player_id,
    'targetPlayerId', target_player_id_value
  );
  return private.finish_report_submission_v2(
    command_name,
    command_context,
    report_row,
    event_payload,
    jsonb_build_object(
      'conversationId', conversation_id_value,
      'evidenceId', evidence_id_value,
      'messageId', message_id_value,
      'conversationSchemaVersion', case when message_v2_row.id is null then 1 else 2 end
    )
  );
end;
$$;

create or replace function public.acknowledge_message_delivery_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  message public.messages_v2%rowtype;
  receipt public.message_receipts_v2%rowtype;
  message_id_value uuid;
  correlation_id_value uuid;
  event_id uuid;
  was_acknowledged boolean;
begin
  actor := private.resolve_conversation_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;
  begin
    message_id_value := (command ->> 'messageId')::uuid;
    correlation_id_value := (command ->> 'correlationId')::uuid;
  exception when others then
    perform private.raise_core_error_v1('validation_failed', 'Delivery acknowledgement identifiers are invalid.');
  end;
  select * into message from public.messages_v2 where id = message_id_value;
  if message.id is null then
    perform private.raise_core_error_v1('message_not_found', 'Message was not found.');
  end if;
  select * into receipt
  from public.message_receipts_v2 receipts
  where receipts.message_id = message.id and receipts.recipient_player_id = actor_player_id
  for update;
  if receipt.message_id is null then
    perform private.raise_core_error_v1('conversation_access_revoked', 'Message delivery is not addressed to this player.');
  end if;
  was_acknowledged := receipt.state <> 'queued';
  if receipt.state = 'queued' then
    update public.message_receipts_v2
    set state = 'delivered',
        delivered_at = now(),
        version = version + 1
    where message_id = message.id and recipient_player_id = actor_player_id
    returning * into receipt;
  end if;
  event_id := private.enqueue_contract_event_v2(
    'message.delivered.v2',
    'conversation',
    message.conversation_id,
    (select version from public.conversations_v2 where id = message.conversation_id),
    actor_player_id,
    correlation_id_value,
    nullif(command ->> 'causationId', '')::uuid,
    jsonb_build_object(
      'messageId', message.id,
      'recipientPlayerId', actor_player_id,
      'deliveredAt', coalesce(receipt.delivered_at, receipt.read_at)
    ),
    'message-delivered:' || message.id || ':' || actor_player_id
  );
  return jsonb_build_object(
    'messageId', message.id,
    'recipientPlayerId', actor_player_id,
    'state', receipt.state,
    'version', receipt.version,
    'eventId', event_id,
    'repeated', was_acknowledged
  );
end;
$$;

create or replace function public.can_access_conversation_media_v2(p_media_asset_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor jsonb;
begin
  begin
    actor := private.resolve_conversation_actor_v2(false, false);
  exception when others then return false;
  end;
  return exists (
    select 1
    from public.messages_v2 messages
    where messages.media_asset_id = p_media_asset_id
      and (private.conversation_access_v2(
        messages.conversation_id,
        (actor ->> 'playerId')::uuid
      ) ->> 'canRead')::boolean
  );
end;
$$;

create policy "Conversation V2 members read ready message media"
on public.media_assets for select
to authenticated
using (
  visibility = 'conversation_members'
  and status = 'ready'
  and moderation_status = 'approved'
  and deleted_at is null
  and public.can_access_conversation_media_v2(id)
);

-- V1 direct conversations are mapped with the same ConversationId. Messages
-- remain in the V1 store and are projected by get_conversation_timeline_v2;
-- new V2 messages continue after the V1 sequence watermark.
insert into public.conversations_v2 (
  id,
  kind,
  state,
  title,
  version,
  last_sequence,
  legacy_conversation_id,
  created_at,
  updated_at,
  tombstoned_at
)
select
  conversations.id,
  'direct',
  case when conversations.state_v1 = 'closed' then 'tombstoned' else 'open' end,
  null,
  greatest(conversations.version_v1, 1),
  conversations.last_sequence_v1,
  conversations.id,
  conversations.created_at,
  greatest(conversations.created_at, coalesce(conversations.last_message_at, conversations.created_at)),
  case when conversations.state_v1 = 'closed' then coalesce(conversations.closed_at_v1, now()) else null end
from public.conversations conversations
where conversations.match_id is not null
on conflict (id) do nothing;

insert into public.conversation_sources_v2 (
  conversation_id,
  source_type,
  source_id,
  source_aggregate_version,
  bound_at
)
select
  conversations.id,
  'direct_match',
  conversations.match_id,
  1,
  conversations.created_at
from public.conversations conversations
where conversations.match_id is not null
on conflict (source_type, source_id) do nothing;

insert into public.conversation_members_v2 (
  conversation_id,
  player_id,
  role,
  state,
  can_message,
  can_view_conversation,
  membership_version,
  version,
  joined_at,
  created_at,
  updated_at
)
select
  participants.conversation_id,
  participants.player_id,
  'member',
  'active',
  conversations.state_v1 = 'open',
  true,
  1,
  greatest(participants.version, 1),
  participants.created_at,
  participants.created_at,
  coalesce(participants.last_read_at, participants.created_at)
from public.conversation_participants_v1 participants
join public.conversations conversations on conversations.id = participants.conversation_id
where conversations.match_id is not null
on conflict (conversation_id, player_id) do nothing;

insert into public.conversation_read_cursors_v2 (
  conversation_id,
  player_id,
  last_read_sequence,
  version,
  updated_at
)
select
  participants.conversation_id,
  participants.player_id,
  participants.last_read_sequence,
  greatest(participants.version, 1),
  coalesce(participants.last_read_at, participants.created_at)
from public.conversation_participants_v1 participants
join public.conversations conversations on conversations.id = participants.conversation_id
where conversations.match_id is not null
on conflict (conversation_id, player_id) do nothing;

insert into private.conversation_direct_pairs_v2 (
  player_low_id,
  player_high_id,
  conversation_id,
  created_at
)
select
  min(participants.player_id),
  max(participants.player_id),
  participants.conversation_id,
  min(participants.created_at)
from public.conversation_participants_v1 participants
join public.conversations conversations on conversations.id = participants.conversation_id
where conversations.match_id is not null
group by participants.conversation_id
having count(*) = 2 and min(participants.player_id) < max(participants.player_id)
on conflict (player_low_id, player_high_id) do nothing;

revoke execute on function public.provision_direct_conversation_v2(jsonb) from public, anon, authenticated;
revoke execute on function public.provision_session_conversation_v2(jsonb) from public, anon, authenticated;
revoke execute on function public.reconcile_conversation_membership_v2(jsonb) from public, anon, authenticated;
revoke execute on function public.project_conversation_system_activity_v2(jsonb) from public, anon, authenticated;
revoke execute on function public.consume_relationship_access_event_v2(jsonb) from public, anon, authenticated;
revoke execute on function public.reconcile_relationship_conversation_v2(jsonb) from public, anon, authenticated;
revoke execute on function public.consume_session_conversation_event_v2(jsonb) from public, anon, authenticated;
revoke execute on function public.tombstone_conversation_v2(jsonb) from public, anon, authenticated;
grant execute on function public.provision_direct_conversation_v2(jsonb) to service_role;
grant execute on function public.provision_session_conversation_v2(jsonb) to service_role;
grant execute on function public.reconcile_conversation_membership_v2(jsonb) to service_role;
grant execute on function public.project_conversation_system_activity_v2(jsonb) to service_role;
grant execute on function public.consume_relationship_access_event_v2(jsonb) to service_role;
grant execute on function public.reconcile_relationship_conversation_v2(jsonb) to service_role;
grant execute on function public.consume_session_conversation_event_v2(jsonb) to service_role;
grant execute on function public.tombstone_conversation_v2(jsonb) to service_role;

revoke execute on function public.send_message_v2(jsonb) from public, anon;
revoke execute on function public.send_media_message_v2(jsonb) from public, anon;
revoke execute on function public.advance_read_cursor_v2(jsonb) from public, anon;
revoke execute on function public.mute_conversation_v2(jsonb) from public, anon;
revoke execute on function public.unmute_conversation_v2(jsonb) from public, anon;
revoke execute on function public.get_conversation_v2(uuid) from public, anon;
revoke execute on function public.list_conversation_inbox_v2(integer,timestamptz,uuid) from public, anon;
revoke execute on function public.get_conversation_timeline_v2(uuid,integer,bigint) from public, anon;
revoke execute on function public.can_subscribe_conversation_v2(text) from public, anon;
revoke execute on function public.acknowledge_message_delivery_v2(jsonb) from public, anon;
revoke execute on function public.can_access_conversation_media_v2(uuid) from public, anon;
revoke execute on function public.capture_message_report_evidence_v2(uuid) from public, anon;
grant execute on function public.send_message_v2(jsonb) to authenticated;
grant execute on function public.send_media_message_v2(jsonb) to authenticated;
grant execute on function public.advance_read_cursor_v2(jsonb) to authenticated;
grant execute on function public.mute_conversation_v2(jsonb) to authenticated;
grant execute on function public.unmute_conversation_v2(jsonb) to authenticated;
grant execute on function public.get_conversation_v2(uuid) to authenticated;
grant execute on function public.list_conversation_inbox_v2(integer,timestamptz,uuid) to authenticated;
grant execute on function public.get_conversation_timeline_v2(uuid,integer,bigint) to authenticated;
grant execute on function public.can_subscribe_conversation_v2(text) to authenticated;
grant execute on function public.acknowledge_message_delivery_v2(jsonb) to authenticated;
grant execute on function public.can_access_conversation_media_v2(uuid) to authenticated;
grant execute on function public.capture_message_report_evidence_v2(uuid) to authenticated;

insert into private.audit_logs (action, target_type, metadata)
values (
  'conversation_authority_v2_enabled',
  'program',
  jsonb_build_object(
    'migration', '202607140058_core_v2_conversation_authority',
    'readsEnabled', true,
    'writesEnabled', true,
    'provisioningEnabled', true,
    'realtimeEnabled', true,
    'notificationsEnabled', false,
    'shadowInboxEnabled', true,
    'v1HistoryRewritten', false
  )
);

comment on table public.conversations_v2 is
  'Core V2 Conversation aggregate. Canonical identity is PlayerId; V1 rows are compatibility mappings only.';
comment on table public.message_report_evidence_v2 is
  'Immutable authoritative content evidence captured for a submitted message report, retained after block or tombstone.';
comment on function public.consume_session_conversation_event_v2(jsonb) is
  'Replay-safe Senior 2 session-event consumer. Provisions/reconciles from full membership and dynamically acknowledges the supplier projection RPC.';
comment on function public.consume_relationship_access_event_v2(jsonb) is
  'Replay-safe Senior 1 block/mute consumer. Block revokes API/realtime/delivery access; relationship mute changes notification policy only.';
comment on function public.get_conversation_timeline_v2(uuid,integer,bigint) is
  'Ordered V2 timeline with additive V1 history projection; no legacy message rows are rewritten.';
