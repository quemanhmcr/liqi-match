-- Production Match Authority v1
--
-- Mission 2 owns intent, relationship decisions, match uniqueness and the
-- transactional bootstrap request. Identity/lifecycle data remains provider-
-- owned and is consumed through the two public lifecycle provider functions
-- invoked dynamically below. This migration intentionally does not infer
-- lifecycle from profile completeness or discoverability columns.

create type public.match_intent_state_v1 as enum (
  'inactive',
  'active',
  'paused',
  'fulfilled',
  'expired'
);

create type public.relationship_decision_v1 as enum ('like', 'pass');
create type public.match_source_v1 as enum (
  'mutual_like',
  'set_join',
  'invite_accept'
);
create type public.home_match_kind_v1 as enum (
  'normal',
  'rank',
  'team_rank',
  'set_love',
  'soulmate'
);
create type public.home_match_status_v1 as enum (
  'conversation_pending',
  'conversation_ready',
  'closed'
);

create type private.player_lifecycle_snapshot_v1 as (
  account_id uuid,
  player_id uuid,
  profile_id uuid,
  state text,
  discoverable boolean,
  profile_version integer,
  lifecycle_version integer,
  updated_at timestamptz
);

create table public.match_intents_v1 (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique,
  state public.match_intent_state_v1 not null default 'inactive',
  filters jsonb not null,
  version integer not null default 1 check (version > 0),
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state = 'active' and activated_at is not null and expires_at is not null)
    or state <> 'active'
  )
);

create table public.relationship_decisions_v1 (
  id uuid primary key default gen_random_uuid(),
  actor_player_id uuid not null,
  target_player_id uuid not null,
  match_intent_id uuid not null references public.match_intents_v1(id) on delete restrict,
  decision public.relationship_decision_v1 not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_player_id, target_player_id),
  check (actor_player_id <> target_player_id)
);

create table private.command_idempotency_v1 (
  actor_account_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_account_id, operation, idempotency_key),
  check (char_length(idempotency_key) between 16 and 200)
);

create table private.match_authority_config_v1 (
  singleton boolean primary key default true check (singleton),
  intent_writes_enabled boolean not null default false,
  decision_writes_enabled boolean not null default false,
  reads_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.match_authority_config_v1 (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.matches
  add column player_low_id uuid,
  add column player_high_id uuid,
  add column source_v1 public.match_source_v1,
  add column correlation_id_v1 uuid,
  add column home_kind_v1 public.home_match_kind_v1,
  add column home_status_v1 public.home_match_status_v1;

alter table public.matches
  add constraint matches_player_pair_v1_check
    check (
      (player_low_id is null and player_high_id is null)
      or (
        player_low_id is not null
        and player_high_id is not null
        and player_low_id < player_high_id
      )
    ),
  add constraint matches_player_pair_v1_key unique (player_low_id, player_high_id);

alter table private.outbox_events
  add column correlation_id uuid,
  add column causation_id uuid,
  add column deduplication_key text,
  add column contract_version integer not null default 0;

alter table private.outbox_events
  add constraint outbox_events_deduplication_key_key unique (deduplication_key);

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
      'notification.requested.v1'
    )
  );

create index match_intents_v1_state_expiry_idx
  on public.match_intents_v1 (state, expires_at);
create index relationship_decisions_v1_target_actor_idx
  on public.relationship_decisions_v1 (target_player_id, actor_player_id);
create index matches_player_low_created_v1_idx
  on public.matches (player_low_id, created_at desc)
  where unmatched_at is null and player_low_id is not null;
create index matches_player_high_created_v1_idx
  on public.matches (player_high_id, created_at desc)
  where unmatched_at is null and player_high_id is not null;
create index outbox_events_contract_pending_v1_idx
  on private.outbox_events (event_type, status, available_at)
  where contract_version = 1;

create trigger match_intents_v1_set_updated_at
before update on public.match_intents_v1
for each row execute function public.set_updated_at();

create trigger relationship_decisions_v1_set_updated_at
before update on public.relationship_decisions_v1
for each row execute function public.set_updated_at();

create or replace function private.match_intent_writes_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select config.intent_writes_enabled
  from private.match_authority_config_v1 as config
  where config.singleton
$$;

create or replace function private.match_decision_writes_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select config.decision_writes_enabled
  from private.match_authority_config_v1 as config
  where config.singleton
$$;

create or replace function private.require_player_snapshot_by_account_v1(
  p_account_id uuid,
  p_lock boolean default false
)
returns private.player_lifecycle_snapshot_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_snapshot jsonb;
  snapshot private.player_lifecycle_snapshot_v1;
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
      (raw_snapshot ->> 'discoverable')::boolean,
      (raw_snapshot ->> 'profileVersion')::integer,
      (raw_snapshot ->> 'version')::integer,
      (raw_snapshot ->> 'updatedAt')::timestamptz
    )::private.player_lifecycle_snapshot_v1;
  exception
    when others then
      raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
        using errcode = '22023', detail = 'lifecycle_contract_violation';
  end;

  if snapshot.account_id is distinct from p_account_id then
    raise exception 'Lifecycle provider returned a mismatched account'
      using errcode = '22023', detail = 'lifecycle_contract_violation';
  end if;

  return snapshot;
end;
$$;

create or replace function private.require_player_snapshot_by_player_v1(
  p_player_id uuid,
  p_lock boolean default false
)
returns private.player_lifecycle_snapshot_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_snapshot jsonb;
  snapshot private.player_lifecycle_snapshot_v1;
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
      (raw_snapshot ->> 'discoverable')::boolean,
      (raw_snapshot ->> 'profileVersion')::integer,
      (raw_snapshot ->> 'version')::integer,
      (raw_snapshot ->> 'updatedAt')::timestamptz
    )::private.player_lifecycle_snapshot_v1;
  exception
    when others then
      raise exception 'Invalid PlayerLifecycleSnapshotV1 payload'
        using errcode = '22023', detail = 'lifecycle_contract_violation';
  end;

  if snapshot.player_id is distinct from p_player_id then
    raise exception 'Lifecycle provider returned a mismatched player'
      using errcode = '22023', detail = 'lifecycle_contract_violation';
  end if;

  return snapshot;
end;
$$;

create or replace function private.assert_discovery_eligible_v1(
  p_snapshot private.player_lifecycle_snapshot_v1
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_snapshot.state is distinct from 'active' then
    raise exception 'Player lifecycle must be active'
      using errcode = '42501', detail = 'lifecycle_not_active';
  end if;

  if not coalesce(p_snapshot.discoverable, false) then
    raise exception 'Player is not discoverable'
      using errcode = '42501', detail = 'not_discoverable';
  end if;
end;
$$;

create or replace function private.request_fingerprint_v1(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'utf8'), 'sha256'),
    'hex'
  )
$$;

create or replace function private.enqueue_contract_event_v1(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_data jsonb,
  p_deduplication_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := extensions.gen_random_uuid();
  occurred_at timestamptz := now();
  persisted_event_id uuid;
begin
  insert into private.outbox_events (
    id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    correlation_id,
    causation_id,
    deduplication_key,
    contract_version
  )
  values (
    event_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    jsonb_build_object(
      'eventId', event_id,
      'eventType', p_event_type,
      'aggregateType', p_aggregate_type,
      'aggregateId', p_aggregate_id,
      'occurredAt', occurred_at,
      'correlationId', p_correlation_id,
      'causationId', p_causation_id,
      'data', coalesce(p_data, '{}'::jsonb)
    ),
    p_correlation_id,
    p_causation_id,
    p_deduplication_key,
    1
  )
  on conflict (deduplication_key) do update
    set deduplication_key = excluded.deduplication_key
  returning id into persisted_event_id;

  return persisted_event_id;
end;
$$;

create or replace function public.activate_match_intent_v1(
  p_filters jsonb,
  p_idempotency_key text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.player_lifecycle_snapshot_v1;
  canonical_filters jsonb;
  request_payload jsonb;
  fingerprint text;
  stored_fingerprint text;
  stored_response jsonb;
  existing_intent public.match_intents_v1%rowtype;
  intent public.match_intents_v1%rowtype;
  correlation_id uuid;
  expires_at timestamptz;
  role_slugs jsonb;
  snapshot_response jsonb;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 200 then
    raise exception 'Invalid idempotency key'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  role_slugs := coalesce(p_filters -> 'roleSlugs', '[]'::jsonb);
  if jsonb_typeof(role_slugs) <> 'array' or jsonb_array_length(role_slugs) > 2 then
    raise exception 'roleSlugs must contain at most two values'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  canonical_filters := jsonb_build_object(
    'mode', p_filters ->> 'mode',
    'partyFormat', p_filters ->> 'partyFormat',
    'sessionPlan', p_filters ->> 'sessionPlan',
    'roleSlugs', role_slugs,
    'timezone', p_filters ->> 'timezone'
  );

  if canonical_filters ->> 'mode' is null
    or canonical_filters ->> 'mode' not in ('normal', 'ranked')
    or canonical_filters ->> 'partyFormat' is null
    or canonical_filters ->> 'partyFormat' not in ('duo', 'full_team', 'flex')
    or canonical_filters ->> 'sessionPlan' is null
    or canonical_filters ->> 'sessionPlan' not in ('quick', 'long')
    or nullif(canonical_filters ->> 'timezone', '') is null
    or char_length(canonical_filters ->> 'timezone') > 64
    or exists (
      select 1
      from jsonb_array_elements_text(role_slugs) as role_slug(value)
      where role_slug.value !~ '^[a-z0-9_]+$'
    )
  then
    raise exception 'Invalid match intent filters'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  request_payload := jsonb_build_object(
    'filters', canonical_filters,
    'expectedVersion', p_expected_version
  );
  fingerprint := private.request_fingerprint_v1(request_payload);

  insert into private.command_idempotency_v1 (
    actor_account_id,
    operation,
    idempotency_key,
    request_fingerprint
  ) values (
    actor_account_id,
    'activate_match_intent_v1',
    p_idempotency_key,
    fingerprint
  )
  on conflict do nothing;

  select idem.request_fingerprint, idem.response
    into stored_fingerprint, stored_response
  from private.command_idempotency_v1 as idem
  where idem.actor_account_id = actor_account_id
    and idem.operation = 'activate_match_intent_v1'
    and idem.idempotency_key = p_idempotency_key
  for update;

  if stored_fingerprint is distinct from fingerprint then
    raise exception 'Idempotency key was reused with a different request'
      using errcode = '23505', detail = 'idempotency_conflict';
  end if;

  -- A committed command receipt is immutable. Replays return it before current
  -- lifecycle or rollout policy checks, so network retry remains reliable even
  -- after suspension, deletion workflow entry, or a kill-switch change.
  if stored_response is not null then
    return jsonb_set(stored_response, '{repeated}', 'true'::jsonb, true);
  end if;

  if not private.match_intent_writes_enabled_v1() then
    raise exception 'Match authority writes are disabled'
      using errcode = '55000', detail = 'match_authority_disabled';
  end if;

  actor_snapshot := private.require_player_snapshot_by_account_v1(actor_account_id, true);
  perform private.assert_discovery_eligible_v1(actor_snapshot);

  select * into existing_intent
  from public.match_intents_v1
  where player_id = actor_snapshot.player_id
  for update;

  if p_expected_version is not null
    and existing_intent.id is not null
    and existing_intent.version <> p_expected_version
  then
    raise exception 'Match intent version conflict'
      using errcode = '40001', detail = 'intent_version_conflict';
  end if;

  expires_at := now() + case canonical_filters ->> 'sessionPlan'
    when 'quick' then interval '2 hours'
    else interval '4 hours'
  end;
  correlation_id := extensions.gen_random_uuid();

  insert into public.match_intents_v1 (
    player_id,
    state,
    filters,
    version,
    activated_at,
    expires_at
  ) values (
    actor_snapshot.player_id,
    'active',
    canonical_filters,
    1,
    now(),
    expires_at
  )
  on conflict (player_id) do update
    set state = 'active',
        filters = excluded.filters,
        version = public.match_intents_v1.version + 1,
        activated_at = excluded.activated_at,
        expires_at = excluded.expires_at
  returning * into intent;

  snapshot_response := jsonb_build_object(
    'matchIntentId', intent.id,
    'playerId', intent.player_id,
    'state', intent.state,
    'filters', intent.filters,
    'version', intent.version,
    'activatedAt', intent.activated_at,
    'expiresAt', intent.expires_at,
    'repeated', false
  );

  perform private.enqueue_contract_event_v1(
    'match_intent.activated.v1',
    'match_intent',
    intent.id,
    correlation_id,
    null,
    snapshot_response - 'repeated',
    format('match_intent.activated.v1:%s:%s', intent.id, intent.version)
  );

  update private.command_idempotency_v1 as idem
  set response = snapshot_response,
      completed_at = now()
  where idem.actor_account_id = actor_account_id
    and idem.operation = 'activate_match_intent_v1'
    and idem.idempotency_key = p_idempotency_key;

  return snapshot_response;
end;
$$;

create or replace function public.record_player_decision_v1(
  p_target_player_id uuid,
  p_decision public.relationship_decision_v1,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_intent_version integer,
  p_expected_target_profile_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.player_lifecycle_snapshot_v1;
  target_snapshot private.player_lifecycle_snapshot_v1;
  actor_intent public.match_intents_v1%rowtype;
  target_intent public.match_intents_v1%rowtype;
  relationship public.relationship_decisions_v1%rowtype;
  low_player_id uuid;
  high_player_id uuid;
  low_profile_id uuid;
  high_profile_id uuid;
  request_payload jsonb;
  fingerprint text;
  stored_fingerprint text;
  stored_response jsonb;
  existing_match public.matches%rowtype;
  created_match public.matches%rowtype;
  match_data jsonb;
  receipt jsonb;
  home_kind public.home_match_kind_v1;
  liked_event_id uuid;
  match_created_event_id uuid;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  if p_target_player_id is null
    or p_decision is null
    or p_correlation_id is null
    or p_expected_intent_version is null
    or p_expected_target_profile_version is null
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 200
  then
    raise exception 'Invalid player decision command'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  request_payload := jsonb_build_object(
    'targetPlayerId', p_target_player_id,
    'decision', p_decision,
    'correlationId', p_correlation_id,
    'expectedIntentVersion', p_expected_intent_version,
    'expectedTargetProfileVersion', p_expected_target_profile_version
  );
  fingerprint := private.request_fingerprint_v1(request_payload);

  insert into private.command_idempotency_v1 (
    actor_account_id,
    operation,
    idempotency_key,
    request_fingerprint
  ) values (
    actor_account_id,
    'record_player_decision_v1',
    p_idempotency_key,
    fingerprint
  )
  on conflict do nothing;

  select idem.request_fingerprint, idem.response
    into stored_fingerprint, stored_response
  from private.command_idempotency_v1 as idem
  where idem.actor_account_id = actor_account_id
    and idem.operation = 'record_player_decision_v1'
    and idem.idempotency_key = p_idempotency_key
  for update;

  if stored_fingerprint is distinct from fingerprint then
    raise exception 'Idempotency key was reused with a different request'
      using errcode = '23505', detail = 'idempotency_conflict';
  end if;

  if stored_response is not null then
    return jsonb_set(stored_response, '{repeated}', 'true'::jsonb, true);
  end if;

  if not private.match_decision_writes_enabled_v1() then
    raise exception 'Match authority writes are disabled'
      using errcode = '55000', detail = 'match_authority_disabled';
  end if;

  -- The first provider read is intentionally lock-free. It gives us the
  -- semantic PlayerId needed to acquire the canonical pair lock without holding
  -- a lifecycle row that the opposite-direction command may need.
  actor_snapshot := private.require_player_snapshot_by_account_v1(actor_account_id, false);

  if actor_snapshot.player_id = p_target_player_id then
    raise exception 'Cannot decide on yourself'
      using errcode = '22023', detail = 'validation_failed';
  end if;

  low_player_id := least(actor_snapshot.player_id, p_target_player_id);
  high_player_id := greatest(actor_snapshot.player_id, p_target_player_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(low_player_id::text || ':' || high_player_id::text, 0)
  );

  -- Once the unordered pair is serialized, lifecycle snapshots are re-read
  -- with provider-owned row locks in deterministic player order. The provider
  -- must implement p_lock=true with SELECT ... FOR UPDATE semantics.
  if actor_snapshot.player_id = low_player_id then
    actor_snapshot := private.require_player_snapshot_by_account_v1(actor_account_id, true);
    target_snapshot := private.require_player_snapshot_by_player_v1(p_target_player_id, true);
  else
    target_snapshot := private.require_player_snapshot_by_player_v1(p_target_player_id, true);
    actor_snapshot := private.require_player_snapshot_by_account_v1(actor_account_id, true);
  end if;

  perform private.assert_discovery_eligible_v1(actor_snapshot);
  perform private.assert_discovery_eligible_v1(target_snapshot);

  if target_snapshot.profile_version <> p_expected_target_profile_version then
    raise exception 'Target profile version conflict'
      using errcode = '40001', detail = 'profile_version_conflict';
  end if;

  select * into existing_match
  from public.matches
  where player_low_id = low_player_id
    and player_high_id = high_player_id
    and unmatched_at is null;

  if existing_match.id is not null then
    match_data := jsonb_build_object(
      'matchId', existing_match.id,
      'participantIds', jsonb_build_array(low_player_id, high_player_id),
      'source', existing_match.source_v1,
      'createdAt', existing_match.created_at,
      'correlationId', existing_match.correlation_id_v1
    );
    receipt := jsonb_build_object(
      'relationshipState', 'matched',
      'match', match_data,
      'repeated', true
    );

    update private.command_idempotency_v1 as idem
    set response = receipt,
        completed_at = now()
    where idem.actor_account_id = actor_account_id
      and idem.operation = 'record_player_decision_v1'
      and idem.idempotency_key = p_idempotency_key;

    return receipt;
  end if;

  select * into actor_intent
  from public.match_intents_v1
  where player_id = actor_snapshot.player_id
  for update;

  if actor_intent.id is null
    or actor_intent.state <> 'active'
    or actor_intent.expires_at <= now()
  then
    raise exception 'An active match intent is required'
      using errcode = '42501', detail = 'intent_not_active';
  end if;

  if actor_intent.version <> p_expected_intent_version then
    raise exception 'Match intent version conflict'
      using errcode = '40001', detail = 'intent_version_conflict';
  end if;

  select * into target_intent
  from public.match_intents_v1
  where player_id = target_snapshot.player_id
  for update;

  if target_intent.id is null
    or target_intent.state <> 'active'
    or target_intent.expires_at <= now()
  then
    raise exception 'Target match intent is unavailable'
      using errcode = '42501', detail = 'target_unavailable';
  end if;

  insert into public.relationship_decisions_v1 (
    actor_player_id,
    target_player_id,
    match_intent_id,
    decision
  ) values (
    actor_snapshot.player_id,
    target_snapshot.player_id,
    actor_intent.id,
    p_decision
  )
  on conflict (actor_player_id, target_player_id) do update
    set match_intent_id = excluded.match_intent_id,
        decision = excluded.decision,
        version = public.relationship_decisions_v1.version + 1,
        updated_at = now()
  returning * into relationship;

  if p_decision = 'like' then
    liked_event_id := private.enqueue_contract_event_v1(
      'player.liked.v1',
      'relationship',
      relationship.id,
      p_correlation_id,
      null,
      jsonb_build_object(
        'actorPlayerId', actor_snapshot.player_id,
        'targetPlayerId', target_snapshot.player_id
      ),
      format('player.liked.v1:%s:%s', relationship.id, relationship.version)
    );
  end if;

  if p_decision = 'like' and exists (
    select 1
    from public.relationship_decisions_v1 as reciprocal
    where reciprocal.actor_player_id = target_snapshot.player_id
      and reciprocal.target_player_id = actor_snapshot.player_id
      and reciprocal.decision = 'like'
  ) then
    low_profile_id := case
      when actor_snapshot.player_id = low_player_id then actor_snapshot.profile_id
      else target_snapshot.profile_id
    end;
    high_profile_id := case
      when actor_snapshot.player_id = high_player_id then actor_snapshot.profile_id
      else target_snapshot.profile_id
    end;
    home_kind := case
      when actor_intent.filters ->> 'mode' = 'ranked'
        and target_intent.filters ->> 'mode' = 'ranked'
      then 'rank'::public.home_match_kind_v1
      else 'normal'::public.home_match_kind_v1
    end;

    insert into public.matches (
      profile_low_id,
      profile_high_id,
      player_low_id,
      player_high_id,
      source_v1,
      correlation_id_v1,
      home_kind_v1,
      home_status_v1
    ) values (
      least(low_profile_id, high_profile_id),
      greatest(low_profile_id, high_profile_id),
      low_player_id,
      high_player_id,
      'mutual_like',
      p_correlation_id,
      home_kind,
      'conversation_pending'
    )
    returning * into created_match;

    update public.match_intents_v1
    set state = 'fulfilled',
        version = version + 1
    where id in (actor_intent.id, target_intent.id);

    match_data := jsonb_build_object(
      'matchId', created_match.id,
      'participantIds', jsonb_build_array(low_player_id, high_player_id),
      'source', created_match.source_v1,
      'createdAt', created_match.created_at,
      'correlationId', created_match.correlation_id_v1
    );

    match_created_event_id := private.enqueue_contract_event_v1(
      'match.created.v1',
      'match',
      created_match.id,
      p_correlation_id,
      liked_event_id,
      match_data,
      format('match.created.v1:%s', created_match.id)
    );

    perform private.enqueue_contract_event_v1(
      'conversation.bootstrap_requested.v1',
      'match',
      created_match.id,
      p_correlation_id,
      match_created_event_id,
      jsonb_build_object(
        'matchId', created_match.id,
        'participantIds', jsonb_build_array(low_player_id, high_player_id),
        'requestedAt', now()
      ),
      format('conversation.bootstrap_requested.v1:%s', created_match.id)
    );

    perform private.enqueue_contract_event_v1(
      'notification.requested.v1',
      'player',
      low_player_id,
      p_correlation_id,
      match_created_event_id,
      jsonb_build_object(
        'recipientPlayerId', low_player_id,
        'reasonCode', 'match_created',
        'target', jsonb_build_object('kind', 'match', 'matchId', created_match.id)
      ),
      format('notification.requested.v1:match_created:%s:%s', created_match.id, low_player_id)
    );

    perform private.enqueue_contract_event_v1(
      'notification.requested.v1',
      'player',
      high_player_id,
      p_correlation_id,
      match_created_event_id,
      jsonb_build_object(
        'recipientPlayerId', high_player_id,
        'reasonCode', 'match_created',
        'target', jsonb_build_object('kind', 'match', 'matchId', created_match.id)
      ),
      format('notification.requested.v1:match_created:%s:%s', created_match.id, high_player_id)
    );

    receipt := jsonb_build_object(
      'relationshipState', 'matched',
      'match', match_data,
      'repeated', false
    );
  else
    receipt := jsonb_build_object(
      'relationshipState', case p_decision when 'like' then 'liked' else 'passed' end,
      'match', null,
      'repeated', false
    );
  end if;

  update private.command_idempotency_v1 as idem
  set response = receipt,
      completed_at = now()
  where idem.actor_account_id = actor_account_id
    and idem.operation = 'record_player_decision_v1'
    and idem.idempotency_key = p_idempotency_key;

  return receipt;
end;
$$;



-- Legacy transport may coexist during expansion, but legacy semantics may not
-- coexist with the authoritative engine. Before cutover this RPC remains
-- available. Once decision writes are enabled or the first v1 match exists, it
-- is permanently prevented from creating another match/conversation path.
create or replace function public.record_swipe(
  target_profile_id uuid,
  direction public.swipe_direction
)
returns table(match_id uuid, conversation_id uuid, matched boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := auth.uid();
  low_id uuid;
  high_id uuid;
  created_match_id uuid;
  created_conversation_id uuid;
begin
  if private.match_decision_writes_enabled_v1()
    or exists (
      select 1
      from public.matches
      where player_low_id is not null
      limit 1
    )
  then
    raise exception 'Legacy matching writes are disabled after v1 cutover'
      using errcode = '55000', detail = 'legacy_matching_disabled';
  end if;

  if actor_profile_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if actor_profile_id = target_profile_id then
    raise exception 'Cannot swipe yourself' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = actor_profile_id
      and deleted_at is null
  ) then
    raise exception 'Actor profile not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = target_profile_id
      and deleted_at is null
      and is_discoverable
  ) then
    raise exception 'Target profile not available' using errcode = 'P0002';
  end if;

  if private.are_profiles_blocked(actor_profile_id, target_profile_id) then
    raise exception 'Profiles are blocked' using errcode = '42501';
  end if;

  insert into public.swipes (actor_id, target_id, direction)
  values (actor_profile_id, target_profile_id, $2)
  on conflict (actor_id, target_id) do update
    set direction = excluded.direction,
        created_at = now();

  if $2 = 'like' and exists (
    select 1
    from public.swipes
    where actor_id = target_profile_id
      and target_id = actor_profile_id
      and public.swipes.direction = 'like'
  ) then
    low_id := least(actor_profile_id, target_profile_id);
    high_id := greatest(actor_profile_id, target_profile_id);

    insert into public.matches (profile_low_id, profile_high_id)
    values (low_id, high_id)
    on conflict (profile_low_id, profile_high_id) do update
      set unmatched_at = null
    returning id into created_match_id;

    insert into public.conversations (match_id)
    values (created_match_id)
    on conflict on constraint conversations_match_id_key do update
      set created_at = public.conversations.created_at
    returning id into created_conversation_id;

    insert into public.conversation_members (conversation_id, profile_id)
    values
      (created_conversation_id, low_id),
      (created_conversation_id, high_id)
    on conflict do nothing;

    return query select created_match_id, created_conversation_id, true;
    return;
  end if;

  return query select null::uuid, null::uuid, false;
end;
$$;

comment on function public.activate_match_intent_v1(jsonb, text, integer) is
  'Authoritative MatchIntent activation. Requires PlayerLifecycleSnapshotV1 provider and command idempotency.';
comment on function public.record_player_decision_v1(uuid, public.relationship_decision_v1, text, uuid, integer, integer) is
  'Authoritative like/pass command. Rechecks locked lifecycle snapshots, creates one canonical match, and emits transactional v1 events.';

alter table public.match_intents_v1 enable row level security;
alter table public.relationship_decisions_v1 enable row level security;

revoke all on table public.match_intents_v1 from public, anon, authenticated;
revoke all on table public.relationship_decisions_v1 from public, anon, authenticated;
revoke execute on function public.activate_match_intent_v1(jsonb, text, integer) from public, anon;
revoke execute on function public.record_player_decision_v1(uuid, public.relationship_decision_v1, text, uuid, integer, integer) from public, anon;
grant execute on function public.activate_match_intent_v1(jsonb, text, integer) to authenticated;
grant execute on function public.record_player_decision_v1(uuid, public.relationship_decision_v1, text, uuid, integer, integer) to authenticated;
