create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on function public.are_profiles_blocked(uuid, uuid) from authenticated;
revoke execute on function public.is_conversation_member(uuid, uuid) from authenticated;
revoke execute on function public.is_conversation_member_for_media(uuid, uuid) from authenticated;

grant execute on function public.record_swipe(uuid, public.swipe_direction) to authenticated;
grant execute on function public.is_conversation_member_for_media(uuid, uuid) to service_role;
