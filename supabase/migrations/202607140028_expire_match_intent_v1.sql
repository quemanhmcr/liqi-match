-- Lazily expire the authenticated player's Match Intent before Discovery reads.
-- The transition is idempotent: only an active intent whose deadline has passed
-- advances to expired and increments its aggregate version.

create or replace function private.expire_match_intent_v1(
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_player_id is null then
    return;
  end if;

  update public.match_intents_v1 as intent
  set state = 'expired',
      version = intent.version + 1
  where intent.player_id = p_player_id
    and intent.state = 'active'
    and intent.expires_at <= now();
end;
$$;

revoke execute on function private.expire_match_intent_v1(uuid)
  from public, anon, authenticated;
grant execute on function private.expire_match_intent_v1(uuid)
  to service_role;
