create extension if not exists pgtap with schema extensions;

begin;

select plan(31);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000801', 'authenticated', 'authenticated', 'set-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000802', 'authenticated', 'authenticated', 'set-b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000803', 'authenticated', 'authenticated', 'set-c@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000804', 'authenticated', 'authenticated', 'set-d@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000805', 'authenticated', 'authenticated', 'set-e@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000801', 'Set A'),
  ('00000000-0000-0000-0000-000000000802', 'Set B'),
  ('00000000-0000-0000-0000-000000000803', 'Set C'),
  ('00000000-0000-0000-0000-000000000804', 'Set D'),
  ('00000000-0000-0000-0000-000000000805', 'Set E');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000801', '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000801', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000802', '00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000802', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000803', '00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000803', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000804', '00000000-0000-0000-0000-000000000804', '00000000-0000-0000-0000-000000000804', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000805', '00000000-0000-0000-0000-000000000805', '00000000-0000-0000-0000-000000000805', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000801', '20000000-0000-4000-8000-000000000801', '00000000-0000-0000-0000-000000000801', 1, now()),
  ('30000000-0000-4000-8000-000000000802', '20000000-0000-4000-8000-000000000802', '00000000-0000-0000-0000-000000000802', 1, now()),
  ('30000000-0000-4000-8000-000000000803', '20000000-0000-4000-8000-000000000803', '00000000-0000-0000-0000-000000000803', 1, now()),
  ('30000000-0000-4000-8000-000000000804', '20000000-0000-4000-8000-000000000804', '00000000-0000-0000-0000-000000000804', 1, now()),
  ('30000000-0000-4000-8000-000000000805', '20000000-0000-4000-8000-000000000805', '00000000-0000-0000-0000-000000000805', 1, now());

insert into public.match_intents_v1 (
  id, player_id, state, filters, version, activated_at, expires_at
) values
  ('10000000-0000-4000-8000-000000000801', '20000000-0000-4000-8000-000000000801', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000802', '20000000-0000-4000-8000-000000000802', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000803', '20000000-0000-4000-8000-000000000803', 'active', '{"intentKind":"rank","mode":"ranked","partyFormat":"full_team","sessionPlan":"long","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000804', '20000000-0000-4000-8000-000000000804', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000805', '20000000-0000-4000-8000-000000000805', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour');

insert into public.match_sets_v1 (
  id, owner_player_id, title, capacity, intent_kind, state, version, created_at
) values
  ('a1000000-0000-4000-8000-000000000801', '20000000-0000-4000-8000-000000000801', 'Normal duo', 3, 'normal', 'open', 1, '2026-07-14T08:03:00Z'),
  ('a1000000-0000-4000-8000-000000000803', '20000000-0000-4000-8000-000000000803', 'Rank squad', 3, 'rank', 'open', 1, '2026-07-14T08:02:00Z'),
  ('a1000000-0000-4000-8000-000000000804', '20000000-0000-4000-8000-000000000803', 'Full set', 2, 'normal', 'full', 1, '2026-07-14T08:01:00Z'),
  ('a1000000-0000-4000-8000-000000000805', '20000000-0000-4000-8000-000000000805', 'Blocked owner', 3, 'normal', 'open', 1, '2026-07-14T08:04:00Z');

insert into public.match_set_members_v1 (set_id, player_id, role)
values
  ('a1000000-0000-4000-8000-000000000801', '20000000-0000-4000-8000-000000000801', 'owner'),
  ('a1000000-0000-4000-8000-000000000803', '20000000-0000-4000-8000-000000000803', 'owner'),
  ('a1000000-0000-4000-8000-000000000804', '20000000-0000-4000-8000-000000000803', 'owner'),
  ('a1000000-0000-4000-8000-000000000804', '20000000-0000-4000-8000-000000000804', 'member'),
  ('a1000000-0000-4000-8000-000000000805', '20000000-0000-4000-8000-000000000805', 'owner');

insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000805');

update private.match_authority_config_v1
set reads_enabled = true,
    decision_writes_enabled = true,
    emergency_stop = false;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);

create temporary table set_page_one as
select public.list_discovery_sets_v1(null, 1) as response;
create temporary table set_page_two as
select public.list_discovery_sets_v1(
  (select (response ->> 'nextCursor')::uuid from set_page_one), 1
) as response;
create temporary table set_page_two_retry as
select public.list_discovery_sets_v1(
  (select (response ->> 'nextCursor')::uuid from set_page_one), 1
) as response;

select is((select jsonb_array_length(response -> 'items') from set_page_one), 1, 'first Set page obeys limit');
select is((select response #>> '{items,0,set,setId}' from set_page_one), 'a1000000-0000-4000-8000-000000000801', 'intent-overlap Set ranks first');
select is((select response #>> '{items,0,set,intentKind}' from set_page_one), 'normal', 'Set snapshot exposes intent kind');
select is((select (response #>> '{items,0,capabilities,canRequestJoin}')::boolean from set_page_one), true, 'new candidate can request join');
select ok((select response ->> 'nextCursor' from set_page_one) is not null, 'first Set page has opaque cursor');
select is(
  (select (response #>> '{snapshot,intentVersion}')::integer from set_page_one),
  1,
  'Set snapshot binds pagination to the active Match Intent version'
);
select is((select response #>> '{items,0,set,setId}' from set_page_two), 'a1000000-0000-4000-8000-000000000803', 'second page contains remaining open Set');
select is((select response from set_page_two_retry), (select response from set_page_two), 'Set cursor retry is semantically identical');
select is((select count(*)::integer from private.set_discovery_snapshot_candidates_v1), 2, 'full and blocked Sets are excluded');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);

create temporary table invite_first as
select public.create_set_invite_v1(
  'a1000000-0000-4000-8000-000000000801',
  '20000000-0000-4000-8000-000000000804',
  'set-invite-command-000000000001',
  '70000000-0000-4000-8000-000000000801',
  1
) as receipt;
create temporary table invite_retry as
select public.create_set_invite_v1(
  'a1000000-0000-4000-8000-000000000801',
  '20000000-0000-4000-8000-000000000804',
  'set-invite-command-000000000001',
  '70000000-0000-4000-8000-000000000801',
  1
) as receipt;
create temporary table invite_semantic_duplicate as
select public.create_set_invite_v1(
  'a1000000-0000-4000-8000-000000000801',
  '20000000-0000-4000-8000-000000000804',
  'set-invite-command-000000000002',
  '70000000-0000-4000-8000-000000000802',
  1
) as receipt;

select is((select receipt ->> 'state' from invite_first), 'pending', 'invite command creates pending invite');
select is((select receipt ->> 'setId' from invite_first), 'a1000000-0000-4000-8000-000000000801', 'invite receipt carries canonical SetId');
select is((select receipt ->> 'targetPlayerId' from invite_first), '20000000-0000-4000-8000-000000000804', 'invite receipt carries target PlayerId');
select ok((select receipt ? 'createdAt' from invite_first), 'invite receipt carries creation time');
select is((select (receipt ->> 'repeated')::boolean from invite_retry), true, 'idempotency retry replays invite receipt');
select is((select (receipt ->> 'repeated')::boolean from invite_semantic_duplicate), true, 'new key returns existing pending invite semantic result');
select is((select count(*)::integer from public.match_set_invites_v1), 1, 'duplicate invite creates one row');
select is((select count(*)::integer from private.outbox_events where event_type = 'set.invite_created.v1'), 1, 'invite emits one transactional event');
select is((select count(*)::integer from private.outbox_events where event_type = 'notification.requested.v1' and payload ->> 'reasonCode' = 'set_invite_created'), 1, 'invite emits one notification request');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);

create temporary table join_first as
select public.request_set_join_v1(
  'a1000000-0000-4000-8000-000000000801',
  'set-join-command-000000000001',
  '70000000-0000-4000-8000-000000000803',
  1
) as receipt;
create temporary table join_duplicate as
select public.request_set_join_v1(
  'a1000000-0000-4000-8000-000000000801',
  'set-join-command-000000000002',
  '70000000-0000-4000-8000-000000000804',
  1
) as receipt;

select is((select receipt ->> 'state' from join_first), 'pending', 'join command creates pending request');
select is((select receipt ->> 'setId' from join_first), 'a1000000-0000-4000-8000-000000000801', 'join receipt carries canonical SetId');
select ok((select receipt ? 'createdAt' from join_first), 'join receipt carries creation time');
select is((select receipt ->> 'setId' from join_duplicate), 'a1000000-0000-4000-8000-000000000801', 'semantic join replay preserves canonical SetId');
select is((select (receipt ->> 'repeated')::boolean from join_duplicate), true, 'duplicate join request returns same semantic result');
select is((select count(*)::integer from public.match_set_join_requests_v1), 1, 'duplicate join request creates one row');
select is((select count(*)::integer from private.outbox_events where event_type = 'set.join_requested.v1'), 1, 'join emits one transactional event');
select is((select count(*)::integer from private.outbox_events where event_type = 'notification.requested.v1' and payload ->> 'reasonCode' = 'set_join_requested'), 1, 'join emits one owner notification request');

select throws_like(
  $$select public.request_set_join_v1(
    'a1000000-0000-4000-8000-000000000804',
    'set-join-command-000000000003',
    '70000000-0000-4000-8000-000000000805',
    1
  )$$,
  '%Match Set is full%',
  'full Set rejects join request'
);
select throws_like(
  $$select public.request_set_join_v1(
    'a1000000-0000-4000-8000-000000000803',
    'set-join-command-000000000004',
    '70000000-0000-4000-8000-000000000806',
    99
  )$$,
  '%Match Set version changed%',
  'stale Set version rejects command'
);

reset role;
update public.players
set lifecycle_state = 'suspended', discoverable = false, messaging_allowed = false,
    lifecycle_version = lifecycle_version + 1
where id = '20000000-0000-4000-8000-000000000802';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
select throws_like(
  $$select public.request_set_join_v1(
    'a1000000-0000-4000-8000-000000000803',
    'set-join-command-000000000005',
    '70000000-0000-4000-8000-000000000807',
    1
  )$$,
  '%player_suspended%',
  'join command rechecks lifecycle after candidate read'
);

select is((select count(*)::integer from public.match_set_members_v1 where player_id = '20000000-0000-4000-8000-000000000802'), 0, 'invite/join commands never mutate membership');
select is((select count(*)::integer from public.matches where source_v1 in ('set_join', 'invite_accept')), 0, 'pending Set commands never create Match semantics');

reset role;
select * from finish();
rollback;
