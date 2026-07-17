-- Reconcile Match Intent read/pause RPCs for databases that deployed the
-- historical production_match_authority_v1 before these contracts were folded
-- into its canonical migration. CREATE OR REPLACE is safe on current databases.

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

comment on function public.get_current_match_intent_v1() is
  'Returns the authenticated player current Match Intent after expiry reconciliation.';
comment on function public.pause_match_intent_v1(text, bigint) is
  'Pauses the authenticated player active Match Intent with optimistic concurrency.';

revoke execute on function public.get_current_match_intent_v1()
  from public, anon;
revoke execute on function public.pause_match_intent_v1(text, bigint)
  from public, anon;
grant execute on function public.get_current_match_intent_v1()
  to authenticated;
grant execute on function public.pause_match_intent_v1(text, bigint)
  to authenticated;
