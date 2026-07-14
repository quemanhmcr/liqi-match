-- These authorized read surfaces call session/identity helpers declared
-- VOLATILE (and some may lock provider rows in other call modes). Mark the
-- public routines accurately so PostgreSQL does not assume statement-stable
-- results across authentication or lifecycle changes.

alter function public.can_access_conversation_media_v1(uuid) volatile;
alter function public.can_subscribe_conversation_v1(text) volatile;
alter function public.get_conversation_inbox_page_v1(integer, timestamptz, uuid) volatile;
alter function public.get_conversation_inbox_v1(integer, timestamptz, uuid) volatile;
alter function public.get_conversation_read_state_v1(uuid) volatile;
alter function public.get_conversation_surface_v1(uuid) volatile;
alter function public.get_conversation_timeline_v1(uuid, integer, bigint, bigint) volatile;
alter function public.get_conversation_unread_summary_v1() volatile;
alter function public.get_match_funnel_metrics_v1(integer) volatile;
