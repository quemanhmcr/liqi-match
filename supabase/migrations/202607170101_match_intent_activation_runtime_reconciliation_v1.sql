-- Reconcile the Match Intent activation RPC for databases that deployed the
-- historical integer overload and later removed it before the canonical bigint
-- command contract was introduced. The function body matches the current
-- authoritative migration and is additive for PostgREST consumers.

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

comment on function public.activate_match_intent_v1(jsonb, text, bigint) is
  'Activates the authoritative Match Intent after command-time lifecycle enforcement.';

revoke execute on function public.activate_match_intent_v1(jsonb, text, bigint)
  from public, anon;
grant execute on function public.activate_match_intent_v1(jsonb, text, bigint)
  to authenticated;
