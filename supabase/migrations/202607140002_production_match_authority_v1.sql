-- Production Match Authority v1
--
-- Mission 2 owns Match Intent, relationship decisions, canonical match
-- uniqueness, authoritative Home match facts, and transactional downstream
-- requests. Identity, lifecycle and canonical profile versions are consumed
-- from the Mission 1 authority introduced by 202607140001.

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

create table public.match_intents_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null unique references public.players(id) on delete restrict,
  state public.match_intent_state_v1 not null default 'inactive',
  filters jsonb not null,
  version bigint not null default 1 check (version > 0),
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_intents_v1_active_timestamps check (
    (state = 'active' and activated_at is not null and expires_at is not null)
    or state <> 'active'
  )
);

create table public.relationship_decisions_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_player_id uuid not null references public.players(id) on delete restrict,
  target_player_id uuid not null references public.players(id) on delete restrict,
  match_intent_id uuid not null references public.match_intents_v1(id) on delete restrict,
  decision public.relationship_decision_v1 not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_player_id, target_player_id),
  check (actor_player_id <> target_player_id)
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
  add column player_low_id uuid references public.players(id) on delete restrict,
  add column player_high_id uuid references public.players(id) on delete restrict,
  add column source_v1 public.match_source_v1,
  add column correlation_id_v1 uuid,
  add column home_kind_v1 public.home_match_kind_v1,
  add column home_status_v1 public.home_match_status_v1;

alter table public.matches
  add constraint matches_player_pair_v1_check check (
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
  add constraint outbox_events_deduplication_key_v1_key unique (deduplication_key);

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
  from private.match_authority_config_v1 config
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
  from private.match_authority_config_v1 config
  where config.singleton
$$;

create or replace function private.canonical_match_intent_filters_v1(p_filters jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  role_slugs jsonb;
  intent_kind text;
  canonical_filters jsonb;
begin
  if jsonb_typeof(p_filters) is distinct from 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Match Intent filters must be an object.'
    );
  end if;

  role_slugs := coalesce(p_filters -> 'roleSlugs', '[]'::jsonb);
  if jsonb_typeof(role_slugs) <> 'array'
    or jsonb_array_length(role_slugs) > 2
    or exists (
      select 1
      from jsonb_array_elements_text(role_slugs) role_slug(value)
      where role_slug.value !~ '^[a-z0-9_]+$'
    )
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'roleSlugs must contain at most two canonical slugs.'
    );
  end if;

  intent_kind := coalesce(
    nullif(p_filters ->> 'intentKind', ''),
    case p_filters ->> 'mode' when 'ranked' then 'rank' else 'normal' end
  );

  canonical_filters := jsonb_build_object(
    'intentKind', intent_kind,
    'mode', p_filters ->> 'mode',
    'partyFormat', p_filters ->> 'partyFormat',
    'sessionPlan', p_filters ->> 'sessionPlan',
    'roleSlugs', role_slugs,
    'timezone', p_filters ->> 'timezone'
  );

  if canonical_filters ->> 'intentKind' not in (
      'normal', 'rank', 'team_rank', 'set_love', 'soulmate'
    )
    or canonical_filters ->> 'mode' not in ('normal', 'ranked')
    or canonical_filters ->> 'partyFormat' not in ('duo', 'full_team', 'flex')
    or canonical_filters ->> 'sessionPlan' not in ('quick', 'long')
    or nullif(canonical_filters ->> 'timezone', '') is null
    or char_length(canonical_filters ->> 'timezone') > 64
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Match Intent filters are invalid.'
    );
  end if;

  return canonical_filters;
end;
$$;

create or replace function private.match_intent_snapshot_v1(p_intent_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'matchIntentId', intents.id,
    'playerId', intents.player_id,
    'state', intents.state,
    'filters', intents.filters,
    'version', intents.version,
    'activatedAt', intents.activated_at,
    'expiresAt', intents.expires_at
  )
  from public.match_intents_v1 intents
  where intents.id = p_intent_id
$$;

create or replace function private.expire_match_intent_v1(p_player_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.match_intents_v1
  set state = 'expired',
      version = version + 1
  where player_id = p_player_id
    and state = 'active'
    and expires_at <= now()
$$;

create or replace function private.assert_discovery_eligible_v1(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_row public.players%rowtype;
begin
  if private.is_player_discovery_eligible_v1(p_player_id) then
    return;
  end if;

  select * into player_row
  from public.players
  where id = p_player_id;

  if not found or player_row.auth_user_id is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The player identity is unavailable.'
    );
  elsif player_row.lifecycle_state = 'suspended' then
    perform private.raise_core_error_v1(
      'player_suspended',
      'The player is suspended.'
    );
  elsif player_row.lifecycle_state = 'deleting' then
    perform private.raise_core_error_v1(
      'player_deleting',
      'The player is being deleted.'
    );
  elsif player_row.lifecycle_state = 'deleted' then
    perform private.raise_core_error_v1(
      'player_deleted',
      'The player has been deleted.'
    );
  elsif player_row.lifecycle_state <> 'active' then
    perform private.raise_core_error_v1(
      'lifecycle_not_active',
      'The player lifecycle must be active.'
    );
  else
    perform private.raise_core_error_v1(
      'not_discoverable',
      'The player is not discoverable.'
    );
  end if;
end;
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
  event_id_value uuid := extensions.gen_random_uuid();
  occurred_at_value timestamptz := now();
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
  ) values (
    event_id_value,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    jsonb_build_object(
      'eventId', event_id_value,
      'eventType', p_event_type,
      'aggregateType', p_aggregate_type,
      'aggregateId', p_aggregate_id,
      'occurredAt', occurred_at_value,
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

create or replace function public.get_current_match_intent_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_player_id uuid;
  intent_id_value uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  select players.id into actor_player_id
  from public.players players
  where players.account_id = actor_account_id
    and players.auth_user_id = actor_account_id;

  if actor_player_id is null then
    return null;
  end if;

  perform private.expire_match_intent_v1(actor_player_id);

  select intents.id into intent_id_value
  from public.match_intents_v1 intents
  where intents.player_id = actor_player_id;

  return case
    when intent_id_value is null then null
    else private.match_intent_snapshot_v1(intent_id_value)
  end;
end;
$$;

create or replace function public.activate_match_intent_v1(
  p_filters jsonb,
  p_idempotency_key text,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_player_id uuid;
  canonical_filters jsonb;
  request_payload jsonb;
  request_hash text;
  command_state record;
  existing_intent public.match_intents_v1%rowtype;
  intent public.match_intents_v1%rowtype;
  correlation_id_value uuid := extensions.gen_random_uuid();
  expires_at_value timestamptz;
  response_payload jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  canonical_filters := private.canonical_match_intent_filters_v1(p_filters);
  request_payload := jsonb_build_object(
    'filters', canonical_filters,
    'expectedVersion', p_expected_version
  );
  request_hash := private.command_request_hash_v1(request_payload);

  select * into command_state
  from private.begin_command_v1(
    'activate_match_intent_v1',
    actor_account_id,
    p_idempotency_key,
    request_hash
  );

  if command_state.repeated then
    return command_state.response;
  end if;

  if not private.match_intent_writes_enabled_v1() then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Match Intent writes are disabled by rollout policy.',
      true
    );
  end if;

  select players.id into actor_player_id
  from public.players players
  where players.account_id = actor_account_id
    and players.auth_user_id = actor_account_id
  for update;

  if actor_player_id is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player identity was not found.'
    );
  end if;

  perform private.assert_discovery_eligible_v1(actor_player_id);
  perform private.expire_match_intent_v1(actor_player_id);

  select * into existing_intent
  from public.match_intents_v1 intents
  where intents.player_id = actor_player_id
  for update;

  if p_expected_version is not null
    and existing_intent.id is not null
    and existing_intent.version <> p_expected_version
  then
    perform private.raise_core_error_v1(
      'intent_version_conflict',
      'The Match Intent version changed.'
    );
  end if;

  expires_at_value := now() + case canonical_filters ->> 'sessionPlan'
    when 'quick' then interval '2 hours'
    else interval '4 hours'
  end;

  insert into public.match_intents_v1 (
    player_id,
    state,
    filters,
    version,
    activated_at,
    expires_at
  ) values (
    actor_player_id,
    'active',
    canonical_filters,
    1,
    now(),
    expires_at_value
  )
  on conflict (player_id) do update
    set state = 'active',
        filters = excluded.filters,
        version = public.match_intents_v1.version + 1,
        activated_at = excluded.activated_at,
        expires_at = excluded.expires_at
  returning * into intent;

  response_payload := private.match_intent_snapshot_v1(intent.id)
    || jsonb_build_object('repeated', false);

  perform private.enqueue_contract_event_v1(
    'match_intent.activated.v1',
    'match_intent',
    intent.id,
    correlation_id_value,
    null,
    response_payload - 'repeated',
    format('match_intent.activated.v1:%s:%s', intent.id, intent.version)
  );

  perform private.finish_command_v1(
    'activate_match_intent_v1',
    actor_account_id,
    p_idempotency_key,
    response_payload
  );

  return response_payload;
end;
$$;

create or replace function public.pause_match_intent_v1(
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_player_id uuid;
  request_payload jsonb;
  request_hash text;
  command_state record;
  intent public.match_intents_v1%rowtype;
  response_payload jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  request_payload := jsonb_build_object('expectedVersion', p_expected_version);
  request_hash := private.command_request_hash_v1(request_payload);

  select * into command_state
  from private.begin_command_v1(
    'pause_match_intent_v1',
    actor_account_id,
    p_idempotency_key,
    request_hash
  );

  if command_state.repeated then
    return command_state.response;
  end if;

  if not private.match_intent_writes_enabled_v1() then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Match Intent writes are disabled by rollout policy.',
      true
    );
  end if;

  select players.id into actor_player_id
  from public.players players
  where players.account_id = actor_account_id
    and players.auth_user_id = actor_account_id
  for update;

  if actor_player_id is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player identity was not found.'
    );
  end if;

  perform private.expire_match_intent_v1(actor_player_id);

  select * into intent
  from public.match_intents_v1 intents
  where intents.player_id = actor_player_id
  for update;

  if intent.id is null or intent.state <> 'active' then
    perform private.raise_core_error_v1(
      'intent_not_active',
      'An active Match Intent is required.'
    );
  end if;

  if intent.version <> p_expected_version then
    perform private.raise_core_error_v1(
      'intent_version_conflict',
      'The Match Intent version changed.'
    );
  end if;

  update public.match_intents_v1
  set state = 'paused',
      version = version + 1
  where id = intent.id
  returning * into intent;

  response_payload := private.match_intent_snapshot_v1(intent.id)
    || jsonb_build_object('repeated', false);

  perform private.finish_command_v1(
    'pause_match_intent_v1',
    actor_account_id,
    p_idempotency_key,
    response_payload
  );

  return response_payload;
end;
$$;

create or replace function public.record_player_decision_v1(
  p_target_player_id uuid,
  p_decision public.relationship_decision_v1,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_intent_version bigint,
  p_expected_target_profile_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_player_id uuid;
  low_player_id uuid;
  high_player_id uuid;
  actor_profile public.player_profiles_v1%rowtype;
  target_profile public.player_profiles_v1%rowtype;
  actor_intent public.match_intents_v1%rowtype;
  target_intent public.match_intents_v1%rowtype;
  relationship public.relationship_decisions_v1%rowtype;
  existing_relationship public.relationship_decisions_v1%rowtype;
  existing_match public.matches%rowtype;
  created_match public.matches%rowtype;
  request_payload jsonb;
  request_hash text;
  command_state record;
  match_data jsonb;
  response_payload jsonb;
  actor_kind text;
  target_kind text;
  home_kind_value public.home_match_kind_v1;
  liked_event_id uuid;
  match_created_event_id uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  if p_target_player_id is null
    or p_decision is null
    or p_correlation_id is null
    or p_expected_intent_version is null
    or p_expected_target_profile_version is null
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The player decision command is incomplete.'
    );
  end if;

  request_payload := jsonb_build_object(
    'targetPlayerId', p_target_player_id,
    'decision', p_decision,
    'correlationId', p_correlation_id,
    'expectedIntentVersion', p_expected_intent_version,
    'expectedTargetProfileVersion', p_expected_target_profile_version
  );
  request_hash := private.command_request_hash_v1(request_payload);

  select * into command_state
  from private.begin_command_v1(
    'record_player_decision_v1',
    actor_account_id,
    p_idempotency_key,
    request_hash
  );

  if command_state.repeated then
    return command_state.response;
  end if;

  if not private.match_decision_writes_enabled_v1() then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Match decision writes are disabled by rollout policy.',
      true
    );
  end if;

  -- Resolve only the semantic PlayerId before the pair lock. No lifecycle row
  -- is locked yet, avoiding opposite-direction deadlocks.
  select players.id into actor_player_id
  from public.players players
  where players.account_id = actor_account_id
    and players.auth_user_id = actor_account_id;

  if actor_player_id is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player identity was not found.'
    );
  end if;

  if actor_player_id = p_target_player_id then
    perform private.raise_core_error_v1(
      'validation_failed',
      'A player cannot decide on themself.'
    );
  end if;

  low_player_id := least(actor_player_id, p_target_player_id);
  high_player_id := greatest(actor_player_id, p_target_player_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(low_player_id::text || ':' || high_player_id::text, 0)
  );

  -- Mission 1 lifecycle transitions lock public.players. Locking both rows in
  -- canonical PlayerId order makes the command-time eligibility decision and
  -- the match commit atomic with respect to suspension/deletion transitions.
  perform players.id
  from public.players players
  where players.id in (low_player_id, high_player_id)
  order by players.id
  for update;

  perform profiles.player_id
  from public.player_profiles_v1 profiles
  where profiles.player_id in (low_player_id, high_player_id)
  order by profiles.player_id
  for update;

  perform private.assert_discovery_eligible_v1(actor_player_id);
  perform private.assert_discovery_eligible_v1(p_target_player_id);

  select * into actor_profile
  from public.player_profiles_v1 profiles
  where profiles.player_id = actor_player_id;
  select * into target_profile
  from public.player_profiles_v1 profiles
  where profiles.player_id = p_target_player_id;

  if actor_profile.id is null
    or target_profile.id is null
    or actor_profile.legacy_profile_id is null
    or target_profile.legacy_profile_id is null
  then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'Both players require a canonical profile mapped to the legacy read model.'
    );
  end if;

  if target_profile.version <> p_expected_target_profile_version then
    perform private.raise_core_error_v1(
      'profile_version_conflict',
      'The target profile version changed.'
    );
  end if;

  if private.are_profiles_blocked(
    actor_profile.legacy_profile_id,
    target_profile.legacy_profile_id
  ) then
    perform private.raise_core_error_v1(
      'relationship_blocked',
      'The relationship is blocked.'
    );
  end if;

  select * into existing_match
  from public.matches matches
  where matches.player_low_id = low_player_id
    and matches.player_high_id = high_player_id;

  if existing_match.id is not null then
    match_data := jsonb_build_object(
      'matchId', existing_match.id,
      'participantIds', jsonb_build_array(low_player_id, high_player_id),
      'source', existing_match.source_v1,
      'createdAt', existing_match.created_at,
      'correlationId', existing_match.correlation_id_v1
    );
    response_payload := jsonb_build_object(
      'relationshipState', 'matched',
      'match', match_data,
      'repeated', true
    );

    perform private.finish_command_v1(
      'record_player_decision_v1',
      actor_account_id,
      p_idempotency_key,
      response_payload
    );
    return response_payload;
  end if;

  perform private.expire_match_intent_v1(actor_player_id);
  perform private.expire_match_intent_v1(p_target_player_id);

  -- Lock both intent aggregates in canonical PlayerId order for commands that
  -- share one participant but target different pairs.
  perform intents.player_id
  from public.match_intents_v1 intents
  where intents.player_id in (low_player_id, high_player_id)
  order by intents.player_id
  for update;

  select * into actor_intent
  from public.match_intents_v1 intents
  where intents.player_id = actor_player_id;
  select * into target_intent
  from public.match_intents_v1 intents
  where intents.player_id = p_target_player_id;

  if actor_intent.id is null or actor_intent.state <> 'active' then
    perform private.raise_core_error_v1(
      'intent_not_active',
      'An active Match Intent is required.'
    );
  end if;

  if actor_intent.version <> p_expected_intent_version then
    perform private.raise_core_error_v1(
      'intent_version_conflict',
      'The Match Intent version changed.'
    );
  end if;

  if target_intent.id is null or target_intent.state <> 'active' then
    perform private.raise_core_error_v1(
      'intent_not_active',
      'The target Match Intent is not active.'
    );
  end if;

  select * into existing_relationship
  from public.relationship_decisions_v1 decisions
  where decisions.actor_player_id = actor_player_id
    and decisions.target_player_id = p_target_player_id
  for update;

  if existing_relationship.id is not null
    and existing_relationship.decision = p_decision
  then
    response_payload := jsonb_build_object(
      'relationshipState', case p_decision
        when 'like' then 'liked'
        else 'passed'
      end,
      'match', null,
      'repeated', true
    );
    perform private.finish_command_v1(
      'record_player_decision_v1',
      actor_account_id,
      p_idempotency_key,
      response_payload
    );
    return response_payload;
  end if;

  insert into public.relationship_decisions_v1 (
    actor_player_id,
    target_player_id,
    match_intent_id,
    decision
  ) values (
    actor_player_id,
    p_target_player_id,
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
        'actorPlayerId', actor_player_id,
        'targetPlayerId', p_target_player_id
      ),
      format('player.liked.v1:%s:%s', relationship.id, relationship.version)
    );
  end if;

  if p_decision = 'like' and exists (
    select 1
    from public.relationship_decisions_v1 reciprocal
    where reciprocal.actor_player_id = p_target_player_id
      and reciprocal.target_player_id = actor_player_id
      and reciprocal.decision = 'like'
  ) then
    actor_kind := coalesce(
      actor_intent.filters ->> 'intentKind',
      case actor_intent.filters ->> 'mode' when 'ranked' then 'rank' else 'normal' end
    );
    target_kind := coalesce(
      target_intent.filters ->> 'intentKind',
      case target_intent.filters ->> 'mode' when 'ranked' then 'rank' else 'normal' end
    );
    home_kind_value := case
      when actor_kind = target_kind then actor_kind::public.home_match_kind_v1
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
      least(actor_profile.legacy_profile_id, target_profile.legacy_profile_id),
      greatest(actor_profile.legacy_profile_id, target_profile.legacy_profile_id),
      low_player_id,
      high_player_id,
      'mutual_like',
      p_correlation_id,
      home_kind_value,
      'conversation_pending'
    )
    on conflict (profile_low_id, profile_high_id) do update
      set player_low_id = excluded.player_low_id,
          player_high_id = excluded.player_high_id,
          source_v1 = coalesce(public.matches.source_v1, excluded.source_v1),
          correlation_id_v1 = coalesce(
            public.matches.correlation_id_v1,
            excluded.correlation_id_v1
          ),
          home_kind_v1 = coalesce(
            public.matches.home_kind_v1,
            excluded.home_kind_v1
          ),
          home_status_v1 = coalesce(
            public.matches.home_status_v1,
            excluded.home_status_v1
          ),
          unmatched_at = null
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

    response_payload := jsonb_build_object(
      'relationshipState', 'matched',
      'match', match_data,
      'repeated', false
    );
  else
    response_payload := jsonb_build_object(
      'relationshipState', case p_decision
        when 'like' then 'liked'
        else 'passed'
      end,
      'match', null,
      'repeated', false
    );
  end if;

  perform private.finish_command_v1(
    'record_player_decision_v1',
    actor_account_id,
    p_idempotency_key,
    response_payload
  );

  return response_payload;
end;
$$;

-- Duplicate transport is allowed during expansion; duplicate semantics are not.
-- Once v1 decision writes are enabled or the first v1 match exists, legacy
-- record_swipe can never create another semantic match/conversation path.
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
    select 1 from public.profiles
    where id = actor_profile_id and deleted_at is null
  ) then
    raise exception 'Actor profile not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.profiles
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
    select 1 from public.swipes
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

comment on function public.activate_match_intent_v1(jsonb, text, bigint) is
  'Activates the authoritative Match Intent after command-time lifecycle enforcement.';
comment on function public.pause_match_intent_v1(text, bigint) is
  'Pauses the authoritative Match Intent with optimistic concurrency and durable command receipts.';
comment on function public.record_player_decision_v1(uuid, public.relationship_decision_v1, text, uuid, bigint, bigint) is
  'Records like/pass, rechecks locked lifecycle authority, creates one canonical match, and emits transactional v1 events.';

alter table public.match_intents_v1 enable row level security;
alter table public.relationship_decisions_v1 enable row level security;

revoke all on table public.match_intents_v1 from public, anon, authenticated;
revoke all on table public.relationship_decisions_v1 from public, anon, authenticated;
revoke all on table private.match_authority_config_v1 from public, anon, authenticated;
grant all on table private.match_authority_config_v1 to service_role;

revoke execute on function private.match_intent_writes_enabled_v1() from public, anon, authenticated;
revoke execute on function private.match_decision_writes_enabled_v1() from public, anon, authenticated;
revoke execute on function private.canonical_match_intent_filters_v1(jsonb) from public, anon, authenticated;
revoke execute on function private.match_intent_snapshot_v1(uuid) from public, anon, authenticated;
revoke execute on function private.expire_match_intent_v1(uuid) from public, anon, authenticated;
revoke execute on function private.assert_discovery_eligible_v1(uuid) from public, anon, authenticated;
revoke execute on function private.enqueue_contract_event_v1(text, text, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;

revoke execute on function public.get_current_match_intent_v1() from public, anon;
revoke execute on function public.activate_match_intent_v1(jsonb, text, bigint) from public, anon;
revoke execute on function public.pause_match_intent_v1(text, bigint) from public, anon;
revoke execute on function public.record_player_decision_v1(uuid, public.relationship_decision_v1, text, uuid, bigint, bigint) from public, anon;
grant execute on function public.get_current_match_intent_v1() to authenticated;
grant execute on function public.activate_match_intent_v1(jsonb, text, bigint) to authenticated;
grant execute on function public.pause_match_intent_v1(text, bigint) to authenticated;
grant execute on function public.record_player_decision_v1(uuid, public.relationship_decision_v1, text, uuid, bigint, bigint) to authenticated;
