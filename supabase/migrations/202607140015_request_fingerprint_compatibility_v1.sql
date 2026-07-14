-- Compatibility seam for Conversation and transitional Match migrations.
-- The canonical hashing implementation remains command_request_hash_v1.

create or replace function private.request_fingerprint_v1(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.command_request_hash_v1(p_payload);
$$;

revoke all on function private.request_fingerprint_v1(jsonb)
  from public, anon, authenticated;
