-- Core V2 Mission 4: authoritative completed-session outcomes, immutable trust
-- facts, explainable reputation projection, repeat-play and activity foundation.
--
-- This migration intentionally does not foreign-key session_id yet. Play-session
-- storage belongs to Senior 2 and can be attached by a later additive migration;
-- the canonical session.completed.v2 envelope remains the source authority.

create type public.session_outcome_state_v2 as enum (
  'recorded',
  'disputed'
);

create type public.participation_confirmation_status_v2 as enum (
  'confirmed',
  'disputed'
);

create type public.participation_dispute_reason_v2 as enum (
  'session_did_not_happen',
  'left_before_start',
  'wrong_member_list',
  'other'
);

create type public.endorsement_kind_v2 as enum (
  'good_communication',
  'on_time',
  'cooperative',
  'role_reliable',
  'positive_attitude',
  'would_play_again'
);

create type public.reputation_dimension_v2 as enum (
  'completed_sessions',
  'no_show_count',
  'positive_endorsements',
  'repeat_teammate_count',
  'confirmed_moderation_actions'
);

create type public.reputation_source_type_v2 as enum (
  'participation_confirmation',
  'endorsement',
  'repeat_teammate',
  'moderation_action'
);

create type public.activity_item_kind_v2 as enum (
  'feedback_prompt',
  'reputation_progress',
  'repeat_play_recommendation'
);

create or replace function private.is_unique_uuid_array_v2(p_values uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_values is not null
    and cardinality(p_values) = (
      select count(distinct value)
      from unnest(p_values) as items(value)
    );
$$;

create or replace function private.is_unique_endorsement_kind_array_v2(
  p_values public.endorsement_kind_v2[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_values is not null
    and cardinality(p_values) = (
      select count(distinct value)
      from unnest(p_values) as items(value)
    );
$$;

create table public.session_outcomes_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null unique,
  source_event_id uuid not null unique,
  source_session_version bigint not null check (source_session_version > 0),
  participant_player_ids uuid[] not null,
  role_assignments jsonb not null default '[]'::jsonb,
  source jsonb not null,
  scheduled_for timestamptz,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  confirmation_deadline_at timestamptz not null,
  state public.session_outcome_state_v2 not null default 'recorded',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_outcomes_v2_participant_count check (
    cardinality(participant_player_ids) between 2 and 5
  ),
  constraint session_outcomes_v2_participants_unique check (
    private.is_unique_uuid_array_v2(participant_player_ids)
  ),
  constraint session_outcomes_v2_role_assignments_array check (
    jsonb_typeof(role_assignments) = 'array'
  ),
  constraint session_outcomes_v2_source_object check (
    jsonb_typeof(source) = 'object'
  ),
  constraint session_outcomes_v2_time_order check (
    completed_at > started_at
    and confirmation_deadline_at >= completed_at
  )
);

create table public.session_participation_confirmations_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  outcome_id uuid not null references public.session_outcomes_v2(id) on delete restrict,
  session_id uuid not null,
  player_id uuid not null references public.players(id) on delete restrict,
  status public.participation_confirmation_status_v2 not null,
  reason_code public.participation_dispute_reason_v2,
  dispute_note text,
  version bigint not null default 1 check (version = 1),
  audit_metadata jsonb not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint session_participation_confirmations_v2_unique
    unique (session_id, player_id),
  constraint session_participation_confirmations_v2_outcome_player_unique
    unique (outcome_id, player_id),
  constraint session_participation_confirmations_v2_reason_consistent check (
    (status = 'confirmed' and reason_code is null and dispute_note is null)
    or (status = 'disputed' and reason_code is not null)
  ),
  constraint session_participation_confirmations_v2_note_length check (
    dispute_note is null or char_length(dispute_note) between 1 and 500
  ),
  constraint session_participation_confirmations_v2_audit_object check (
    jsonb_typeof(audit_metadata) = 'object'
  )
);

create table public.player_endorsements_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  outcome_id uuid not null references public.session_outcomes_v2(id) on delete restrict,
  session_id uuid not null,
  actor_player_id uuid not null references public.players(id) on delete restrict,
  target_player_id uuid not null references public.players(id) on delete restrict,
  kinds public.endorsement_kind_v2[] not null,
  version bigint not null default 1 check (version = 1),
  audit_metadata jsonb not null,
  created_at timestamptz not null default now(),
  constraint player_endorsements_v2_unique
    unique (session_id, actor_player_id, target_player_id),
  constraint player_endorsements_v2_not_self check (
    actor_player_id <> target_player_id
  ),
  constraint player_endorsements_v2_kind_count check (
    cardinality(kinds) between 1 and 6
  ),
  constraint player_endorsements_v2_kinds_unique check (
    private.is_unique_endorsement_kind_array_v2(kinds)
  ),
  constraint player_endorsements_v2_audit_object check (
    jsonb_typeof(audit_metadata) = 'object'
  )
);

create table public.player_reputation_ledger_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  dimension public.reputation_dimension_v2 not null,
  delta bigint not null check (delta <> 0),
  source_type public.reputation_source_type_v2 not null,
  source_id uuid not null,
  source_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint player_reputation_ledger_v2_source_key_format check (
    char_length(source_key) between 8 and 180
    and source_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  constraint player_reputation_ledger_v2_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create table public.player_reputation_projection_v2 (
  player_id uuid primary key references public.players(id) on delete restrict,
  completed_sessions bigint not null default 0 check (completed_sessions >= 0),
  completion_reliability_bps integer not null default 0
    check (completion_reliability_bps between 0 and 10000),
  no_show_count bigint not null default 0 check (no_show_count >= 0),
  positive_endorsements bigint not null default 0 check (positive_endorsements >= 0),
  repeat_teammate_count bigint not null default 0 check (repeat_teammate_count >= 0),
  confirmed_moderation_actions bigint not null default 0
    check (confirmed_moderation_actions >= 0),
  projection_version bigint not null default 0 check (projection_version >= 0),
  rebuilt_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.repeat_teammate_relationships_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  player_low_id uuid not null references public.players(id) on delete restrict,
  player_high_id uuid not null references public.players(id) on delete restrict,
  completed_session_count bigint not null check (completed_session_count >= 2),
  first_completed_at timestamptz not null,
  last_completed_at timestamptz not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repeat_teammate_relationships_v2_pair_unique
    unique (player_low_id, player_high_id),
  constraint repeat_teammate_relationships_v2_canonical_pair check (
    player_low_id < player_high_id
  ),
  constraint repeat_teammate_relationships_v2_time_order check (
    last_completed_at >= first_completed_at
  )
);

create table public.activity_items_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  kind public.activity_item_kind_v2 not null,
  payload jsonb not null,
  priority integer not null default 0 check (priority between 0 and 1000),
  deduplication_key text not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint activity_items_v2_player_dedup_unique
    unique (player_id, deduplication_key),
  constraint activity_items_v2_dedup_format check (
    char_length(deduplication_key) between 8 and 180
    and deduplication_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  constraint activity_items_v2_payload_object check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint activity_items_v2_dismissed_after_create check (
    dismissed_at is null or dismissed_at >= created_at
  )
);

create table public.engagement_preferences_v2 (
  player_id uuid primary key references public.players(id) on delete restrict,
  activity_enabled boolean not null default true,
  feedback_prompts_enabled boolean not null default true,
  repeat_play_prompts_enabled boolean not null default true,
  push_reactivation_enabled boolean not null default true,
  max_reactivation_notifications_per_day smallint not null default 2
    check (max_reactivation_notifications_per_day between 0 and 4),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table public.repeat_play_requests_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  requester_player_id uuid not null references public.players(id) on delete restrict,
  teammate_player_ids uuid[] not null,
  status text not null default 'requested' check (
    status in ('requested', 'accepted', 'declined', 'expired', 'cancelled')
  ),
  version bigint not null default 1 check (version > 0),
  audit_metadata jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repeat_play_requests_v2_teammate_count check (
    cardinality(teammate_player_ids) between 1 and 4
  ),
  constraint repeat_play_requests_v2_teammates_unique check (
    private.is_unique_uuid_array_v2(teammate_player_ids)
  ),
  constraint repeat_play_requests_v2_requester_excluded check (
    not requester_player_id = any(teammate_player_ids)
  ),
  constraint repeat_play_requests_v2_audit_object check (
    jsonb_typeof(audit_metadata) = 'object'
  )
);

create table private.trust_consumed_events_v2 (
  event_id uuid primary key,
  event_type text not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null check (aggregate_version > 0),
  payload_hash text not null,
  result jsonb,
  processed_at timestamptz not null default now(),
  constraint trust_consumed_events_v2_type_format check (
    event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v2$'
  ),
  constraint trust_consumed_events_v2_hash_format check (
    payload_hash ~ '^[a-f0-9]{64}$'
  )
);

create table private.trust_authority_config_v2 (
  singleton boolean primary key default true check (singleton),
  reads_enabled boolean not null default true,
  writes_enabled boolean not null default true,
  feedback_prompts_enabled boolean not null default true,
  activity_enabled boolean not null default true,
  repeat_play_enabled boolean not null default true,
  public_projection_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.trust_authority_config_v2 (singleton)
values (true)
on conflict (singleton) do nothing;

create index session_outcomes_v2_completed_idx
  on public.session_outcomes_v2 (completed_at desc);
create index session_outcomes_v2_participants_gin_idx
  on public.session_outcomes_v2 using gin (participant_player_ids);
create index session_participation_confirmations_v2_player_idx
  on public.session_participation_confirmations_v2 (player_id, confirmed_at desc);
create index player_endorsements_v2_target_idx
  on public.player_endorsements_v2 (target_player_id, created_at desc);
create index player_reputation_ledger_v2_player_idx
  on public.player_reputation_ledger_v2 (player_id, created_at, id);
create index repeat_teammate_relationships_v2_low_idx
  on public.repeat_teammate_relationships_v2 (player_low_id, last_completed_at desc);
create index repeat_teammate_relationships_v2_high_idx
  on public.repeat_teammate_relationships_v2 (player_high_id, last_completed_at desc);
create index activity_items_v2_active_idx
  on public.activity_items_v2 (player_id, priority desc, created_at desc)
  where dismissed_at is null;
create index repeat_play_requests_v2_requester_idx
  on public.repeat_play_requests_v2 (requester_player_id, created_at desc);

create trigger session_outcomes_v2_set_updated_at
before update on public.session_outcomes_v2
for each row execute function public.set_updated_at();

create trigger repeat_teammate_relationships_v2_set_updated_at
before update on public.repeat_teammate_relationships_v2
for each row execute function public.set_updated_at();

create trigger activity_items_v2_set_updated_at
before update on public.activity_items_v2
for each row execute function public.set_updated_at();

create trigger engagement_preferences_v2_set_updated_at
before update on public.engagement_preferences_v2
for each row execute function public.set_updated_at();

create trigger repeat_play_requests_v2_set_updated_at
before update on public.repeat_play_requests_v2
for each row execute function public.set_updated_at();

create or replace function private.prevent_reputation_ledger_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.raise_core_error_v1(
    'reputation_ledger_immutable',
    'Reputation ledger entries are immutable.'
  );
  return old;
end;
$$;

create trigger player_reputation_ledger_v2_immutable
before update or delete on public.player_reputation_ledger_v2
for each row execute function private.prevent_reputation_ledger_mutation_v2();

create or replace function private.prevent_trust_fact_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.raise_core_error_v1(
    'trust_fact_immutable',
    format('%s facts are immutable.', tg_table_name)
  );
  return old;
end;
$$;

create trigger session_participation_confirmations_v2_immutable
before update or delete on public.session_participation_confirmations_v2
for each row execute function private.prevent_trust_fact_mutation_v2();

create trigger player_endorsements_v2_immutable
before update or delete on public.player_endorsements_v2
for each row execute function private.prevent_trust_fact_mutation_v2();

create or replace function private.resolve_trust_actor_v2(
  p_require_active boolean default true,
  p_lock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  identity_mapping jsonb;
  lifecycle_snapshot jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'trust_unauthenticated',
      'Authentication is required.'
    );
  end if;

  identity_mapping := public.resolve_player_identity_v1(actor_account_id, p_lock);
  if identity_mapping is null then
    perform private.raise_core_error_v1(
      'trust_identity_mismatch',
      'The authenticated account has no canonical PlayerId mapping.'
    );
  end if;

  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
    (identity_mapping ->> 'playerId')::uuid,
    p_lock
  );
  if lifecycle_snapshot is null then
    perform private.raise_core_error_v1(
      'trust_player_not_found',
      'The authenticated player does not exist.'
    );
  end if;

  if p_require_active and lifecycle_snapshot ->> 'state' <> 'active' then
    perform private.raise_core_error_v1(
      'trust_player_not_active',
      'The authenticated player lifecycle must be active.',
      false,
      jsonb_build_object('state', lifecycle_snapshot ->> 'state')
    );
  end if;

  return identity_mapping || jsonb_build_object('lifecycle', lifecycle_snapshot);
end;
$$;

create or replace function private.rebuild_player_reputation_projection_v2(
  p_player_id uuid,
  p_rebuilt_at timestamptz default null
)
returns public.player_reputation_projection_v2
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_sessions_value bigint := 0;
  no_show_count_value bigint := 0;
  positive_endorsements_value bigint := 0;
  repeat_teammate_count_value bigint := 0;
  confirmed_moderation_actions_value bigint := 0;
  projection_version_value bigint := 0;
  reliability_denominator numeric;
  reliability_bps_value integer := 0;
  projection_row public.player_reputation_projection_v2;
begin
  if not exists (select 1 from public.players players where players.id = p_player_id) then
    perform private.raise_core_error_v1(
      'trust_player_not_found',
      'The reputation projection target does not exist.'
    );
  end if;

  select
    coalesce(sum(entries.delta) filter (
      where entries.dimension = 'completed_sessions'
    ), 0),
    coalesce(sum(entries.delta) filter (
      where entries.dimension = 'no_show_count'
    ), 0),
    coalesce(sum(entries.delta) filter (
      where entries.dimension = 'positive_endorsements'
    ), 0),
    coalesce(sum(entries.delta) filter (
      where entries.dimension = 'repeat_teammate_count'
    ), 0),
    coalesce(sum(entries.delta) filter (
      where entries.dimension = 'confirmed_moderation_actions'
    ), 0),
    count(*)
  into
    completed_sessions_value,
    no_show_count_value,
    positive_endorsements_value,
    repeat_teammate_count_value,
    confirmed_moderation_actions_value,
    projection_version_value
  from public.player_reputation_ledger_v2 entries
  where entries.player_id = p_player_id;

  completed_sessions_value := greatest(completed_sessions_value, 0);
  no_show_count_value := greatest(no_show_count_value, 0);
  positive_endorsements_value := greatest(positive_endorsements_value, 0);
  repeat_teammate_count_value := greatest(repeat_teammate_count_value, 0);
  confirmed_moderation_actions_value := greatest(
    confirmed_moderation_actions_value,
    0
  );
  reliability_denominator := completed_sessions_value + no_show_count_value;
  if reliability_denominator > 0 then
    reliability_bps_value := round(
      completed_sessions_value::numeric * 10000 / reliability_denominator
    )::integer;
  end if;

  insert into public.player_reputation_projection_v2 (
    player_id,
    completed_sessions,
    completion_reliability_bps,
    no_show_count,
    positive_endorsements,
    repeat_teammate_count,
    confirmed_moderation_actions,
    projection_version,
    rebuilt_at,
    updated_at
  ) values (
    p_player_id,
    completed_sessions_value,
    reliability_bps_value,
    no_show_count_value,
    positive_endorsements_value,
    repeat_teammate_count_value,
    confirmed_moderation_actions_value,
    projection_version_value,
    p_rebuilt_at,
    now()
  )
  on conflict (player_id) do update
  set completed_sessions = excluded.completed_sessions,
      completion_reliability_bps = excluded.completion_reliability_bps,
      no_show_count = excluded.no_show_count,
      positive_endorsements = excluded.positive_endorsements,
      repeat_teammate_count = excluded.repeat_teammate_count,
      confirmed_moderation_actions = excluded.confirmed_moderation_actions,
      projection_version = excluded.projection_version,
      rebuilt_at = coalesce(
        excluded.rebuilt_at,
        player_reputation_projection_v2.rebuilt_at
      ),
      updated_at = excluded.updated_at
  returning * into projection_row;

  return projection_row;
end;
$$;

create or replace function private.append_reputation_ledger_entry_v2(
  p_player_id uuid,
  p_dimension public.reputation_dimension_v2,
  p_delta bigint,
  p_source_type public.reputation_source_type_v2,
  p_source_id uuid,
  p_source_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id_value uuid;
begin
  if p_delta is null or p_delta = 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Reputation ledger delta must be non-zero.'
    );
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Reputation ledger metadata must be an object.'
    );
  end if;

  insert into public.player_reputation_ledger_v2 (
    player_id,
    dimension,
    delta,
    source_type,
    source_id,
    source_key,
    metadata
  ) values (
    p_player_id,
    p_dimension,
    p_delta,
    p_source_type,
    p_source_id,
    p_source_key,
    p_metadata
  )
  on conflict (source_key) do nothing
  returning id into entry_id_value;

  if entry_id_value is null then
    select entries.id into entry_id_value
    from public.player_reputation_ledger_v2 entries
    where entries.source_key = p_source_key;
  end if;

  perform private.rebuild_player_reputation_projection_v2(p_player_id, null);
  return entry_id_value;
end;
$$;

create or replace function private.session_outcome_snapshot_v2(p_outcome_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'outcomeId', outcomes.id,
    'sessionId', outcomes.session_id,
    'sourceSessionVersion', outcomes.source_session_version,
    'participantPlayerIds', outcomes.participant_player_ids,
    'scheduledFor', outcomes.scheduled_for,
    'startedAt', outcomes.started_at,
    'completedAt', outcomes.completed_at,
    'confirmationDeadlineAt', outcomes.confirmation_deadline_at,
    'state', outcomes.state,
    'version', outcomes.version
  )
  from public.session_outcomes_v2 outcomes
  where outcomes.id = p_outcome_id;
$$;

create or replace function private.player_trust_projection_snapshot_v2(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'playerId', projections.player_id,
    'completedSessions', projections.completed_sessions,
    'completionReliabilityBps', projections.completion_reliability_bps,
    'noShowCount', projections.no_show_count,
    'positiveEndorsements', projections.positive_endorsements,
    'repeatTeammateCount', projections.repeat_teammate_count,
    'confirmedModerationActions', projections.confirmed_moderation_actions,
    'projectionVersion', projections.projection_version,
    'rebuiltAt', projections.rebuilt_at,
    'updatedAt', projections.updated_at
  )
  from public.player_reputation_projection_v2 projections
  where projections.player_id = p_player_id;
$$;

create or replace function private.reputation_ledger_entry_snapshot_v2(
  p_entry_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId', entries.id,
    'playerId', entries.player_id,
    'dimension', entries.dimension,
    'delta', entries.delta,
    'sourceType', entries.source_type,
    'sourceId', entries.source_id,
    'metadata', entries.metadata,
    'createdAt', entries.created_at
  )
  from public.player_reputation_ledger_v2 entries
  where entries.id = p_entry_id;
$$;

create or replace function private.activity_item_snapshot_v2(p_activity_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'activityItemId', items.id,
    'playerId', items.player_id,
    'kind', items.kind,
    'payload', items.payload,
    'priority', items.priority,
    'deduplicationKey', items.deduplication_key,
    'version', items.version,
    'createdAt', items.created_at,
    'dismissedAt', items.dismissed_at
  )
  from public.activity_items_v2 items
  where items.id = p_activity_item_id;
$$;

create or replace function private.engagement_preferences_snapshot_v2(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'playerId', preferences.player_id,
    'activityEnabled', preferences.activity_enabled,
    'feedbackPromptsEnabled', preferences.feedback_prompts_enabled,
    'repeatPlayPromptsEnabled', preferences.repeat_play_prompts_enabled,
    'pushReactivationEnabled', preferences.push_reactivation_enabled,
    'maxReactivationNotificationsPerDay',
      preferences.max_reactivation_notifications_per_day,
    'version', preferences.version,
    'updatedAt', preferences.updated_at
  )
  from public.engagement_preferences_v2 preferences
  where preferences.player_id = p_player_id;
$$;

create or replace function private.seed_trust_player_defaults_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_reputation_projection_v2 (player_id)
  values (new.id)
  on conflict (player_id) do nothing;

  insert into public.engagement_preferences_v2 (player_id)
  values (new.id)
  on conflict (player_id) do nothing;

  return new;
end;
$$;

create trigger players_seed_trust_defaults_v2
after insert on public.players
for each row execute function private.seed_trust_player_defaults_v2();

insert into public.player_reputation_projection_v2 (player_id)
select players.id from public.players players
on conflict (player_id) do nothing;

insert into public.engagement_preferences_v2 (player_id)
select players.id from public.players players
on conflict (player_id) do nothing;

create or replace function public.get_session_outcome_v2(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config_row private.trust_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
  outcome_row public.session_outcomes_v2;
begin
  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 trust reads are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_trust_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;

  select outcomes.* into outcome_row
  from public.session_outcomes_v2 outcomes
  where outcomes.session_id = p_session_id;
  if outcome_row.id is null then
    return null;
  end if;
  if not actor_player_id = any(outcome_row.participant_player_ids) then
    perform private.raise_core_error_v1(
      'trust_forbidden',
      'Only session participants can read this outcome.'
    );
  end if;

  return private.session_outcome_snapshot_v2(outcome_row.id);
end;
$$;

create or replace function public.get_player_trust_projection_v2(
  p_target_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config_row private.trust_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
  visibility_decision jsonb;
begin
  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 trust reads are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_trust_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  if not exists (
    select 1 from public.players players where players.id = p_target_player_id
  ) then
    perform private.raise_core_error_v1(
      'trust_player_not_found',
      'The trust projection target does not exist.'
    );
  end if;

  if actor_player_id <> p_target_player_id then
    if not coalesce(config_row.public_projection_enabled, false) then
      perform private.raise_core_error_v1(
        'trust_projection_hidden',
        'Public trust projection display is disabled.'
      );
    end if;
    visibility_decision := private.social_trust_visibility_decision_v2(
      actor_player_id,
      p_target_player_id
    );
    if not coalesce((visibility_decision ->> 'canViewTrust')::boolean, false) then
      perform private.raise_core_error_v1(
        'privacy_forbidden',
        'The Social privacy authority denied this trust projection.'
      );
    end if;
  end if;

  return private.player_trust_projection_snapshot_v2(p_target_player_id);
end;
$$;

create or replace function public.list_player_reputation_ledger_v2(
  p_player_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config_row private.trust_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
begin
  if p_player_id is null or p_limit is null or p_limit not between 1 and 200 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'playerId and ledger limit between 1 and 200 are required.'
    );
  end if;
  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 trust reads are disabled.',
      true
    );
  end if;
  actor_context := private.resolve_trust_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  if actor_player_id <> p_player_id then
    perform private.raise_core_error_v1(
      'privacy_forbidden',
      'Raw reputation ledger facts are self-only.'
    );
  end if;
  return coalesce((
    select jsonb_agg(private.reputation_ledger_entry_snapshot_v2(entries.id)
      order by entries.created_at desc, entries.id desc)
    from (
      select ledger.id, ledger.created_at
      from public.player_reputation_ledger_v2 ledger
      where ledger.player_id = actor_player_id
      order by ledger.created_at desc, ledger.id desc
      limit p_limit
    ) entries
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_activity_items_v2(
  p_limit integer default 20,
  p_include_dismissed boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config_row private.trust_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
  preference_row public.engagement_preferences_v2;
begin
  if p_limit is null or p_limit not between 1 and 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Activity limit must be between 1 and 50.'
    );
  end if;

  select config.* into config_row
  from private.trust_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false)
    or not coalesce(config_row.activity_enabled, false) then
    return '[]'::jsonb;
  end if;

  actor_context := private.resolve_trust_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  select preferences.* into preference_row
  from public.engagement_preferences_v2 preferences
  where preferences.player_id = actor_player_id;
  if not coalesce(preference_row.activity_enabled, true) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(private.activity_item_snapshot_v2(items.id)
      order by items.priority desc, items.created_at desc, items.id)
    from (
      select activity.id, activity.priority, activity.created_at
      from public.activity_items_v2 activity
      where activity.player_id = actor_player_id
        and (p_include_dismissed or activity.dismissed_at is null)
      order by activity.priority desc, activity.created_at desc, activity.id
      limit p_limit
    ) items
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_engagement_preferences_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_context jsonb;
  actor_player_id uuid;
begin
  actor_context := private.resolve_trust_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  return private.engagement_preferences_snapshot_v2(actor_player_id);
end;
$$;

alter table public.session_outcomes_v2 enable row level security;
alter table public.session_participation_confirmations_v2 enable row level security;
alter table public.player_endorsements_v2 enable row level security;
alter table public.player_reputation_ledger_v2 enable row level security;
alter table public.player_reputation_projection_v2 enable row level security;
alter table public.repeat_teammate_relationships_v2 enable row level security;
alter table public.activity_items_v2 enable row level security;
alter table public.engagement_preferences_v2 enable row level security;
alter table public.repeat_play_requests_v2 enable row level security;

revoke all on public.session_outcomes_v2 from public, anon, authenticated;
revoke all on public.session_participation_confirmations_v2 from public, anon, authenticated;
revoke all on public.player_endorsements_v2 from public, anon, authenticated;
revoke all on public.player_reputation_ledger_v2 from public, anon, authenticated;
revoke all on public.player_reputation_projection_v2 from public, anon, authenticated;
revoke all on public.repeat_teammate_relationships_v2 from public, anon, authenticated;
revoke all on public.activity_items_v2 from public, anon, authenticated;
revoke all on public.engagement_preferences_v2 from public, anon, authenticated;
revoke all on public.repeat_play_requests_v2 from public, anon, authenticated;

grant all on public.session_outcomes_v2 to service_role;
grant all on public.session_participation_confirmations_v2 to service_role;
grant all on public.player_endorsements_v2 to service_role;
grant all on public.player_reputation_ledger_v2 to service_role;
grant all on public.player_reputation_projection_v2 to service_role;
grant all on public.repeat_teammate_relationships_v2 to service_role;
grant all on public.activity_items_v2 to service_role;
grant all on public.engagement_preferences_v2 to service_role;
grant all on public.repeat_play_requests_v2 to service_role;

revoke all on private.trust_consumed_events_v2 from public, anon, authenticated;
revoke all on private.trust_authority_config_v2 from public, anon, authenticated;
grant all on private.trust_consumed_events_v2 to service_role;
grant all on private.trust_authority_config_v2 to service_role;

revoke execute on function private.is_unique_uuid_array_v2(uuid[])
  from public, anon, authenticated;
revoke execute on function private.is_unique_endorsement_kind_array_v2(public.endorsement_kind_v2[])
  from public, anon, authenticated;
revoke execute on function private.prevent_reputation_ledger_mutation_v2()
  from public, anon, authenticated;
revoke execute on function private.prevent_trust_fact_mutation_v2()
  from public, anon, authenticated;
revoke execute on function private.resolve_trust_actor_v2(boolean, boolean)
  from public, anon, authenticated;
revoke execute on function private.rebuild_player_reputation_projection_v2(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.append_reputation_ledger_entry_v2(
  uuid,
  public.reputation_dimension_v2,
  bigint,
  public.reputation_source_type_v2,
  uuid,
  text,
  jsonb
) from public, anon, authenticated;
revoke execute on function private.session_outcome_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.player_trust_projection_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.reputation_ledger_entry_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.activity_item_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.engagement_preferences_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.seed_trust_player_defaults_v2()
  from public, anon, authenticated;

revoke execute on function public.get_session_outcome_v2(uuid)
  from public, anon;
revoke execute on function public.get_player_trust_projection_v2(uuid)
  from public, anon;
revoke execute on function public.list_player_reputation_ledger_v2(uuid, integer)
  from public, anon;
revoke execute on function public.list_activity_items_v2(integer, boolean)
  from public, anon;
revoke execute on function public.get_engagement_preferences_v2()
  from public, anon;

grant execute on function private.rebuild_player_reputation_projection_v2(uuid, timestamptz)
  to service_role;
grant execute on function private.append_reputation_ledger_entry_v2(
  uuid,
  public.reputation_dimension_v2,
  bigint,
  public.reputation_source_type_v2,
  uuid,
  text,
  jsonb
) to service_role;
grant execute on function public.get_session_outcome_v2(uuid)
  to authenticated;
grant execute on function public.get_player_trust_projection_v2(uuid)
  to authenticated;
grant execute on function public.list_player_reputation_ledger_v2(uuid, integer)
  to authenticated;
grant execute on function public.list_activity_items_v2(integer, boolean)
  to authenticated;
grant execute on function public.get_engagement_preferences_v2()
  to authenticated;
