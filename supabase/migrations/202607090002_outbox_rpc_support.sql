-- Outbox writes from Edge Functions must not rely on exposing the private schema
-- through PostgREST. Keep private.outbox_events private and expose only a
-- narrow service-role RPC wrapper through the already-exposed public schema.
--
-- Do not replace private.enqueue_outbox here: that function already exists in
-- deployed migrations, and PostgreSQL does not allow renaming input parameters
-- with create or replace. The wrapper calls it positionally.

create or replace function public.enqueue_outbox_event(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.enqueue_outbox(
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.enqueue_outbox_event(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_outbox_event(text, text, uuid, jsonb) to service_role;
