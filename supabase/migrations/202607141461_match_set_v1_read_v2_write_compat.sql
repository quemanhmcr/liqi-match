-- Match Set mobile compatibility: preserve the stable Core V1 discovery/read
-- DTO while routing all new invite and join-request writes to Core V2 authority.
-- These wrappers do not dual-write legacy tables. Disabling Core V2 mutation
-- writes therefore rolls back new side effects while V1 discovery reads remain.

create or replace function private.match_set_compat_source_event_v2(
  p_receipt jsonb,
  p_expected_event_type text,
  p_expected_set_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  event_value jsonb;
begin
  begin
    event_id_value := (p_receipt #>> '{eventIds,0}')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'internal_error',
      'Core V2 Match Set receipt has no valid source EventId.'
    );
  end;

  select events.payload into event_value
  from private.outbox_events events
  where events.id = event_id_value;

  if event_value is null
    or event_value ->> 'eventType' <> p_expected_event_type
    or event_value ->> 'aggregateType' <> 'match_set'
    or (event_value ->> 'aggregateId')::uuid <> p_expected_set_id then
    perform private.raise_core_error_v1(
      'internal_error',
      'Core V2 Match Set receipt is not bound to its authoritative event.'
    );
  end if;
  return event_value;
end;
$$;

create or replace function public.create_set_invite_compat_v2(
  p_set_id uuid,
  p_target_player_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
  receipt_value jsonb;
  event_value jsonb;
  invite_id_value uuid;
  occurred_at_value timestamptz;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  receipt_value := public.invite_to_set_v2(
    p_set_id,
    p_target_player_id,
    p_idempotency_key,
    p_correlation_id,
    p_expected_version,
    p_audit
  );
  event_value := private.match_set_compat_source_event_v2(
    receipt_value,
    'set.invite_created.v2',
    p_set_id
  );

  begin
    invite_id_value := (event_value #>> '{payload,inviteId}')::uuid;
    occurred_at_value := (event_value ->> 'occurredAt')::timestamptz;
  exception when others then
    perform private.raise_core_error_v1(
      'internal_error',
      'Core V2 Set invite event cannot be adapted to the V1 mobile DTO.'
    );
  end;
  if (event_value #>> '{payload,inviterPlayerId}')::uuid <> actor_player_id
    or (event_value #>> '{payload,targetPlayerId}')::uuid <> p_target_player_id then
    perform private.raise_core_error_v1(
      'internal_error',
      'Core V2 Set invite event actor facts do not match the command.'
    );
  end if;

  return jsonb_build_object(
    'createdAt', occurred_at_value,
    'inviteId', invite_id_value,
    'repeated', coalesce((receipt_value ->> 'repeated')::boolean, false),
    'setId', p_set_id,
    'state', 'pending',
    'targetPlayerId', p_target_player_id
  );
end;
$$;

create or replace function public.request_set_join_compat_v2(
  p_set_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_version bigint,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
  receipt_value jsonb;
  event_value jsonb;
  request_id_value uuid;
  occurred_at_value timestamptz;
begin
  actor_mapping := private.resolve_party_session_actor_v2(false, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;
  receipt_value := public.request_set_join_v2(
    p_set_id,
    p_idempotency_key,
    p_correlation_id,
    p_expected_version,
    p_audit
  );
  event_value := private.match_set_compat_source_event_v2(
    receipt_value,
    'set.join_requested.v2',
    p_set_id
  );

  begin
    request_id_value := (event_value #>> '{payload,joinRequestId}')::uuid;
    occurred_at_value := (event_value ->> 'occurredAt')::timestamptz;
  exception when others then
    perform private.raise_core_error_v1(
      'internal_error',
      'Core V2 Set join event cannot be adapted to the V1 mobile DTO.'
    );
  end;
  if (event_value #>> '{payload,requesterPlayerId}')::uuid <> actor_player_id then
    perform private.raise_core_error_v1(
      'internal_error',
      'Core V2 Set join event actor facts do not match the command.'
    );
  end if;

  return jsonb_build_object(
    'createdAt', occurred_at_value,
    'joinRequestId', request_id_value,
    'repeated', coalesce((receipt_value ->> 'repeated')::boolean, false),
    'setId', p_set_id,
    'state', 'pending'
  );
end;
$$;

revoke execute on function private.match_set_compat_source_event_v2(jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function private.match_set_compat_source_event_v2(jsonb, text, uuid)
  to service_role;

revoke execute on function public.create_set_invite_compat_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) from public, anon;
revoke execute on function public.request_set_join_compat_v2(
  uuid, text, uuid, bigint, jsonb
) from public, anon;
grant execute on function public.create_set_invite_compat_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;
grant execute on function public.request_set_join_compat_v2(
  uuid, text, uuid, bigint, jsonb
) to authenticated, service_role;

comment on function public.create_set_invite_compat_v2(
  uuid, uuid, text, uuid, bigint, jsonb
) is 'V1 mobile DTO adapter backed only by Core V2 Set invite authority.';
comment on function public.request_set_join_compat_v2(
  uuid, text, uuid, bigint, jsonb
) is 'V1 mobile DTO adapter backed only by Core V2 Set join-request authority.';
