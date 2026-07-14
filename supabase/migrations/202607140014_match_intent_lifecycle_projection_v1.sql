-- Mission 2 projection of authoritative player lifecycle events. A suspended
-- player loses Match Intent eligibility immediately; resume eligibility is not
-- restored until both the active/discoverable snapshot and resumed event agree.

create table private.match_intent_lifecycle_gate_v1 (
  player_id uuid primary key references public.players(id) on delete cascade,
  lifecycle_version bigint not null check (lifecycle_version > 0),
  eligible boolean not null,
  source_event_id uuid not null unique,
  source_event_type text not null check (
    source_event_type in ('player.suspended.v1', 'player.resumed.v1')
  ),
  updated_at timestamptz not null default now()
);

create table private.match_intent_lifecycle_projection_receipts_v1 (
  event_id uuid primary key,
  request_hash text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  lifecycle_version bigint not null check (lifecycle_version > 0),
  event_type text not null check (
    event_type in ('player.suspended.v1', 'player.resumed.v1')
  ),
  response jsonb not null,
  processed_at timestamptz not null default now()
);

revoke all on private.match_intent_lifecycle_gate_v1
  from public, anon, authenticated;
revoke all on private.match_intent_lifecycle_projection_receipts_v1
  from public, anon, authenticated;
grant all on private.match_intent_lifecycle_gate_v1 to service_role;
grant all on private.match_intent_lifecycle_projection_receipts_v1 to service_role;

create or replace function private.is_match_intent_lifecycle_projection_ready_v1(
  p_player_id uuid,
  p_lifecycle_version bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_player_id is null or p_lifecycle_version is null then false
    when gate.player_id is null then true
    else gate.lifecycle_version = p_lifecycle_version and gate.eligible
  end
  from (select 1) singleton
  left join private.match_intent_lifecycle_gate_v1 gate
    on gate.player_id = p_player_id
$$;

create or replace function public.apply_player_lifecycle_to_match_intent_v1(
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  event_type_value text;
  aggregate_id_value uuid;
  player_id_value uuid;
  account_id_value uuid;
  profile_id_value uuid;
  lifecycle_version_value bigint;
  request_hash_value text;
  existing_receipt private.match_intent_lifecycle_projection_receipts_v1%rowtype;
  lifecycle_snapshot jsonb;
  current_lifecycle_version bigint;
  current_lifecycle_state text;
  current_discoverable boolean;
  intent_row public.match_intents_v1%rowtype;
  result_code_value text;
  eligibility_restored_value boolean := false;
  response_payload jsonb;
begin
  if jsonb_typeof(p_event) is distinct from 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Lifecycle projection event must be a JSON object.'
    );
  end if;

  begin
    event_id_value := (p_event ->> 'eventId')::uuid;
    event_type_value := p_event ->> 'eventType';
    aggregate_id_value := (p_event ->> 'aggregateId')::uuid;
    player_id_value := (p_event #>> '{data,playerId}')::uuid;
    account_id_value := (p_event #>> '{data,accountId}')::uuid;
    profile_id_value := (p_event #>> '{data,profileId}')::uuid;
    lifecycle_version_value := (p_event #>> '{data,lifecycleVersion}')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Lifecycle projection event identifiers are invalid.'
    );
  end;

  if event_id_value is null
    or event_type_value not in ('player.suspended.v1', 'player.resumed.v1')
    or p_event ->> 'aggregateType' <> 'player'
    or aggregate_id_value is distinct from player_id_value
    or account_id_value is null
    or profile_id_value is null
    or lifecycle_version_value is null
    or lifecycle_version_value <= 0
    or nullif(p_event #>> '{data,reasonCode}', '') is null
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Lifecycle projection event does not satisfy Core V1 semantics.'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match_intent_lifecycle:' || event_id_value::text, 0)
  );

  request_hash_value := private.command_request_hash_v1(p_event);
  select * into existing_receipt
  from private.match_intent_lifecycle_projection_receipts_v1 receipts
  where receipts.event_id = event_id_value;

  if existing_receipt.event_id is not null then
    if existing_receipt.request_hash <> request_hash_value then
      perform private.raise_core_error_v1(
        'idempotency_conflict',
        'Lifecycle eventId was reused with a different payload.'
      );
    end if;
    return existing_receipt.response || jsonb_build_object('repeated', true);
  end if;

  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
    player_id_value,
    true
  );
  if lifecycle_snapshot is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'Lifecycle projection player was not found.'
    );
  end if;

  current_lifecycle_version := (
    lifecycle_snapshot ->> 'version'
  )::bigint;
  current_lifecycle_state := lifecycle_snapshot ->> 'state';
  current_discoverable := (
    lifecycle_snapshot ->> 'discoverable'
  )::boolean;

  if current_lifecycle_version < lifecycle_version_value then
    perform private.raise_core_error_v1(
      'lifecycle_version_conflict',
      'Lifecycle event is ahead of the authoritative snapshot.',
      true,
      jsonb_build_object(
        'eventVersion', lifecycle_version_value,
        'snapshotVersion', current_lifecycle_version
      )
    );
  elsif current_lifecycle_version > lifecycle_version_value then
    result_code_value := 'stale_event';
  elsif event_type_value = 'player.suspended.v1'
    and current_lifecycle_state <> 'suspended'
  then
    perform private.raise_core_error_v1(
      'invalid_lifecycle_transition',
      'Suspended event does not match the authoritative lifecycle snapshot.'
    );
  elsif event_type_value = 'player.resumed.v1'
    and current_lifecycle_state <> 'active'
  then
    perform private.raise_core_error_v1(
      'invalid_lifecycle_transition',
      'Resumed event does not match the authoritative lifecycle snapshot.'
    );
  else
    select * into intent_row
    from public.match_intents_v1 intents
    where intents.player_id = player_id_value
    for update;

    if intent_row.id is not null and intent_row.state = 'active' then
      update public.match_intents_v1
      set state = 'paused',
          version = version + 1,
          activated_at = null,
          expires_at = null
      where id = intent_row.id
      returning * into intent_row;

      result_code_value := case event_type_value
        when 'player.suspended.v1' then 'paused_by_suspension'
        else 'paused_before_resume_eligibility'
      end;
    elsif intent_row.id is null then
      result_code_value := case event_type_value
        when 'player.suspended.v1' then 'suspended_without_intent'
        else 'resumed_without_intent'
      end;
    else
      result_code_value := case event_type_value
        when 'player.suspended.v1' then 'intent_already_inactive'
        else 'intent_remains_inactive'
      end;
    end if;

    eligibility_restored_value := event_type_value = 'player.resumed.v1'
      and current_lifecycle_state = 'active'
      and current_discoverable;

    insert into private.match_intent_lifecycle_gate_v1 (
      player_id,
      lifecycle_version,
      eligible,
      source_event_id,
      source_event_type,
      updated_at
    ) values (
      player_id_value,
      lifecycle_version_value,
      eligibility_restored_value,
      event_id_value,
      event_type_value,
      now()
    )
    on conflict (player_id) do update
      set lifecycle_version = excluded.lifecycle_version,
          eligible = excluded.eligible,
          source_event_id = excluded.source_event_id,
          source_event_type = excluded.source_event_type,
          updated_at = excluded.updated_at
    where private.match_intent_lifecycle_gate_v1.lifecycle_version
      <= excluded.lifecycle_version;
  end if;

  response_payload := jsonb_build_object(
    'eligibilityRestored', eligibility_restored_value,
    'eventId', event_id_value,
    'eventType', event_type_value,
    'lifecycleVersion', lifecycle_version_value,
    'matchIntent', case
      when intent_row.id is null then null
      else private.match_intent_snapshot_v1(intent_row.id)
    end,
    'playerId', player_id_value,
    'repeated', false,
    'resultCode', result_code_value
  );

  insert into private.match_intent_lifecycle_projection_receipts_v1 (
    event_id,
    request_hash,
    player_id,
    lifecycle_version,
    event_type,
    response
  ) values (
    event_id_value,
    request_hash_value,
    player_id_value,
    lifecycle_version_value,
    event_type_value,
    response_payload
  );

  return response_payload;
end;
$$;

comment on function public.apply_player_lifecycle_to_match_intent_v1(jsonb) is
  'Idempotently projects Core V1 suspended/resumed events into Match Intent eligibility. Resume never auto-activates an intent.';

revoke all on function public.apply_player_lifecycle_to_match_intent_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_player_lifecycle_to_match_intent_v1(jsonb)
  to service_role;
