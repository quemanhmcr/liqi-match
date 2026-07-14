-- Identity hardening revoked every private function after the original RLS
-- helper grants were established. Restore only the three SECURITY DEFINER
-- helpers referenced by public RLS policies; no private table privileges are
-- granted.

grant usage on schema private to authenticated, service_role;
grant execute on function private.are_profiles_blocked(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.is_conversation_member(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.is_conversation_member_for_media(uuid, uuid)
  to authenticated, service_role;
