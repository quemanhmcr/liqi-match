-- Per-consumer lifecycle dispatch for Mission 2. This worker never changes the
-- shared outbox processed_at/status because other bounded contexts consume the
-- same player lifecycle events independently.

create or replace function public.process_pending_match_intent_lifecycle_events_v1(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  projection_response jsonb;
  selected_count integer := 0;
  processed_count integer := 0;
  repeated_count integer := 0;
  failed_count integer := 0;
  processed_event_ids jsonb := '[]'::jsonb;
  failures jsonb := '[]'::jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Lifecycle dispatch limit must be between 1 and 100.'
    );
  end if;

  for event_row in
    select events.id, events.payload
    from private.outbox_events events
    where events.contract_version = 1
      and events.event_type in (
        'player.suspended.v1',
        'player.resumed.v1'
      )
      and events.available_at <= now()
      and not exists (
        select 1
        from private.match_intent_lifecycle_projection_receipts_v1 receipts
        where receipts.event_id = events.id
      )
    order by events.created_at, events.id
    limit p_limit
    for update of events skip locked
  loop
    selected_count := selected_count + 1;
    begin
      projection_response := public.apply_player_lifecycle_to_match_intent_v1(
        event_row.payload
      );
      processed_count := processed_count + 1;
      repeated_count := repeated_count
        + case
            when coalesce((projection_response ->> 'repeated')::boolean, false)
            then 1
            else 0
          end;
      processed_event_ids := processed_event_ids || jsonb_build_array(event_row.id);
    exception when others then
      failed_count := failed_count + 1;
      failures := failures || jsonb_build_array(
        jsonb_build_object(
          'eventId', event_row.id,
          'message', sqlerrm,
          'sqlstate', sqlstate
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'failedCount', failed_count,
    'failures', failures,
    'processedCount', processed_count,
    'processedEventIds', processed_event_ids,
    'repeatedCount', repeated_count,
    'selectedCount', selected_count
  );
end;
$$;

comment on function public.process_pending_match_intent_lifecycle_events_v1(integer) is
  'Processes pending suspended/resumed events for the Match Intent consumer using per-consumer receipts; does not claim the shared outbox globally.';

revoke all on function public.process_pending_match_intent_lifecycle_events_v1(integer)
  from public, anon, authenticated;
grant execute on function public.process_pending_match_intent_lifecycle_events_v1(integer)
  to service_role;
