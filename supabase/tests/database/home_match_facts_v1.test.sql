create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000401', 'authenticated', 'authenticated', 'home-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000402', 'authenticated', 'authenticated', 'home-b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000403', 'authenticated', 'authenticated', 'home-c@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000404', 'authenticated', 'authenticated', 'home-d@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000405', 'authenticated', 'authenticated', 'legacy-only@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000401', 'Home A'),
  ('00000000-0000-0000-0000-000000000402', 'Minh Anh'),
  ('00000000-0000-0000-0000-000000000403', 'Home C'),
  ('00000000-0000-0000-0000-000000000404', 'Home D'),
  ('00000000-0000-0000-0000-000000000405', 'Legacy Only');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000401', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000402', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000402', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000403', '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000403', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000404', '00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000404', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000401', 3, now()),
  ('30000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000402', '00000000-0000-0000-0000-000000000402', 4, now()),
  ('30000000-0000-4000-8000-000000000403', '20000000-0000-4000-8000-000000000403', '00000000-0000-0000-0000-000000000403', 5, now()),
  ('30000000-0000-4000-8000-000000000404', '20000000-0000-4000-8000-000000000404', '00000000-0000-0000-0000-000000000404', 6, now());

insert into public.ranks (id, slug, name, sort_order)
values ('40000000-0000-4000-8000-000000000401', 'cao_thu_home', 'Cao Thủ', 9401);
insert into public.roles (id, slug, name)
values ('50000000-0000-4000-8000-000000000401', 'support_home', 'Trợ Thủ');
insert into public.game_profiles (profile_id, rank_id, handle)
values ('00000000-0000-0000-0000-000000000402', '40000000-0000-4000-8000-000000000401', 'minh-anh');
insert into public.profile_roles (profile_id, role_id)
values ('00000000-0000-0000-0000-000000000402', '50000000-0000-4000-8000-000000000401');

insert into public.matches (
  id, profile_low_id, profile_high_id, player_low_id, player_high_id,
  source_v1, correlation_id_v1, home_kind_v1, home_status_v1, created_at
) values
  (
    '60000000-0000-4000-8000-000000000401',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000402',
    '20000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000402',
    'mutual_like', '70000000-0000-4000-8000-000000000401',
    'rank', 'conversation_ready', '2026-07-14T08:05:00Z'
  ),
  (
    '60000000-0000-4000-8000-000000000402',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000403',
    '20000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000403',
    'set_join', '70000000-0000-4000-8000-000000000402',
    'team_rank', 'conversation_pending', '2026-07-14T08:04:00Z'
  ),
  (
    '60000000-0000-4000-8000-000000000403',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000404',
    '20000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000404',
    'invite_accept', '70000000-0000-4000-8000-000000000403',
    'set_love', 'closed', '2026-07-14T08:03:00Z'
  ),
  (
    '60000000-0000-4000-8000-000000000405',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000405',
    null, null, null, null, null, null, '2026-07-14T08:02:00Z'
  );

insert into public.conversations (id, match_id)
values
  ('90000000-0000-4000-8000-000000000401', '60000000-0000-4000-8000-000000000401'),
  ('90000000-0000-4000-8000-000000000402', '60000000-0000-4000-8000-000000000402'),
  ('90000000-0000-4000-8000-000000000403', '60000000-0000-4000-8000-000000000403');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);

create temporary table home_facts as
select public.list_home_match_facts_v1() as response;

select is((select jsonb_array_length(response -> 'items') from home_facts), 3, 'legacy-only Match rows are excluded');
select is((select response #>> '{items,0,matchId}' from home_facts), '60000000-0000-4000-8000-000000000401', 'facts are ordered by persisted creation time');
select is((select (response #>> '{items,0,canMessage}')::boolean from home_facts), true, 'conversation_ready with persisted conversation can message');
select is((select response #>> '{items,0,conversationId}' from home_facts), '90000000-0000-4000-8000-000000000401', 'ready fact exposes canonical ConversationId');
select is((select response #>> '{items,0,kind}' from home_facts), 'rank', 'kind comes from persisted Match authority');
select is((select response #>> '{items,0,source}' from home_facts), 'mutual_like', 'source comes from persisted Match authority');
select is((select response #>> '{items,0,participantIds,0}' from home_facts), '20000000-0000-4000-8000-000000000401', 'participants remain in canonical PlayerId order');
select is((select response #>> '{items,0,opponent,playerId}' from home_facts), '20000000-0000-4000-8000-000000000402', 'opponent uses semantic PlayerId');
select is((select response #>> '{items,0,opponent,profileId}' from home_facts), '30000000-0000-4000-8000-000000000402', 'opponent uses canonical ProfileId');
select is((select (response #>> '{items,0,opponent,profileVersion}')::integer from home_facts), 4, 'opponent snapshots authoritative profile version');
select is((select response #>> '{items,0,opponent,displayName}' from home_facts), 'Minh Anh', 'opponent presentation uses shared PlayerSummaryV1');
select is((select response #>> '{items,0,opponent,primaryRole,slug}' from home_facts), 'support_home', 'shared summary chooses deterministic primary role');
select is((select (response #>> '{items,1,canMessage}')::boolean from home_facts), false, 'pending Match cannot message');
select is((select response #>> '{items,1,conversationId}' from home_facts), null, 'pending Match hides a premature conversation row');
select is((select response #>> '{items,2,status}' from home_facts), 'closed', 'closed status is explicit rather than inferred');
select is((select (response #>> '{items,2,canMessage}')::boolean from home_facts), false, 'closed Match cannot message');
select ok(not ((select response #> '{items,0}' from home_facts) ? 'unreadCount'), 'Match facts do not own unread count');
select ok(not ((select response #> '{items,0}' from home_facts) ? 'online'), 'Match facts do not own presence');

reset role;
select * from finish();
rollback;
