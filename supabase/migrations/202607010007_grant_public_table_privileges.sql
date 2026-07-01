grant select on public.ranks to anon, authenticated;
grant select on public.roles to anon, authenticated;
grant select on public.heroes to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.game_profiles to authenticated;
grant select, insert, update, delete on public.profile_roles to authenticated;
grant select, insert, update, delete on public.profile_heroes to authenticated;
grant select, insert, update, delete on public.availability_slots to authenticated;
grant select, insert, update, delete on public.match_preferences to authenticated;

grant select on public.swipes to authenticated;
grant select on public.matches to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

grant select, insert, update on public.teams to authenticated;
grant select on public.team_members to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant select on public.media_assets to authenticated;
