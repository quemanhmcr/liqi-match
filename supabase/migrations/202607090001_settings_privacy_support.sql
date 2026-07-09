-- Settings page support.
-- 1) Users can manage profile_habits soft settings stored in media_summary.settings.
-- 2) Users can read profile rows they have blocked, so the blocked-users settings page
--    can render names/avatars for self-managed block entries.

grant select, insert, update on public.profile_habits to authenticated;

drop policy if exists "Profiles are readable when discoverable or own" on public.profiles;
create policy "Profiles are readable when discoverable or own"
on public.profiles for select
to authenticated
using (
  deleted_at is null
  and (
    id = auth.uid()
    or exists (
      select 1
      from public.blocks b
      where b.blocker_id = auth.uid()
        and b.blocked_id = profiles.id
    )
    or (
      is_discoverable
      and not private.are_profiles_blocked(auth.uid(), id)
    )
  )
);
