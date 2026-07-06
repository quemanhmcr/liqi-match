-- RLS policies decide row visibility, but PostgREST also requires table
-- privileges. The app reads profile_habits as the post-login onboarding
-- completion marker, so authenticated users only need SELECT here.
grant select on public.profile_habits to authenticated;
