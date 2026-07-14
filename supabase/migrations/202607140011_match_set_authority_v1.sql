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

create or replace function private.assert_discovery_eligible_v1(p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id_value uuid;
  lifecycle_state_value text;
begin
  if p_snapshot is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The player identity is unavailable.'
    );
  end if;

  begin
    player_id_value := (p_snapshot ->> 'playerId')::uuid;
    lifecycle_state_value := p_snapshot ->> 'state';
  exception when others then
    perform private.raise_core_error_v1(
      'internal_error',
      'The lifecycle provider returned an invalid snapshot.'
    );
  end;

  if private.is_player_discovery_eligible_v1(player_id_value) then
    return;
  end if;

  if lifecycle_state_value = 'suspended' then
    perform private.raise_core_error_v1(
      'player_suspended',
      'The player is suspended.'
    );
  elsif lifecycle_state_value = 'deleting' then
    perform private.raise_core_error_v1(
      'player_deleting',
      'The player is being deleted.'
    );
  elsif lifecycle_state_value = 'deleted' then
    perform private.raise_core_error_v1(
      'player_deleted',
      'The player has been deleted.'
    );
  elsif lifecycle_state_value <> 'active' then
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
  actor_identity jsonb;
  actor_player_id uuid;
  intent_id_value uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    return null;
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;

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
  actor_identity jsonb;
  actor_lifecycle jsonb;
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

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player identity was not found.'
    );
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;
  actor_lifecycle := public.get_player_lifecycle_snapshot_v1(
    actor_player_id,
    true
  );
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
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
  actor_identity jsonb;
  actor_lifecycle jsonb;
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

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player identity was not found.'
    );
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;
  actor_lifecycle := public.get_player_lifecycle_snapshot_v1(
    actor_player_id,
    true
  );
  if actor_lifecycle is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player lifecycle was not found.'
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
  actor_identity jsonb;
  actor_lifecycle jsonb;
  target_lifecycle jsonb;
  low_lifecycle jsonb;
  high_lifecycle jsonb;
  target_profile_version jsonb;
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

  -- Resolve only the semantic PlayerId before the pair lock. The identity
  -- provider remains lock-free here, avoiding opposite-direction deadlocks.
  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player identity was not found.'
    );
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;

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

  -- The lifecycle provider owns row-lock semantics. Calling it for the low then
  -- high PlayerId keeps pair commands compatible with lifecycle transitions.
  low_lifecycle := public.get_player_lifecycle_snapshot_v1(low_player_id, true);
  high_lifecycle := public.get_player_lifecycle_snapshot_v1(high_player_id, true);

  if actor_player_id = low_player_id then
    actor_lifecycle := low_lifecycle;
    target_lifecycle := high_lifecycle;
  else
    actor_lifecycle := high_lifecycle;
    target_lifecycle := low_lifecycle;
  end if;

  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  perform private.assert_discovery_eligible_v1(target_lifecycle);

  target_profile_version := public.get_player_profile_version_v1(
    (target_lifecycle ->> 'profileId')::uuid,
    false
  );

  select * into actor_profile
  from public.player_profiles_v1 profiles
  where profiles.id = (actor_lifecycle ->> 'profileId')::uuid;
  select * into target_profile
  from public.player_profiles_v1 profiles
  where profiles.id = (target_lifecycle ->> 'profileId')::uuid;

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

  if target_profile_version is null
    or (target_profile_version ->> 'version')::bigint
      <> p_expected_target_profile_version
  then
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
revoke execute on function private.assert_discovery_eligible_v1(jsonb) from public, anon, authenticated;
revoke execute on function private.enqueue_contract_event_v1(text, text, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;

revoke execute on function public.get_current_match_intent_v1() from public, anon;
revoke execute on function public.activate_match_intent_v1(jsonb, text, bigint) from public, anon;
revoke execute on function public.pause_match_intent_v1(text, bigint) from public, anon;
revoke execute on function public.record_player_decision_v1(uuid, public.relationship_decision_v1, text, uuid, bigint, bigint) from public, anon;
grant execute on function public.get_current_match_intent_v1() to authenticated;
grant execute on function public.activate_match_intent_v1(jsonb, text, bigint) to authenticated;
grant execute on function public.pause_match_intent_v1(text, bigint) to authenticated;
grant execute on function public.record_player_decision_v1(uuid, public.relationship_decision_v1, text, uuid, bigint, bigint) to authenticated;

-- Read seam for discovery candidate enumeration. Eligibility remains owned by
-- Mission 1 lifecycle state; consumers must not infer it from profile rows.

create function public.list_discoverable_player_lifecycle_v1(
  p_exclude_player_id uuid default null
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.player_lifecycle_snapshot_v1(players.id)
  from public.players players
  where players.auth_user_id is not null
    and players.lifecycle_state = 'active'
    and players.discoverable = true
    and (
      p_exclude_player_id is null
      or players.id <> p_exclude_player_id
    )
    and exists (
      select 1
      from public.player_profiles_v1 profiles
      where profiles.player_id = players.id
    )
  order by players.id;
$$;

comment on function public.list_discoverable_player_lifecycle_v1(uuid) is
  'Returns exact PlayerLifecycleSnapshotV1 rows for live active discoverable players, ordered by PlayerId. Service consumers must recheck with p_lock=true before command writes.';

revoke execute on function public.list_discoverable_player_lifecycle_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.list_discoverable_player_lifecycle_v1(uuid)
  to service_role;

-- Authoritative Discovery candidate snapshots and opaque cursor pagination.
-- Candidate eligibility is delegated to Mission 1; Match Intent and
-- relationship semantics remain Mission 2-owned.

create table private.discovery_snapshots_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  viewer_player_id uuid not null references public.players(id) on delete cascade,
  match_intent_id uuid not null references public.match_intents_v1(id) on delete cascade,
  intent_version bigint not null check (intent_version > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  total_candidates integer not null default 0 check (total_candidates >= 0),
  check (expires_at > created_at)
);

create table private.discovery_snapshot_candidates_v1 (
  snapshot_id uuid not null references private.discovery_snapshots_v1(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  candidate_player_id uuid not null references public.players(id) on delete cascade,
  score integer not null,
  payload jsonb not null,
  primary key (snapshot_id, ordinal),
  unique (snapshot_id, candidate_player_id)
);

create table private.discovery_cursors_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  snapshot_id uuid not null references private.discovery_snapshots_v1(id) on delete cascade,
  next_ordinal integer not null check (next_ordinal > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, next_ordinal)
);

create index discovery_snapshots_viewer_created_v1_idx
  on private.discovery_snapshots_v1 (viewer_player_id, created_at desc);
create index discovery_snapshot_candidates_player_v1_idx
  on private.discovery_snapshot_candidates_v1 (candidate_player_id, snapshot_id);
create index discovery_cursors_expiry_v1_idx
  on private.discovery_cursors_v1 (expires_at);

create or replace function private.discovery_reads_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$select config.reads_enabled
  from private.match_authority_config_v1 config
  where config.singleton
    or p_filters in (
      'set.invite_created.v1',
      'set.join_requested.v1'
    )
$$;

-- Match Set Authority v1: immutable discovery snapshots plus idempotent invite
-- and join-request commands. Membership acceptance and Match creation remain
-- separate authoritative transitions.

create type public.match_set_state_v1 as enum ('open', 'full', 'closed');
create type public.match_set_member_role_v1 as enum ('owner', 'member');
create type public.set_invite_state_v1 as enum (
  'pending', 'accepted', 'rejected', 'expired'
);
create type public.set_join_request_state_v1 as enum (
  'pending', 'accepted', 'rejected', 'cancelled'
);

create table public.match_sets_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_player_id uuid not null references public.players(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  capacity integer not null check (capacity between 2 and 5),
  intent_kind public.home_match_kind_v1 not null default 'normal',
  state public.match_set_state_v1 not null default 'open',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_set_members_v1 (
  set_id uuid not null references public.match_sets_v1(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  role public.match_set_member_role_v1 not null,
  joined_at timestamptz not null default now(),
  primary key (set_id, player_id)
);

create unique index match_set_owner_member_v1_key
  on public.match_set_members_v1 (set_id)
  where role = 'owner';

create table public.match_set_invites_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  set_id uuid not null references public.match_sets_v1(id) on delete cascade,
  actor_player_id uuid not null references public.players(id) on delete restrict,
  target_player_id uuid not null references public.players(id) on delete restrict,
  state public.set_invite_state_v1 not null default 'pending',
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (actor_player_id <> target_player_id)
);

create unique index match_set_invites_pending_target_v1_key
  on public.match_set_invites_v1 (set_id, target_player_id)
  where state = 'pending';

create table public.match_set_join_requests_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  set_id uuid not null references public.match_sets_v1(id) on delete cascade,
  requester_player_id uuid not null references public.players(id) on delete restrict,
  state public.set_join_request_state_v1 not null default 'pending',
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index match_set_join_requests_pending_player_v1_key
  on public.match_set_join_requests_v1 (set_id, requester_player_id)
  where state = 'pending';

create table private.set_discovery_snapshots_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  viewer_player_id uuid not null references public.players(id) on delete cascade,
  match_intent_id uuid not null references public.match_intents_v1(id) on delete cascade,
  intent_version bigint not null check (intent_version > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  total_candidates integer not null default 0 check (total_candidates >= 0),
  check (expires_at > created_at)
);

create table private.set_discovery_snapshot_candidates_v1 (
  snapshot_id uuid not null references private.set_discovery_snapshots_v1(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  set_id uuid not null references public.match_sets_v1(id) on delete cascade,
  payload jsonb not null,
  primary key (snapshot_id, ordinal),
  unique (snapshot_id, set_id)
);

create table private.set_discovery_cursors_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  snapshot_id uuid not null references private.set_discovery_snapshots_v1(id) on delete cascade,
  next_ordinal integer not null check (next_ordinal > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, next_ordinal)
);

create index match_sets_state_created_v1_idx
  on public.match_sets_v1 (state, created_at desc);
create index match_set_members_player_v1_idx
  on public.match_set_members_v1 (player_id, set_id);
create index set_discovery_snapshots_viewer_v1_idx
  on private.set_discovery_snapshots_v1 (viewer_player_id, created_at desc);
create index set_discovery_cursors_expiry_v1_idx
  on private.set_discovery_cursors_v1 (expires_at);

create trigger match_sets_v1_set_updated_at
before update on public.match_sets_v1
for each row execute function public.set_updated_at();
create trigger match_set_invites_v1_set_updated_at
before update on public.match_set_invites_v1
for each row execute function public.set_updated_at();
create trigger match_set_join_requests_v1_set_updated_at
before update on public.match_set_join_requests_v1
for each row execute function public.set_updated_at();

create or replace function private.match_set_snapshot_v1(p_set_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'capacity', sets.capacity,
    'createdAt', sets.created_at,
    'intentKind', sets.intent_kind,
    'memberPlayerIds', coalesce(
      (
        select jsonb_agg(members.player_id order by members.player_id)
        from public.match_set_members_v1 members
        where members.set_id = sets.id
      ),
      '[]'::jsonb
    ),
    'ownerPlayerId', sets.owner_player_id,
    'setId', sets.id,
    'state', sets.state,
    'title', sets.title,
    'version', sets.version
  )
  from public.match_sets_v1 sets
  where sets.id = p_set_id
$$;

create or replace function private.assert_active_match_intent_v1(
  p_player_id uuid
)
returns public.match_intents_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.match_intents_v1%rowtype;
begin
  perform private.expire_match_intent_v1(p_player_id);
  select * into intent
  from public.match_intents_v1 intents
  where intents.player_id = p_player_id;

  if intent.id is null or intent.state <> 'active' then
    perform private.raise_core_error_v1(
      'intent_not_active',
      'An active Match Intent is required.'
    );
  end if;
  return intent;
end;
$$;

create or replace function private.assert_match_set_open_v1(
  p_set public.match_sets_v1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
begin
  select count(*)::integer into member_count
  from public.match_set_members_v1 members
  where members.set_id = p_set.id;

  if p_set.state = 'closed' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The Match Set is closed.'
    );
  end if;
  if p_set.state = 'full' or member_count >= p_set.capacity then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The Match Set is full.'
    );
  end if;
end;
$$;

create or replace function private.create_set_discovery_snapshot_v1(
  p_viewer_player_id uuid,
  p_viewer_legacy_profile_id uuid,
  p_match_intent public.match_intents_v1
)
returns private.set_discovery_snapshots_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_row private.set_discovery_snapshots_v1%rowtype;
  candidate_count integer;
begin
  insert into private.set_discovery_snapshots_v1 (
    viewer_player_id,
    match_intent_id,
    intent_version,
    expires_at
  ) values (
    p_viewer_player_id,
    p_match_intent.id,
    p_match_intent.version,
    now() + interval '10 minutes'
  )
  returning * into snapshot_row;

  with candidates as (
    select
      sets.id,
      sets.created_at,
      sets.intent_kind,
      sets.capacity - count(members.player_id)::integer as open_slots,
      case
        when sets.intent_kind::text = p_match_intent.filters ->> 'intentKind'
        then 1 else 0
      end as intent_overlap,
      exists (
        select 1
        from public.match_set_join_requests_v1 requests
        where requests.set_id = sets.id
          and requests.requester_player_id = p_viewer_player_id
          and requests.state = 'pending'
      ) as has_pending_request,
      exists (
        select 1
        from public.match_set_invites_v1 invites
        where invites.set_id = sets.id
          and invites.target_player_id = p_viewer_player_id
          and invites.state = 'pending'
      ) as has_pending_invite
    from public.match_sets_v1 sets
    join public.match_set_members_v1 members on members.set_id = sets.id
    join public.player_profiles_v1 owner_profile
      on owner_profile.player_id = sets.owner_player_id
    where sets.state = 'open'
      and private.is_player_discovery_eligible_v1(sets.owner_player_id)
      and not exists (
        select 1
        from public.match_set_members_v1 viewer_membership
        where viewer_membership.set_id = sets.id
          and viewer_membership.player_id = p_viewer_player_id
      )
      and not private.are_profiles_blocked(
        p_viewer_legacy_profile_id,
        owner_profile.legacy_profile_id
      )
    group by sets.id
    having count(members.player_id) < sets.capacity
  ), ranked as (
    select
      row_number() over (
        order by intent_overlap desc, open_slots desc, created_at desc, id
      )::integer as ordinal,
      candidates.*
    from candidates
  )
  insert into private.set_discovery_snapshot_candidates_v1 (
    snapshot_id,
    ordinal,
    set_id,
    payload
  )
  select
    snapshot_row.id,
    ranked.ordinal,
    ranked.id,
    jsonb_build_object(
      'capabilities', jsonb_build_object(
        'canInvite', false,
        'canRequestJoin', not ranked.has_pending_request
          and not ranked.has_pending_invite
      ),
      'recommendationContext', jsonb_build_object(
        'reasonCodes', to_jsonb(array_remove(array[
          'open_slot'::text,
          case when ranked.intent_overlap = 1 then 'intent_kind_overlap' end,
          case when ranked.has_pending_request then 'join_request_pending' end,
          case when ranked.has_pending_invite then 'invite_pending' end
        ], null))
      ),
      'set', private.match_set_snapshot_v1(ranked.id)
    )
  from ranked;

  get diagnostics candidate_count = row_count;
  update private.set_discovery_snapshots_v1
  set total_candidates = candidate_count
  where id = snapshot_row.id
  returning * into snapshot_row;
  return snapshot_row;
end;
$$;

create or replace function public.list_discovery_sets_v1(
  p_cursor uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_lifecycle jsonb;
  actor_player_id uuid;
  actor_profile public.player_profiles_v1%rowtype;
  actor_intent public.match_intents_v1%rowtype;
  snapshot_row private.set_discovery_snapshots_v1%rowtype;
  cursor_row private.set_discovery_cursors_v1%rowtype;
  start_ordinal integer := 1;
  next_ordinal_value integer;
  next_cursor_id uuid;
  page_items jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Set discovery page limit must be between 1 and 50.'
    );
  end if;
  if not private.discovery_reads_enabled_v1() then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Authoritative Discovery reads are disabled by rollout policy.',
      true
    );
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1('player_not_found', 'Player identity was not found.');
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;
  actor_lifecycle := public.get_player_lifecycle_snapshot_v1(actor_player_id, false);
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  actor_intent := private.assert_active_match_intent_v1(actor_player_id);

  select * into actor_profile
  from public.player_profiles_v1 profiles
  where profiles.id = (actor_identity ->> 'profileId')::uuid;
  if actor_profile.legacy_profile_id is null then
    perform private.raise_core_error_v1('profile_incomplete', 'Profile mapping is incomplete.');
  end if;

  if p_cursor is null then
    snapshot_row := private.create_set_discovery_snapshot_v1(
      actor_player_id,
      actor_profile.legacy_profile_id,
      actor_intent
    );
  else
    select * into cursor_row
    from private.set_discovery_cursors_v1 cursors
    where cursors.id = p_cursor;
    if cursor_row.id is null or cursor_row.expires_at <= now() then
      perform private.raise_core_error_v1('stale_cursor', 'Set discovery cursor is invalid or expired.');
    end if;
    select * into snapshot_row
    from private.set_discovery_snapshots_v1 snapshots
    where snapshots.id = cursor_row.snapshot_id;
    if snapshot_row.id is null
      or snapshot_row.viewer_player_id <> actor_player_id
      or snapshot_row.expires_at <= now()
      or snapshot_row.match_intent_id <> actor_intent.id
      or snapshot_row.intent_version <> actor_intent.version
    then
      perform private.raise_core_error_v1('stale_cursor', 'Set discovery cursor is stale.');
    end if;
    start_ordinal := cursor_row.next_ordinal;
  end if;

  select coalesce(jsonb_agg(page.payload order by page.ordinal), '[]'::jsonb)
  into page_items
  from (
    select candidates.ordinal, candidates.payload
    from private.set_discovery_snapshot_candidates_v1 candidates
    where candidates.snapshot_id = snapshot_row.id
      and candidates.ordinal >= start_ordinal
      and candidates.ordinal < start_ordinal + p_limit
    order by candidates.ordinal
  ) page;

  next_ordinal_value := start_ordinal + p_limit;
  if next_ordinal_value <= snapshot_row.total_candidates then
    insert into private.set_discovery_cursors_v1 (
      snapshot_id, next_ordinal, expires_at
    ) values (
      snapshot_row.id, next_ordinal_value, snapshot_row.expires_at
    )
    on conflict (snapshot_id, next_ordinal) do update
      set expires_at = excluded.expires_at
    returning id into next_cursor_id;
  end if;

  return jsonb_build_object(
    'items', page_items,
    'nextCursor', next_cursor_id,
    'snapshot', jsonb_build_object(
      'createdAt', snapshot_row.created_at,
      'expiresAt', snapshot_row.expires_at,
      'intentVersion', snapshot_row.intent_version,
      'snapshotId', snapshot_row.id
    )
  );
end;
$$;

create or replace function public.create_set_invite_v1(
  p_set_id uuid,
  p_target_player_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_set_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_player_id uuid;
  low_player_id uuid;
  high_player_id uuid;
  low_lifecycle jsonb;
  high_lifecycle jsonb;
  actor_lifecycle jsonb;
  target_lifecycle jsonb;
  actor_profile public.player_profiles_v1%rowtype;
  target_profile public.player_profiles_v1%rowtype;
  set_row public.match_sets_v1%rowtype;
  invite public.match_set_invites_v1%rowtype;
  request_hash text;
  command_state record;
  response_payload jsonb;
  event_id uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;
  if p_set_id is null or p_target_player_id is null or p_correlation_id is null
    or p_expected_set_version is null
  then
    perform private.raise_core_error_v1('validation_failed', 'Set invite command is incomplete.');
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id,
    'targetPlayerId', p_target_player_id,
    'correlationId', p_correlation_id,
    'expectedSetVersion', p_expected_set_version
  ));
  select * into command_state
  from private.begin_command_v1(
    'create_set_invite_v1', actor_account_id, p_idempotency_key, request_hash
  );
  if command_state.repeated then return command_state.response; end if;
  if not private.match_decision_writes_enabled_v1() then
    perform private.raise_core_error_v1('service_unavailable', 'Set writes are disabled.', true);
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1('player_not_found', 'Actor identity was not found.');
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;
  if actor_player_id = p_target_player_id then
    perform private.raise_core_error_v1('validation_failed', 'Cannot invite yourself.');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match_set:' || p_set_id::text, 0)
  );
  select * into set_row from public.match_sets_v1 where id = p_set_id for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'Match Set was not found.');
  end if;
  if set_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1('validation_failed', 'Only the Set owner can invite.');
  end if;
  if set_row.version <> p_expected_set_version then
    perform private.raise_core_error_v1('validation_failed', 'Match Set version changed.');
  end if;
  perform private.assert_match_set_open_v1(set_row);

  low_player_id := least(actor_player_id, p_target_player_id);
  high_player_id := greatest(actor_player_id, p_target_player_id);
  low_lifecycle := public.get_player_lifecycle_snapshot_v1(low_player_id, true);
  high_lifecycle := public.get_player_lifecycle_snapshot_v1(high_player_id, true);
  if actor_player_id = low_player_id then
    actor_lifecycle := low_lifecycle; target_lifecycle := high_lifecycle;
  else
    actor_lifecycle := high_lifecycle; target_lifecycle := low_lifecycle;
  end if;
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  perform private.assert_discovery_eligible_v1(target_lifecycle);
  perform private.assert_active_match_intent_v1(actor_player_id);

  if exists (
    select 1 from public.match_set_members_v1 members
    where members.set_id = p_set_id and members.player_id = p_target_player_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Target is already a Set member.');
  end if;

  select * into actor_profile from public.player_profiles_v1
  where id = (actor_lifecycle ->> 'profileId')::uuid;
  select * into target_profile from public.player_profiles_v1
  where id = (target_lifecycle ->> 'profileId')::uuid;
  if private.are_profiles_blocked(
    actor_profile.legacy_profile_id, target_profile.legacy_profile_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Relationship is blocked.');
  end if;

  select * into invite
  from public.match_set_invites_v1 invites
  where invites.set_id = p_set_id
    and invites.target_player_id = p_target_player_id
    and invites.state = 'pending'
  for update;
  if invite.id is not null then
    response_payload := jsonb_build_object(
      'inviteId', invite.id, 'state', 'pending', 'repeated', true
    );
    perform private.finish_command_v1(
      'create_set_invite_v1', actor_account_id, p_idempotency_key, response_payload
    );
    return response_payload;
  end if;

  insert into public.match_set_invites_v1 (
    set_id, actor_player_id, target_player_id, correlation_id
  ) values (
    p_set_id, actor_player_id, p_target_player_id, p_correlation_id
  ) returning * into invite;

  event_id := private.enqueue_contract_event_v1(
    'set.invite_created.v1', 'set_invite', invite.id, p_correlation_id, null,
    jsonb_build_object(
      'actorPlayerId', actor_player_id,
      'inviteId', invite.id,
      'setId', p_set_id,
      'targetPlayerId', p_target_player_id
    ),
    format('set.invite_created.v1:%s', invite.id)
  );
  perform private.enqueue_contract_event_v1(
    'notification.requested.v1', 'player', p_target_player_id,
    p_correlation_id, event_id,
    jsonb_build_object(
      'recipientPlayerId', p_target_player_id,
      'reasonCode', 'set_invite_created',
      'target', jsonb_build_object(
        'kind', 'set_invite', 'setId', p_set_id, 'inviteId', invite.id
      )
    ),
    format('notification.requested.v1:set_invite:%s', invite.id)
  );

  response_payload := jsonb_build_object(
    'inviteId', invite.id, 'state', 'pending', 'repeated', false
  );
  perform private.finish_command_v1(
    'create_set_invite_v1', actor_account_id, p_idempotency_key, response_payload
  );
  return response_payload;
end;
$$;

create or replace function public.request_set_join_v1(
  p_set_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_set_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_lifecycle jsonb;
  actor_player_id uuid;
  actor_profile public.player_profiles_v1%rowtype;
  owner_profile public.player_profiles_v1%rowtype;
  set_row public.match_sets_v1%rowtype;
  join_request public.match_set_join_requests_v1%rowtype;
  request_hash text;
  command_state record;
  response_payload jsonb;
  event_id uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;
  if p_set_id is null or p_correlation_id is null or p_expected_set_version is null then
    perform private.raise_core_error_v1('validation_failed', 'Set join command is incomplete.');
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id,
    'correlationId', p_correlation_id,
    'expectedSetVersion', p_expected_set_version
  ));
  select * into command_state
  from private.begin_command_v1(
    'request_set_join_v1', actor_account_id, p_idempotency_key, request_hash
  );
  if command_state.repeated then return command_state.response; end if;
  if not private.match_decision_writes_enabled_v1() then
    perform private.raise_core_error_v1('service_unavailable', 'Set writes are disabled.', true);
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1('player_not_found', 'Actor identity was not found.');
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match_set:' || p_set_id::text, 0)
  );
  select * into set_row from public.match_sets_v1 where id = p_set_id for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'Match Set was not found.');
  end if;
  if set_row.version <> p_expected_set_version then
    perform private.raise_core_error_v1('validation_failed', 'Match Set version changed.');
  end if;
  perform private.assert_match_set_open_v1(set_row);

  actor_lifecycle := public.get_player_lifecycle_snapshot_v1(actor_player_id, true);
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  perform private.assert_active_match_intent_v1(actor_player_id);
  if exists (
    select 1 from public.match_set_members_v1 members
    where members.set_id = p_set_id and members.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Player is already a Set member.');
  end if;

  select * into actor_profile from public.player_profiles_v1
  where id = (actor_lifecycle ->> 'profileId')::uuid;
  select * into owner_profile from public.player_profiles_v1
  where player_id = set_row.owner_player_id;
  if private.are_profiles_blocked(
    actor_profile.legacy_profile_id, owner_profile.legacy_profile_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Relationship is blocked.');
  end if;

  select * into join_request
  from public.match_set_join_requests_v1 requests
  where requests.set_id = p_set_id
    and requests.requester_player_id = actor_player_id
    and requests.state = 'pending'
  for update;
  if join_request.id is not null then
    response_payload := jsonb_build_object(
      'joinRequestId', join_request.id, 'state', 'pending', 'repeated', true
    );
    perform private.finish_command_v1(
      'request_set_join_v1', actor_account_id, p_idempotency_key, response_payload
    );
    return response_payload;
  end if;

  insert into public.match_set_join_requests_v1 (
    set_id, requester_player_id, correlation_id
  ) values (
    p_set_id, actor_player_id, p_correlation_id
  ) returning * into join_request;

  event_id := private.enqueue_contract_event_v1(
    'set.join_requested.v1', 'set_join_request', join_request.id,
    p_correlation_id, null,
    jsonb_build_object(
      'joinRequestId', join_request.id,
      'requesterPlayerId', actor_player_id,
      'setId', p_set_id
    ),
    format('set.join_requested.v1:%s', join_request.id)
  );
  perform private.enqueue_contract_event_v1(
    'notification.requested.v1', 'player', set_row.owner_player_id,
    p_correlation_id, event_id,
    jsonb_build_object(
      'recipientPlayerId', set_row.owner_player_id,
      'reasonCode', 'set_join_requested',
      'target', jsonb_build_object(
        'kind', 'set_join_request',
        'setId', p_set_id,
        'joinRequestId', join_request.id
      )
    ),
    format('notification.requested.v1:set_join:%s', join_request.id)
  );

  response_payload := jsonb_build_object(
    'joinRequestId', join_request.id, 'state', 'pending', 'repeated', false
  );
  perform private.finish_command_v1(
    'request_set_join_v1', actor_account_id, p_idempotency_key, response_payload
  );
  return response_payload;
end;
$$;

alter table public.match_sets_v1 enable row level security;
alter table public.match_set_members_v1 enable row level security;
alter table public.match_set_invites_v1 enable row level security;
alter table public.match_set_join_requests_v1 enable row level security;

revoke all on table public.match_sets_v1 from public, anon, authenticated;
revoke all on table public.match_set_members_v1 from public, anon, authenticated;
revoke all on table public.match_set_invites_v1 from public, anon, authenticated;
revoke all on table public.match_set_join_requests_v1 from public, anon, authenticated;
revoke all on table private.set_discovery_snapshots_v1 from public, anon, authenticated;
revoke all on table private.set_discovery_snapshot_candidates_v1 from public, anon, authenticated;
revoke all on table private.set_discovery_cursors_v1 from public, anon, authenticated;
grant all on table private.set_discovery_snapshots_v1 to service_role;
grant all on table private.set_discovery_snapshot_candidates_v1 to service_role;
grant all on table private.set_discovery_cursors_v1 to service_role;

revoke execute on function private.match_set_snapshot_v1(uuid) from public, anon, authenticated;
revoke execute on function private.assert_active_match_intent_v1(uuid) from public, anon, authenticated;
revoke execute on function private.assert_match_set_open_v1(public.match_sets_v1) from public, anon, authenticated;
revoke execute on function private.create_set_discovery_snapshot_v1(uuid, uuid, public.match_intents_v1) from public, anon, authenticated;
revoke execute on function public.list_discovery_sets_v1(uuid, integer) from public, anon;
revoke execute on function public.create_set_invite_v1(uuid, uuid, text, uuid, bigint) from public, anon;
revoke execute on function public.request_set_join_v1(uuid, text, uuid, bigint) from public, anon;
grant execute on function public.list_discovery_sets_v1(uuid, integer) to authenticated;
grant execute on function public.create_set_invite_v1(uuid, uuid, text, uuid, bigint) to authenticated;
grant execute on function public.request_set_join_v1(uuid, text, uuid, bigint) to authenticated;
