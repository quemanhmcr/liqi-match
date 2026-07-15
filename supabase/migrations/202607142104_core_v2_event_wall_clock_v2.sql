-- Core V2 event occurredAt must represent the wall-clock emission time.
-- PostgreSQL now() is transaction-stable and can precede a domain timestamp
-- produced later in the same orchestration transaction.

create or replace function private.enqueue_contract_event_v2(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_aggregate_version bigint,
  p_actor_player_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_payload jsonb,
  p_deduplication_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid := extensions.gen_random_uuid();
  occurred_at_value timestamptz := clock_timestamp();
  persisted_event_id uuid;
begin
  if p_aggregate_version is null or p_aggregate_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Core V2 event aggregateVersion must be positive.'
    );
  end if;

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
      'eventVersion', 2,
      'aggregateType', p_aggregate_type,
      'aggregateId', p_aggregate_id,
      'aggregateVersion', p_aggregate_version,
      'actorPlayerId', p_actor_player_id,
      'correlationId', p_correlation_id,
      'causationId', p_causation_id,
      'occurredAt', occurred_at_value,
      'payload', coalesce(p_payload, '{}'::jsonb)
    ),
    p_correlation_id,
    p_causation_id,
    p_deduplication_key,
    2
  )
  on conflict (deduplication_key) do update
    set deduplication_key = excluded.deduplication_key
  returning id into persisted_event_id;

  return persisted_event_id;
end;
$$;
