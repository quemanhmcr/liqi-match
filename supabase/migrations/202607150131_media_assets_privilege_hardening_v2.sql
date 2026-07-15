-- Reassert the intended media metadata boundary on Supabase cloud. Client
-- uploads and lifecycle mutations flow through authoritative services/RPCs;
-- authenticated clients require SELECT only and anon has no table access.

revoke all on table public.media_assets from anon, authenticated;
grant select on table public.media_assets to authenticated;
grant all on table public.media_assets to service_role;
