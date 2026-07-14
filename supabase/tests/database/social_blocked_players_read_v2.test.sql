create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000012551', 'authenticated', 'authenticated', 'blocked-list-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000012552', 'authenticated', 'authenticated', 'blocked-list-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000012553', 'authenticated', 'authenticated', 'blocked-list-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('01000000-0000-4000-8000-000000012551', 'Blocked List A'),
  ('01000000-0000-4000-8000-000000012552', 'Blocked List B'),
  ('01000000-0000-4000-8000-000000012553', 'Blocked List C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000012551', '01000000-0000-4000-8000-000000012551', '01000000-0000-4000-8000-000000012551', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000012552', '01000000-0000-4000-8000-000000012552', '01000000-0000-4000-8000-000000012552', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000012553', '01000000-0000-4000-8000-000000012553', '01000000-0000-4000-8000-000000012553', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012551', '01000000-0000-4000-8000-000000012551', 1, now()),
  ('31000000-0000-4000-8000-000000012552', '21000000-0000-4000-8000-000000012552', '01000000-0000-4000-8000-000000012552', 1, now()),
  ('31000000-0000-4000-8000-000000012553', '21000000-0000-4000-8000-000000012553', '01000000-0000-4000-8000-000000012553', 1, now());

insert into public.social_relationships_v2 (
  id, player_low_id, player_high_id, version
) values
  (private.social_relationship_id_v2('21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012552'), '21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012552', 3),
  (private.social_relationship_id_v2('21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012553'), '21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012553', 4);

insert into public.player_blocks_v2 (
  relationship_id, blocker_player_id, blocked_player_id, active, version,
  reason_code, blocked_at
) values
  (private.social_relationship_id_v2('21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012552'), '21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012552', true, 1, 'user_safety', '2026-07-14T16:00:00Z'),
  (private.social_relationship_id_v2('21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012553'), '21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012553', true, 1, 'user_choice', '2026-07-14T16:05:00Z'),
  (private.social_relationship_id_v2('21000000-0000-4000-8000-000000012551', '21000000-0000-4000-8000-000000012552'), '21000000-0000-4000-8000-000000012552', '21000000-0000-4000-8000-000000012551', true, 1, 'user_choice', '2026-07-14T16:10:00Z');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000012551', true);

create temporary table first_page as
select public.list_blocked_players_v2(1, null) as page;

select is((select (page ->> 'contractVersion')::integer from first_page), 2, 'blocked list returns Core V2 contract version');
select is((select (page ->> 'totalCount')::integer from first_page), 2, 'blocked list reports the full viewer-owned active count');
select is((select page #>> '{items,0,player,playerId}' from first_page), '21000000-0000-4000-8000-000000012552', 'blocked list is ordered by canonical target PlayerId');
select is((select (page #>> '{items,0,relationship,block,viewerBlocksTarget}')::boolean from first_page), true, 'blocked row proves the viewer owns the block');
select is((select (page #>> '{items,0,relationship,capabilities,canUnblock}')::boolean from first_page), true, 'blocked row carries unblock capability');
select is((select page ->> 'nextCursor' from first_page), '21000000-0000-4000-8000-000000012552', 'blocked list returns a stable PlayerId cursor');

create temporary table second_page as
select public.list_blocked_players_v2(
  1,
  '21000000-0000-4000-8000-000000012552'
) as page;
select is((select page #>> '{items,0,player,displayName}' from second_page), 'Blocked List C', 'second page projects management display data');
select is((select page ->> 'nextCursor' from second_page), null, 'last page has no cursor');

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000012552', true);
create temporary table target_view as
select public.list_blocked_players_v2(50, null) as page;
select is((select (page ->> 'totalCount')::integer from target_view), 1, 'each account sees only blocks it owns');
select is((select page #>> '{items,0,player,playerId}' from target_view), '21000000-0000-4000-8000-000000012551', 'reverse directional block remains a separate private row');
select throws_like(
  $$select * from public.player_blocks_v2$$,
  '%permission denied%',
  'mobile clients cannot bypass the blocked-player RPC'
);

reset role;
update public.player_blocks_v2
set active = false, unblocked_at = now(), version = version + 1
where blocker_player_id = '21000000-0000-4000-8000-000000012551'
  and blocked_player_id = '21000000-0000-4000-8000-000000012553';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000012551', true);
select is(
  (public.list_blocked_players_v2(50, null) ->> 'totalCount')::integer,
  1,
  'inactive block rows are excluded after unblock'
);

select * from finish();
rollback;
