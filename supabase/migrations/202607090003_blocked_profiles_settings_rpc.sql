-- Keep discoverability RLS strict while still allowing users to manage their
-- own blocked-users list in Settings.

create or replace function public.list_blocked_profiles()
returns table (
  blocked_id uuid,
  created_at timestamptz,
  reason text,
  display_name text,
  avatar_media_id uuid,
  deleted_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    b.blocked_id,
    b.created_at,
    b.reason,
    p.display_name,
    p.avatar_media_id,
    p.deleted_at
  from public.blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke execute on function public.list_blocked_profiles() from public, anon;
grant execute on function public.list_blocked_profiles() to authenticated;

drop policy if exists "Profiles are readable when discoverable or own" on public.profiles;
create policy "Profiles are readable when discoverable or own"
on public.profiles for select
to authenticated
using (
  deleted_at is null
  and (
    id = auth.uid()
    or (
      is_discoverable
      and not private.are_profiles_blocked(auth.uid(), id)
    )
  )
);
