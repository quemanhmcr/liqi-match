-- Migration 026 repaired a parallel integer overload, but migration 033
-- correctly removed that overload to keep PostgREST resolution unambiguous.
-- Recreate the surviving bigint authority with a collision-free PlayerId
-- variable so the canonical RPC itself is safe under PL/pgSQL name resolution.

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
  actor_player_id_value uuid;
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
  actor_player_id_value := (actor_identity ->> 'playerId')::uuid;

  if actor_player_id_value = p_target_player_id then
    perform private.raise_core_error_v1(
      'validation_failed',
      'A player cannot decide on themself.'
    );
  end if;

  low_player_id := least(actor_player_id_value, p_target_player_id);
  high_player_id := greatest(actor_player_id_value, p_target_player_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(low_player_id::text || ':' || high_player_id::text, 0)
  );

  -- The lifecycle provider owns row-lock semantics. Calling it for the low then
  -- high PlayerId keeps pair commands compatible with lifecycle transitions.
  low_lifecycle := public.get_player_lifecycle_snapshot_v1(low_player_id, true);
  high_lifecycle := public.get_player_lifecycle_snapshot_v1(high_player_id, true);

  if actor_player_id_value = low_player_id then
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

  perform private.expire_match_intent_v1(actor_player_id_value);
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
  where intents.player_id = actor_player_id_value;
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
  where decisions.actor_player_id = actor_player_id_value
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
    actor_player_id_value,
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
        'actorPlayerId', actor_player_id_value,
        'targetPlayerId', p_target_player_id
      ),
      format('player.liked.v1:%s:%s', relationship.id, relationship.version)
    );
  end if;

  if p_decision = 'like' and exists (
    select 1
    from public.relationship_decisions_v1 reciprocal
    where reciprocal.actor_player_id = p_target_player_id
      and reciprocal.target_player_id = actor_player_id_value
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

revoke execute on function public.record_player_decision_v1(
  uuid, public.relationship_decision_v1, text, uuid, bigint, bigint
) from public, anon;
grant execute on function public.record_player_decision_v1(
  uuid, public.relationship_decision_v1, text, uuid, bigint, bigint
) to authenticated;

comment on function public.record_player_decision_v1(
  uuid, public.relationship_decision_v1, text, uuid, bigint, bigint
) is 'Records like/pass through the canonical bigint authority with deterministic lifecycle locking and collision-free PL/pgSQL identifiers.';
