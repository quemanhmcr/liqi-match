-- Supabase cloud default table privileges can grant broad access to newly
-- created public tables. Reassert the intended onboarding/profile settings
-- boundary explicitly: anon has no table access, authenticated users rely on
-- RLS with only the operations used by the app, and service_role retains
-- operational authority.

revoke all on table public.profile_habits from anon, authenticated;
grant select, insert, update on table public.profile_habits to authenticated;
grant all on table public.profile_habits to service_role;
